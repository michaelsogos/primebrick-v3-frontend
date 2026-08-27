import { ensureBackendOnlineOrThrow, noteGatewayFailure, probeHealth } from '$lib/backend-availability';
import { saveRedirectUrl } from '$lib/auth/redirect-cache';
import { sessionExpiredStore } from '$lib/auth/session-expired-store.svelte';
import { userProfileState } from '$lib/user-profile-store.svelte';
import { pushNotification } from '$lib/errors/app-errors';
import {
  ApiDatabaseUnavailableError,
  ApiRedisUnavailableError,
  ApiUnreachableError,
  isUnreachableHttpStatus,
  type HealthPayload,
  type ModuleInfo,
  type ModuleNav,
  type ModuleConfigEntry,
  type ConfigEntry,
  type ServiceInfo
} from '$lib/api-types';
import { PUBLIC_API_ORIGIN } from '$env/static/public';
import { building } from '$app/environment';

export type { HealthModule, HealthPayload, ModuleInfo, ModuleNav, ModuleNavLink, ServiceInfo, ConfigEntry, ConfigEntryType } from '$lib/api-types';
export { ApiDatabaseUnavailableError, ApiRedisUnavailableError, ApiUnreachableError, isUnreachableHttpStatus } from '$lib/api-types';

/** Avoid stale list/meta until server-side cache (e.g. Redis) is in place. */
const ENTITY_API_PATH = '/api/v1/entities';

// Concurrency control for token refresh
let refreshPromise: Promise<void> | null = null;

/**
 * Check if there is a local user session in sessionStorage
 */
function hasLocalSession(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) return false;
    
    const user = JSON.parse(userStr);
    // Consider session valid if it has at least an idp_code or username
    return !!(user.idp_code || user.username);
  } catch {
    return false;
  }
}

/**
 * Check if the access token is expired by comparing expiresAt from session storage
 * Supports both expires_at (new snake_case) and expiresAt (old camelCase) for soft migration
 */
function isTokenExpired(): boolean {
  if (typeof window === 'undefined') return true;
  
  try {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) return true;
    
    const user = JSON.parse(userStr);
    // Support both expires_at (new snake_case) and expiresAt (old camelCase) for soft migration
    const expiresAt = user.expires_at || user.expiresAt;
    if (!expiresAt) return true;
    
    // Add 30 seconds buffer to account for clock skew
    const now = Date.now();
    return expiresAt - 30000 < now;
  } catch {
    return true;
  }
}

/**
 * Refresh the access token by calling the backend refresh endpoint
 * Updates session storage with new user data on success
 */
async function refreshAccessToken(): Promise<void> {
  try {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Token Refresh] Failed:', errorData);
      throw new Error(errorData.detail || 'Token refresh failed');
    }

    const data = await response.json();
    
    // Update session storage with new user data
    if (data.success && data.user) {
      sessionStorage.setItem('user', JSON.stringify(data.user));
      console.log('[Token Refresh] Successfully refreshed token');
    }
  } catch (error) {
    console.error('[Token Refresh] Error:', error);
    throw error;
  }
}

/**
 * Trigger token refresh with concurrency control
 * Multiple simultaneous calls will wait for the same refresh operation
 */
