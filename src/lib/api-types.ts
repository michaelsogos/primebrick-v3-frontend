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
export type HealthPayload = {
  ok: true;
  service: string;
  version: string;
  db: { ok: boolean };
  idp: { ok: boolean; type?: string; version?: string };
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
};

export type ModuleConfigEntry = {
  uuid: string;
  key: string;
  value: string | null;
  label_key?: string;
  description_key?: string;
};

/** Reject non-JSON / HTML error pages / partial objects so we do not show a false "DB down" from bad data. */
export function isValidHealthPayload(x: unknown): x is HealthPayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.ok !== true) return false;
  if (typeof o.service !== 'string') return false;
  if (typeof o.version !== 'string') return false;
  const db = o.db;
  if (!db || typeof db !== 'object') return false;
  if (typeof (db as { ok?: unknown }).ok !== 'boolean') return false;
  const idp = o.idp;
  if (!idp || typeof idp !== 'object') return false;
  return typeof (idp as { ok?: unknown }).ok === 'boolean';
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
