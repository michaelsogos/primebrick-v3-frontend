export type ModuleInfo = {
  id: string;
  name: string;
  enabled: boolean;
};

export type HealthModule = { id: string; version: string };
export type HealthPayload = {
  ok: true;
  service: string;
  version: string;
  modules: HealthModule[];
  db: { ok: boolean };
  idp: { ok: boolean; type?: string; version?: string };
};

/** Reject non-JSON / HTML error pages / partial objects so we do not show a false "DB down" from bad data. */
export function isValidHealthPayload(x: unknown): x is HealthPayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.ok !== true) return false;
  if (typeof o.service !== 'string') return false;
  if (typeof o.version !== 'string') return false;
  if (!Array.isArray(o.modules)) return false;
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

/** Thrown when the API cannot be reached (network failure or typical proxy errors). */
export class ApiUnreachableError extends Error {
  override readonly name = 'ApiUnreachableError';
  readonly status: number | null;

  constructor(status: number | null = null) {
    super('ApiUnreachableError');
    this.status = status;
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