async function triggerRefresh(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  await refreshPromise;
}

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
    if ((nextInit as any)._sessionRetry) {
      throw new Error('Session retry failed - still 401 after successful login');
    }
    // Skip refresh for auth endpoints - user doesn't have tokens yet
    const url = requestUrlString(input);
    if (url.includes('/api/v1/auth/login') || url.includes('/api/v1/auth/refresh')) {
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
        userProfileState.current = null;
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
          sessionStorage.removeItem('user');
          userProfileState.current = null;
          saveRedirectUrl(window.location.pathname + window.location.search);
          return sessionExpiredStore.enqueue(input, nextInit);
        }
        throw new Error('Token refresh failed');
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

  // Auto-handle RFC7807 errors for non-auth endpoints
  if (!res.ok && !url.includes('/api/v1/auth/login') && !url.includes('/api/v1/auth/refresh')) {
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

export async function fetchModules(): Promise<ModuleInfo[]> {
  const res = await apiFetch('/api/v1/modules');
  if (!res.ok) throw new Error(`Modules request failed (${res.status})`);
  const data = (await res.json()) as { modules: ModuleInfo[] };
  return data.modules;
}

export async function fetchModuleMeta(code: string): Promise<ModuleNav> {
  const res = await apiFetch(`/api/v1/modules/${encodeURIComponent(code)}/meta`);
  if (!res.ok) throw new Error(`Module meta request failed (${res.status})`);
  return (await res.json()) as ModuleNav;
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

export async function fetchModuleConfig(code: string): Promise<ModuleConfigEntry[]> {
  const res = await apiFetch(`/ws/${encodeURIComponent(code)}/api/v1/entities/config_entries/list`);
  if (!res.ok) throw new Error(`Config fetch failed (${res.status})`);
  const data = (await res.json()) as { config_entries: ModuleConfigEntry[] };
  return data.config_entries;
}

export async function updateModuleConfigKey(code: string, uuid: string, value: string): Promise<void> {
  const res = await apiFetch(`/ws/${encodeURIComponent(code)}/api/v1/entities/config_entries/${encodeURIComponent(uuid)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`Config update failed (${res.status})`);
}

// === Config entries (BE auth_configurations — Config Table standard) ===

export async function fetchConfigEntries(): Promise<ConfigEntry[]> {
  const res = await apiFetch('/api/v1/entities/config_entries/list');
  if (!res.ok) throw new Error(`Config entries fetch failed (${res.status})`);
  const data = (await res.json()) as { rows: ConfigEntry[] };
  return data.rows;
}

export async function createConfigEntry(params: {
  key: string;
  value: string;
  type: string;
  type_config?: string | null;
  label_key?: string | null;
  description_key?: string | null;
  group_key?: string | null;
  reserved?: boolean;
}): Promise<ConfigEntry> {
  const res = await apiFetch('/api/v1/entities/config_entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Config entry create failed (${res.status})`);
  const data = (await res.json()) as ConfigEntry;
  return data;
}

export async function updateConfigEntry(uuid: string, value: string, version: number): Promise<void> {
  const res = await apiFetch(`/api/v1/entities/config_entries/${encodeURIComponent(uuid)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, version }),
  });
  if (!res.ok) throw new Error(`Config entry update failed (${res.status})`);
}

export async function bulkUpdateConfigEntries(
  updates: Array<{ uuid: string; value: string; version: number }>,
): Promise<number> {
  const res = await apiFetch('/api/v1/entities/config_entries/bulk-update', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) throw new Error(`Config entries bulk update failed (${res.status})`);
  const data = (await res.json()) as { success: boolean; updated: number };
  return data.updated;
}

export async function deleteConfigEntry(uuid: string, mfaActionAuthorization: string | null): Promise<Response> {
  return apiFetch(`/api/v1/entities/config_entries/${encodeURIComponent(uuid)}`, {
    method: 'DELETE',
    headers: mfaActionAuthorization ? { 'x-mfa-action-authorization': mfaActionAuthorization } : {},
  });
}

export async function bulkDeleteConfigEntries(uuids: string[], mfaActionAuthorization: string | null): Promise<Response> {
  return apiFetch('/api/v1/entities/config_entries/bulk-delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(mfaActionAuthorization ? { 'x-mfa-action-authorization': mfaActionAuthorization } : {}),
    },
    body: JSON.stringify({ uuids }),
  });
}

export async function restoreConfigEntry(uuid: string): Promise<void> {
  const res = await apiFetch(`/api/v1/entities/config_entries/${encodeURIComponent(uuid)}/restore`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Config entry restore failed (${res.status})`);
}
