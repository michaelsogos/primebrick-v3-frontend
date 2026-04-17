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
  return typeof (db as { ok?: unknown }).ok === 'boolean';
}

/** Proxy/gateway/timeouts: backend likely down or unreachable. */
export function isUnreachableHttpStatus(status: number): boolean {
  if (status === 502 || status === 503 || status === 504) return true;
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
