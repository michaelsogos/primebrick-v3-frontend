import { ensureBackendOnlineOrThrow, noteGatewayFailure, probeHealth } from '$lib/backend-availability';
import { saveRedirectUrl } from '$lib/auth/redirect-cache';
import { sessionExpiredStore } from '$lib/auth/session-expired-store.svelte';
import { hasLocalSession, isTokenExpired, triggerRefresh } from '$lib/auth/session-check';
import { userProfileStore } from '$lib/user-profile-store.svelte';
import { pushNotification } from '$lib/errors/app-errors';
import {
  ApiDatabaseUnavailableError,
  ApiRedisUnavailableError,
  ApiUnreachableError,
  isUnreachableHttpStatus,
  type HealthPayload,
  type ModuleInfo,
  type ModuleConfigEntry,
  type ConfigEntry,
  type TypeCapabilitiesMap,
  type ServiceInfo,
  type DbMigrationStatus,
  type DbMigrationDriftResult
} from '$lib/api-types';
import type { PageRouteDeclaration } from '@primebrick/ui';
import { PUBLIC_API_ORIGIN } from '$env/static/public';
import { building, browser } from '$app/environment';
import { extJsonStringify } from '$lib/api-ext';
import { getCachedETag, setCachedETag } from '@primebrick/ui/cache';

export type { HealthModule, HealthPayload, ModuleInfo, ModuleNav, ModuleNavLink, ServiceInfo, ConfigEntry, ConfigEntryType, AiModel } from '$lib/api-types';
export { ApiDatabaseUnavailableError, ApiRedisUnavailableError, ApiUnreachableError, isUnreachableHttpStatus } from '$lib/api-types';

/** Avoid stale list/meta until server-side cache (e.g. Redis) is in place. */
const ENTITY_API_PATH = '/api/v1/entities';

/**
 * Entities owned by a microservice are reached through the BE proxy
 * (`/svc/<service>/api/v1/entities/<entity>`); BE-owned entities use the
 * direct path. Single source of truth for every generic entity layer
 * (entity-list-table composables, version history, dialogs).
 */
const ENTITY_SERVICE_MAP: Record<string, string> = {
  customer: 'crm',
  ai_model: 'ai',
  ai_cerebellum: 'ai',
  job_schedule: 'job',
  job_run: 'job',
  job_rule: 'job',
  provider: 'emailsender',
  email_template: 'emailsender',
};

export function entityApiBase(entity: string): string {
  const service = ENTITY_SERVICE_MAP[entity];
  return service ? `/svc/${service}/api/v1/entities/${entity}` : `${ENTITY_API_PATH}/${entity}`;
}

// hasLocalSession / isTokenExpired / refreshAccessToken / triggerRefresh
// live in $lib/auth/session-check — shared with the login page boot.

function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isEntityApiRequest(input: RequestInfo | URL): boolean {
  return requestUrlString(input).includes(ENTITY_API_PATH);
}

/**
 * Handle RFC7807 error responses automatically by pushing to error panel
 * Returns the response so callers can still handle it if needed
 */
