export type ModuleInfo = {
  id: string;
  name: string;
  enabled: boolean;
  icon?: string;
  route_prefixes?: string[];
  is_reserved?: boolean;
};

export type ModuleNavLink = {
  id: string;
  label_key: string;
  href: string;
  icon?: string;
  children?: ModuleNavLink[];
};

export type ModuleNav = {
  module: string;
  icon?: string;
  nav: ModuleNavLink[];
};

export type HealthModule = { id: string; version: string };

/** A single health check result entry in the unified `checks` map. */
export type HealthCheckEntry = {
  ok: boolean;
  version?: string;
  type?: string;
  /** Active model id — only populated by the LLM check (e.g. "Qwen3-4B-Instruct-2507-Q4_K_M"). */
  model?: string;
  error?: string;
};

/**
 * Unified health response — same shape from both BE and US microservices.
 * The `checks` map is extensible: each service registers only the checks it has
 * (BE: db, redis, nats, idp; US: db, redis, nats).
 */
export type HealthPayload = {
  ok: boolean;
  service: string;
  version: string;
  url?: string;
  checks: Record<string, HealthCheckEntry>;
};

export type IconType = 'url' | 'svg' | 'base64' | 'icon';

export type ServiceInfo = {
  code: string;
  base_url: string;
  endpoints: Record<string, unknown>;
  name?: string;
  description?: string;
  author?: string;
  github_repo_url?: string;
  service_version?: string;
  is_behind_scaler: boolean;
  status: string;
  last_health_check_at?: string;
  is_enabled: boolean;
  icon?: string;
  icon_type: IconType;
  is_reserved?: boolean;
  uuid?: string;
};

export type ModuleConfigEntry = {
  uuid: string;
  key: string;
  value: string | null;
  label_key?: string;
  description_key?: string;
};

/**
 * Config value type vocabulary — drives FE widget selection.
 * Mirrors the SDK `ConfigType` and the BE `type` column.
 */
export type ConfigEntryType =
  | 'string'
  | 'text'
  | 'boolean'
  | 'integer'
  | 'number'
  | 'badge'
  | 'list'
  | 'url'
  | 'secret'
  | 'json'
  | 'date'
  | 'datetime'
  | 'time';

/**
 * Standard Config Table entry — returned by `GET /api/v1/entities/config_entries/*`.
 * The `value` is always a string (or null) at the DB level; the FE coerces
 * to the appropriate type for display and back to string before saving.
 * Secret values are masked to `null` by the BE.
 */
export type ConfigEntry = {
  uuid: string;
  key: string;
  value: string | null;
  type: ConfigEntryType;
  type_config?: string | null;
  label_key?: string | null;
  description_key?: string | null;
  group_key?: string | null;
  reserved: boolean;
  version: number;
  updated_at?: string;
  updated_by?: string;
  updated_by_name?: string | null;
};

/** Reject non-JSON / HTML error pages / partial objects so we do not show a false "DB down" from bad data. */
export function isValidHealthPayload(x: unknown): x is HealthPayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (typeof o.ok !== 'boolean') return false;
  if (typeof o.service !== 'string') return false;
  if (typeof o.version !== 'string') return false;
  if (!o.checks || typeof o.checks !== 'object') return false;
  // Validate each check entry has a boolean ok
  const checks = o.checks as Record<string, unknown>;
  for (const key of Object.keys(checks)) {
    const entry = checks[key];
    if (!entry || typeof entry !== 'object') return false;
    if (typeof (entry as { ok?: unknown }).ok !== 'boolean') return false;
  }
  return true;
}

/** Proxy/gateway/timeouts: backend likely down or unreachable.
 *  503 is intentionally EXCLUDED — it means the BE answered but a downstream
 *  dependency (DB/IDP) is down, which the health probe classifies as
 *  db_offline / idp_offline, not backend_offline. */
export function isUnreachableHttpStatus(status: number): boolean {
  if (status === 502 || status === 504) return true;
  if (status >= 520 && status <= 524) return true;
  return false;
}

/** Thrown when the API cannot be reached (network failure or typical proxy errors).
 *  When `alreadyNotified` is true, apiFetch already pushed an RFC 7807 notification
 *  with the real error details — callers should NOT push a generic notification. */
export class ApiUnreachableError extends Error {
  override readonly name = 'ApiUnreachableError';
  readonly status: number | null;
  readonly alreadyNotified: boolean;

  constructor(status: number | null = null, alreadyNotified = false) {
    super('ApiUnreachableError');
    this.status = status;
    this.alreadyNotified = alreadyNotified;
  }
}

/** BE responded; downstream Postgres (or equivalent) is unavailable — not the same as gateway/offline. */
export class ApiDatabaseUnavailableError extends Error {
  override readonly name = 'ApiDatabaseUnavailableError';
  readonly status: number;

  constructor(status: number) {
    super('ApiDatabaseUnavailableError');
    this.status = status;
  }
}

/** BE responded; downstream Redis is unavailable — not the same as DB or gateway/offline.
 *  The health chip will show redis_offline. Callers can distinguish this from
 *  ApiDatabaseUnavailableError for feature-specific UI (e.g. WebAuthn unavailable). */
export class ApiRedisUnavailableError extends Error {
  override readonly name = 'ApiRedisUnavailableError';
  readonly status: number;

  constructor(status: number) {
    super('ApiRedisUnavailableError');
    this.status = status;
  }
}