async function handleRFC7807Error(res: Response): Promise<Response> {
  try {
    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      // Clone before reading so the caller can still access the body
      const errorData = await res.clone().json();
      // Check if it looks like RFC7807 format (has type, title, status)
      if (errorData.type && errorData.title && errorData.status) {
        pushNotification(errorData);
      }
    }
  } catch (e) {
    // If parsing fails, just return the response as-is
    console.warn('[api] Failed to parse RFC7807 error:', e);
  }
  return res;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url = requestUrlString(input);

  // 1. Rewrite URL IMMEDIATELY if in SSR
  if (typeof window === 'undefined' && !building && url.startsWith('/api/')) {
    url = `${PUBLIC_API_ORIGIN}${url}`;
  }

  // 2. Skip health check in SSR (URL is now absolute)
  if (typeof window !== 'undefined') {
    await ensureBackendOnlineOrThrow();
  }

  const nextInit: RequestInit = init ? { ...init } : {};
  nextInit.credentials = 'include';
  if (isEntityApiRequest(input) && nextInit.cache === undefined) {
    nextInit.cache = 'no-store';
  }

  // ETag: send If-None-Match for GET requests with a cached ETag
  const isGet = (nextInit.method ?? 'GET').toUpperCase() === 'GET';
  let cachedETag: { etag: string; body: string } | null = null;
  if (isGet && browser) {
    cachedETag = getCachedETag(url);
    if (cachedETag) {
      nextInit.headers = {
        ...nextInit.headers as Record<string, string>,
        'If-None-Match': cachedETag.etag,
      };
    }
  }

  let res: Response;
  try {
    res = await fetch(url, nextInit);
  } catch (e) {
    const aborted =
      (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') ||
      (e instanceof Error && e.name === 'AbortError');
    if (aborted) throw e;
    // Network error / no response = backend unreachable (fetch threw, not a 503 response)
    noteGatewayFailure(502);
    throw new ApiUnreachableError(null);
  }

  // ETag: handle 304 Not Modified — return synthetic Response with cached body
  if (res.status === 304 && cachedETag) {
    return new Response(cachedETag.body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ETag: store body + ETag on 200 with X-PB-Cached header
  if (res.ok && browser && isGet) {
    const etag = res.headers.get('ETag');
    const pbCached = res.headers.get('X-PB-Cached');
    if (etag && pbCached === 'true') {
      const cloned = res.clone();
      cloned.text().then((body) => {
        setCachedETag(url, etag, body);
      }).catch(() => { /* best-effort */ });
    }
  }

  // 503 from backend = application-level infrastructure unavailable signal (NOT gateway failure → no loop).
  // Force a /health probe so the chip reflects the offline component immediately
  // instead of waiting for the next periodic poll.
  // Check the response body's internal_code to distinguish REDIS_UNAVAILABLE from DATABASE_UNAVAILABLE.
  if (res.status === 503) {
    let internalCode: string | undefined;
    try {
      const cloned = res.clone();
      const body = await cloned.json();
      internalCode = body?.internal_code;
    } catch { /* not JSON — treat as generic 503 */ }
    void probeHealth({ force: true });
    if (internalCode === 'REDIS_UNAVAILABLE') {
      throw new ApiRedisUnavailableError(503);
    }
    throw new ApiDatabaseUnavailableError(503);
  }

  // 401 = unauthorized - implement fast retry logic
  if (res.status === 401) {
    // If this is a retry after session-expired login and it's STILL 401, don't re-enqueue
    if ((nextInit as RequestInit & { _sessionRetry?: boolean })._sessionRetry) {
      throw new Error('Session retry failed - still 401 after successful login');
    }
    // Skip refresh for auth endpoints - user doesn't have tokens yet.
    // webauthn/signin too: a legit 401 (e.g. credential no longer registered
    // in the IDP) must reach the caller — enqueueing it would deadlock the
    // session-expired dialog (the dialog waits on the very request being
    // enqueued → spinner forever, error never shown).
    const url = requestUrlString(input);
    if (url.includes('/api/v1/auth/login') || url.includes('/api/v1/auth/refresh') || url.includes('/api/v1/auth/webauthn/signin')) {
      // Let the 401 propagate to the caller for proper error handling
      return res;
    }

    // Check if we have a local session before attempting refresh
    if (!hasLocalSession()) {
      // No local session - open session-expired dialog instead of force-redirecting
      console.error('[api] No local session, opening session-expired dialog');
      if (typeof window !== 'undefined') {
        // Clear in-memory profile so the passkey dialog doesn't render
        // on top of the session-expired dialog with stale data.
        userProfileStore.clear();
        saveRedirectUrl(window.location.pathname + window.location.search);
        return sessionExpiredStore.enqueue(input, nextInit);
      }
      throw new Error('No local session');
    }

    // Check if token is expired locally
    if (isTokenExpired()) {
      // Token is expired, try to refresh
      try {
        await triggerRefresh();
        // Retry the original request after successful refresh
        return await apiFetch(input, nextInit);
      } catch (refreshError) {
        // Refresh failed, open session-expired dialog instead of force-redirecting
        console.error('[api] Token refresh failed, opening session-expired dialog:', refreshError);
        if (typeof window !== 'undefined') {
          // Clear corrupted session data (both sessionStorage and in-memory)
          // before showing dialog so the passkey dialog doesn't render with
          // stale profile data.
          userProfileStore.clear();
          saveRedirectUrl(window.location.pathname + window.location.search);
          return sessionExpiredStore.enqueue(input, nextInit);
        }
        throw new Error('Token refresh failed', { cause: refreshError });
      }
    } else {
      // Token is not expired - this is a permission error, let it propagate
      // The caller will handle showing the RFC error toast
    }
  }

  // 502/504/520-524 = gateway/network failure — but the BE itself may have
  // returned an RFC 7807 error (BE is reachable, downstream US is unreachable).
  // If the body is RFC 7807 JSON, push the notification with the real error
  // details (title, detail, internal_code, severity, tags) and throw
  // ApiUnreachableError with alreadyNotified=true so callers skip their
  // generic catch-block notification.
  // If the body is NOT RFC 7807 (raw gateway HTML/non-JSON), the BE is truly
  // unreachable — call noteGatewayFailure and throw ApiUnreachableError.
  if (!res.ok && isUnreachableHttpStatus(res.status)) {
    let alreadyNotified = false;
    try {
      const contentType = res.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const errorData = await res.json();
        if (errorData?.type && errorData?.title && typeof errorData?.status === 'number') {
          pushNotification(errorData);
          alreadyNotified = true;
        }
      }
    } catch {
      // Body is not parseable JSON — raw gateway error, fall through
    }

    if (!alreadyNotified) {
      noteGatewayFailure(res.status);
    }
    throw new ApiUnreachableError(res.status, alreadyNotified);
  }

  // Auto-handle RFC7807 errors for non-auth endpoints — auth endpoints
  // (login/refresh/webauthn signin) surface their own error handling.
  if (!res.ok && !url.includes('/api/v1/auth/login') && !url.includes('/api/v1/auth/refresh') && !url.includes('/api/v1/auth/webauthn/signin')) {
    await handleRFC7807Error(res);
  }

  return res;
}

/** Same as {@link apiFetch} but aborts after `timeoutMs` (merged with `init.signal` if present). */
export async function apiFetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const ctrl = new AbortController();
  const tmo = setTimeout(() => ctrl.abort(), timeoutMs);
  const externalSignal = init?.signal;
  if (externalSignal) {
    if (externalSignal.aborted) ctrl.abort();
    else externalSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  try {
    return await apiFetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(tmo);
  }
}

/**
 * THE module discovery document — `GET /api/v1/modules` is the single
 * access-filtered payload feeding every nav surface (launcher, sidebar,
 * breadcrumb, route census). It embeds each module's `nav`/`routes`/`sheets`
 * already filtered by the caller's `access.*` grants — there is no
 * per-module meta endpoint. A module with ZERO reachable leaves stays
 * present flagged `accessible:false` (+ `nav_hidden`) so the launcher's
 * reveal switch can render it disabled.
 *
 * `labels` — the flat key→value graph for every `label_key` the payload
 * declares (module + nav + routes + sheets), resolved server-side for
 * `lang`. The caller merges it into the i18n dict store so `$t` resolves
 * nav labels deterministically, before any module dictionary is
 * route-loaded.
 */
export async function fetchModules(
  lang: string,
): Promise<{ modules: ModuleInfo[]; labels: Record<string, string> }> {
  const res = await apiFetch(`/api/v1/modules?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) throw new Error(`Modules request failed (${res.status})`);
  return (await res.json()) as { modules: ModuleInfo[]; labels: Record<string, string> };
}

export async function fetchHealth(): Promise<HealthPayload> {
  const res = await apiFetch('/api/v1/health');
  if (!res.ok) throw new Error(`Health request failed (${res.status})`);
  return (await res.json()) as HealthPayload;
}

export async function fetchServices(): Promise<ServiceInfo[]> {
  const res = await apiFetch('/api/v1/system/services');
  if (!res.ok) throw new Error(`Services request failed (${res.status})`);
  const data = (await res.json()) as { services: ServiceInfo[] };
  return data.services;
}

export async function fetchService(code: string): Promise<ServiceInfo> {
  const res = await apiFetch(`/api/v1/system/services/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(`Service request failed (${res.status})`);
  const data = (await res.json()) as { service: ServiceInfo };
  return data.service;
}

export async function toggleModule(code: string): Promise<{ is_enabled: boolean }> {
  const res = await apiFetch(`/api/v1/system/services/${encodeURIComponent(code)}/toggle`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error(`Toggle failed (${res.status})`);
  return await res.json();
}

export async function deleteModule(code: string): Promise<void> {
  const res = await apiFetch(`/api/v1/system/services/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

export async function deleteServiceInstance(uuid: string): Promise<void> {
  const res = await apiFetch(`/api/v1/system/services/instances/${encodeURIComponent(uuid)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

export async function updateService(code: string, data: Partial<ServiceInfo>): Promise<ServiceInfo> {
  const res = await apiFetch(`/api/v1/system/services/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Update failed (${res.status})`);
  const result = (await res.json()) as { service: ServiceInfo };
  return result.service;
}

// ── db_patch system module (migration admin) ────────────────────────────────
// BE answers directly; microservices are reached through the governed proxy
// (/svc/<code>/...), which exempts this prefix for `migration_failed` instances.

export function dbMigrationBase(code: string): string {
  return code === 'be'
    ? '/api/v1/system/db-migration'
    : `/svc/${encodeURIComponent(code)}/api/v1/system/db-migration`;
}

export async function fetchDbMigrationStatus(code: string): Promise<DbMigrationStatus> {
  const res = await apiFetch(`${dbMigrationBase(code)}/status`);
  if (!res.ok) throw new Error(`Migration status failed (${res.status})`);
  return (await res.json()) as DbMigrationStatus;
}

export async function dbMigrationRetry(code: string): Promise<{ retried: number; result: unknown }> {
  const res = await apiFetch(`${dbMigrationBase(code)}/retry`, { method: 'POST' });
  if (!res.ok) throw new Error(`Migration retry failed (${res.status})`);
  return await res.json();
}

export async function dbMigrationApprove(
  code: string,
  patchName: string,
  note?: string,
): Promise<{ approved: boolean; detail?: string }> {
  const res = await apiFetch(`${dbMigrationBase(code)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: extJsonStringify({ patch_name: patchName, note }),
  });
  if (!res.ok) throw new Error(`Migration approve failed (${res.status})`);
  return await res.json();
}

export async function dbMigrationResolve(
  code: string,
  patchName: string,
  note?: string,
): Promise<{ resolved: boolean; detail?: string }> {
  const res = await apiFetch(`${dbMigrationBase(code)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: extJsonStringify({ patch_name: patchName, note }),
  });
  if (!res.ok) throw new Error(`Migration resolve failed (${res.status})`);
  return await res.json();
}

export async function dbMigrationDriftCheck(code: string): Promise<DbMigrationDriftResult> {
  const res = await apiFetch(`${dbMigrationBase(code)}/drift-check`, { method: 'POST' });
  if (!res.ok) throw new Error(`Drift check failed (${res.status})`);
  return await res.json();
}

export async function fetchModuleConfig(code: string): Promise<ModuleConfigEntry[]> {
  const res = await apiFetch(`/svc/${encodeURIComponent(code)}/api/v1/entities/config_entry/list`);
  if (!res.ok) throw new Error(`Config fetch failed (${res.status})`);
  const data = (await res.json()) as { config_entries: ModuleConfigEntry[] };
  return data.config_entries;
}

export async function updateModuleConfigKey(code: string, uuid: string, value: string | bigint | number, version?: number): Promise<void> {
  const res = await apiFetch(`/svc/${encodeURIComponent(code)}/api/v1/entities/config_entry/${encodeURIComponent(uuid)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: extJsonStringify({ entity: { value, version } }),
  });
  if (!res.ok) throw new Error(`Config update failed (${res.status})`);
}

// === Config entries (BE auth_configurations — Config Table standard) ===

export async function fetchConfigEntries(): Promise<ConfigEntry[]> {
  const res = await apiFetch('/api/v1/entities/config_entry/list');
  if (!res.ok) throw new Error(`Config entries fetch failed (${res.status})`);
  const data = (await res.json()) as { rows: ConfigEntry[] };
  return data.rows;
}

/**
 * Fetches `GET /api/v1/entities/config_entry/meta` — carries
 * `type_capabilities` (canonical per-type capability matrix from
 * `@primebrick/sdk`) alongside the entity meta columns.
 */
export async function fetchConfigEntryMeta(): Promise<{ type_capabilities?: TypeCapabilitiesMap }> {
  const res = await apiFetch('/api/v1/entities/config_entry/meta');
  if (!res.ok) throw new Error(`Config entry meta fetch failed (${res.status})`);
  return (await res.json()) as { type_capabilities?: TypeCapabilitiesMap };
}

// === AI models / cerebellum fetchers REMOVED — ai-domain fetches live in
// @primebrick/ui ai/service-api.ts, resolved via getServiceApi('ai') so the
// same code runs in host and remote realms. ===

// === Docs KB search (system RPC — BE pass-through to ai.docs_kb) ===

export interface DocsSearchHit {
  id: bigint;
  repo: string;
  path: string;
  title: string;
  chunk_idx: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  keyword_hits: number;
  /** ts_rank_cd of the full-text lexical channel (0 when absent). */
  lexical_score: number;
  score: number;
  /** Doc-graph expansion hit (outbound link of a top page) — real similarity
   *  but structural provenance; bypasses the min_similarity floor. */
  graph_expanded?: boolean;
  /** Lexical-only recall (strong FTS match, absent from the vector top-N) —
   *  bypasses the min_similarity floor like graph_expanded. */
  lexical_match?: boolean;
}

export async function searchDocs(params: {
  /** Raw query text — the BE embeds it via the AI microservice. The FE
   *  never computes embeddings (embed-worker was removed by design). */
  query: string;
  /** Legacy path: precomputed embedding (internal callers/tests only). */
  embedding?: number[];
  keywords?: string[];
  limit?: number;
  repo?: string;
  /** Corpus scoping applied inside the SQL candidate window — filtering
   *  client-side after top-N lets out-of-scope docs saturate the window. */
  path_prefix?: string;
  /** Caller floor — the BE only expands the doc graph off hits above it. */
  min_similarity?: number;
  /** Rank-tuning overrides forwarded to the DAL (per-assistant balance). */
  keyword_boost?: number;
  lexical_boost?: number;
  lex_match_min?: number;
  oversample?: number;
  graph_max_paths?: number;
}): Promise<DocsSearchHit[]> {
  const res = await apiFetch('/svc/ai/api/v1/system/docs/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Docs search failed (${res.status})`);
  const data = (await res.json()) as { results: DocsSearchHit[] };
  return data.results;
}

/** Ordered repo→pages tree for the in-product docs browser. `entity` is the
 *  `metadata.entity` value used for page→doc context matching (never the
 *  filename); `order` comes from the repo's `_order.json` manifest. */
export interface DocsIndexEntry {
  path: string;
  title: string;
  order: number | null;
  entity?: string;
  description?: string;
}

export interface DocsIndexRepo {
  repo: string;
  entries: DocsIndexEntry[];
}

export async function fetchDocsIndex(): Promise<DocsIndexRepo[]> {
  const res = await apiFetch('/svc/ai/api/v1/system/docs/index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Docs index failed (${res.status})`);
  const data = (await res.json()) as { repos: DocsIndexRepo[] };
  return data.repos;
}

/** Full document fetch for the `docs_fetch` agent tool — the model
 *  dereferences a path seen in an excerpt and reads the whole page. */
export async function fetchDoc(params: {
  path: string;
  repo?: string;
}): Promise<{ repo: string; path: string; title: string; content: string; metadata: Record<string, unknown> } | null> {
  const res = await apiFetch('/svc/ai/api/v1/system/docs/document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Doc fetch failed (${res.status})`);
  const data = (await res.json()) as { document: { repo: string; path: string; title: string; content: string; metadata: Record<string, unknown> } };
  return data.document;
}

/**
 * Runtime FE route census entry — the canonical `PageRouteDeclaration`
 * (carrying optional remote-delivery fields `component_url`/`component_format`/
 * `integrity` consumed by `RemotePageMount`) plus the owning module code.
 */
export interface CensusRoute extends PageRouteDeclaration {
  module: string;
}

/**
 * Client-derived route census — flattens the discovery payload's `routes`
 * + nav hrefs into the historical `/system/routes` shape
 * (`{...decl, module}`). Same output as the retired endpoint, already
 * access-filtered because the payload itself is.
 */
export function routesCensusFromModules(modules: readonly ModuleInfo[]): CensusRoute[] {
  const seen = new Set<string>();
  const routes: CensusRoute[] = [];
  for (const m of modules) {
    if (m.enabled === false) continue;
    for (const r of m.routes ?? []) {
      if (seen.has(r.route)) continue;
      seen.add(r.route);
      routes.push({ ...r, module: m.id });
    }
    for (const l of m.nav ?? []) {
      if (seen.has(l.href)) continue;
      seen.add(l.href);
      routes.push({ route: l.href, kind: 'page', label_key: l.label_key, module: m.id });
    }
  }
  return routes.sort((a, b) => a.route.localeCompare(b.route));
}

/** A generic MCP tool definition (GET /api/v1/system/mcp/tools). */
export interface McpToolDef {
  name: string;
  title?: string;
  description: string;
  input_schema: unknown;
  /** Safe to auto-execute — write tools need user confirmation client-side. */
  read_only: boolean;
}

/**
 * List the generic MCP tool catalog (GET /api/v1/system/mcp/tools).
 * Used by the AI chat agentic loop — the FE is the loop driver (B3): it
 * passes these defs to /api/v1/ai/chat, executes model tool calls via
 * callMcpTool, and resubmits the updated history.
 */
export async function listMcpTools(): Promise<McpToolDef[]> {
  const res = await apiFetch('/api/v1/system/mcp/tools');
  if (!res.ok) return [];
  const data = (await res.json()) as { tools: McpToolDef[] };
  return data.tools ?? [];
}

/** Response of POST /api/v1/system/mcp/call. */
export interface McpCallResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Invoke a generic MCP tool over REST (`POST /api/v1/system/mcp/call`).
 * Used by the Guide assistant action CTAs — the BE dispatches through the
 * SAME handlers as the MCP server (validation + RBAC included).
 */
export async function callMcpTool(
  tool: string,
  args: Record<string, unknown>,
): Promise<McpCallResponse> {
  const res = await apiFetch('/api/v1/system/mcp/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args }),
  });
  const data = (await res.json()) as McpCallResponse;
  if (!res.ok) return { ok: false, error: data.error ?? `Tool call failed (${res.status})` };
  return data;
}

export async function createConfigEntry(params: {
  key: string;
  value: string | bigint | number;
  type: string;
  type_config?: string | null;
  label_key?: string | null;
  description_key?: string | null;
  group_key?: string | null;
  reserved?: boolean;
  /**
   * Optional translation rows piggybacked on the same write — the BE inserts
   * them in the SAME transaction as the entity ({entity, translations}
   * write standard). Duplicate (key, language) rows are skipped, not fatal.
   */
  translations?: { key: string; language: string; value: string }[];
}): Promise<ConfigEntry> {
  const { translations, ...entity } = params;
  const res = await apiFetch('/api/v1/entities/config_entry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: extJsonStringify(translations?.length ? { entity, translations } : { entity }),
  });
  if (!res.ok) throw new Error(`Config entry create failed (${res.status})`);
  const data = (await res.json()) as ConfigEntry;
  return data;
}

export async function updateConfigEntry(
  uuid: string,
  patch: { value?: string | bigint | number; type?: string; type_config?: string | null },
  version: number,
): Promise<void> {
  const res = await apiFetch(`/api/v1/entities/config_entry/${encodeURIComponent(uuid)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: extJsonStringify({ entity: { ...patch, version } }),
  });
  if (!res.ok) throw new Error(`Config entry update failed (${res.status})`);
}

export async function bulkUpdateConfigEntries(
  updates: Array<{
    uuid: string;
    value?: string | bigint | number;
    type?: string;
    type_config?: string | null;
    version: number;
  }>,
): Promise<number> {
  const res = await apiFetch('/api/v1/entities/config_entry/bulk-update', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: extJsonStringify({ updates }),
  });
  if (!res.ok) {
    // Propagate the RFC 7807 body verbatim so the caller can pushNotification()
    // it and extra.issues (per-row bulk detail) reaches the error dialog.
    const errorData = await res.json().catch(() => null);
    if (errorData && typeof errorData === 'object' && 'status' in errorData) throw errorData;
    throw new Error(`Config entries bulk update failed (${res.status})`);
  }
  const data = (await res.json()) as { success: boolean; updated: number };
  return data.updated;
}

export async function deleteConfigEntry(uuid: string, version: number, mfaActionAuthorization: string | null): Promise<Response> {
  return apiFetch(`/api/v1/entities/config_entry/${encodeURIComponent(uuid)}?version=${version}`, {
    method: 'DELETE',
    headers: mfaActionAuthorization ? { 'x-mfa-action-authorization': mfaActionAuthorization } : {},
  });
}

export async function bulkDeleteConfigEntries(items: Array<{ uuid: string; version: number }>, mfaActionAuthorization: string | null): Promise<Response> {
  return apiFetch('/api/v1/entities/config_entry/bulk-delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(mfaActionAuthorization ? { 'x-mfa-action-authorization': mfaActionAuthorization } : {}),
    },
    body: JSON.stringify({ items }),
  });
}

export async function restoreConfigEntry(uuid: string, version: number): Promise<void> {
  const res = await apiFetch(`/api/v1/entities/config_entry/${encodeURIComponent(uuid)}/restore?version=${version}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Config entry restore failed (${res.status})`);
}

// ─── Translations ──────────────────────────────────────────────────────

/** Public pages (login, welcome, MCP consent) — no auth needed. */
export async function fetchPublicTranslations(language: string): Promise<Record<string, string>> {
  const res = await apiFetch(`/api/v1/system/translations/public/${encodeURIComponent(language)}`);
  if (!res.ok) throw new Error(`Public translations request failed (${res.status})`);
  return await res.json();
}

/** Authenticated pages — module-aware translation dict (runtime read). */
export async function fetchModuleTranslations(moduleCode: string, language: string): Promise<Record<string, string>> {
  const res = await apiFetch(`/api/v1/system/translations/${encodeURIComponent(moduleCode)}/${encodeURIComponent(language)}`);
  if (!res.ok) throw new Error(`Translations request failed (${res.status})`);
  return await res.json();
}

/** Admin: list translations (paginated, filtered by module + language). */
export async function fetchTranslationList(moduleCode: string, query: {
  page?: number;
  page_size?: number;
  language?: string;
  sort_key?: string;
  sort_dir?: string;
  deleted_records?: string;
}): Promise<{ rows: unknown[]; total: bigint }> {
  const params = new URLSearchParams({ module: moduleCode });
  if (query.page) params.set('page', String(query.page));
  if (query.page_size) params.set('page_size', String(query.page_size));
  if (query.language) params.set('language', query.language);
  if (query.sort_key) params.set('sort_key', query.sort_key);
  if (query.sort_dir) params.set('sort_dir', query.sort_dir);
  if (query.deleted_records) params.set('deleted_records', query.deleted_records);
  const res = await apiFetch(`/api/v1/entities/translation/list?${params}`);
  if (!res.ok) throw new Error(`Translations list request failed (${res.status})`);
  return await res.json();
}

/** Admin: create a translation row. */
export async function createTranslation(moduleCode: string, data: {
  key: string;
  language: string;
  value: string;
}): Promise<unknown> {
  const res = await apiFetch(`/api/v1/entities/translation?module=${encodeURIComponent(moduleCode)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `{entity}` envelope — a `translations` sibling is rejected by the BE.
    body: JSON.stringify({ entity: data }),
  });
  if (!res.ok) throw new Error(`Translation create failed (${res.status})`);
  return await res.json();
}

/** Admin: update a translation row. `version` is required (optimistic concurrency). */
export async function updateTranslation(moduleCode: string, uuid: string, data: {
  key?: string;
  language?: string;
  value?: string;
  version: number;
}): Promise<unknown> {
  const res = await apiFetch(`/api/v1/entities/translation/${encodeURIComponent(uuid)}?module=${encodeURIComponent(moduleCode)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity: data }),
  });
  if (!res.ok) throw new Error(`Translation update failed (${res.status})`);
  return await res.json();
}

/** Admin: soft-delete a translation row. */
export async function deleteTranslation(moduleCode: string, uuid: string, version: number): Promise<void> {
  const res = await apiFetch(`/api/v1/entities/translation/${encodeURIComponent(uuid)}?module=${encodeURIComponent(moduleCode)}&version=${version}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Translation delete failed (${res.status})`);
}

/** Admin: restore a soft-deleted translation row. */
export async function restoreTranslation(moduleCode: string, uuid: string, version: number): Promise<void> {
  const res = await apiFetch(`/api/v1/entities/translation/${encodeURIComponent(uuid)}/restore?module=${encodeURIComponent(moduleCode)}&version=${version}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Translation restore failed (${res.status})`);
}
