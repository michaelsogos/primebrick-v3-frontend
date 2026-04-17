import {
  ApiUnreachableError,
  isUnreachableHttpStatus,
  isValidHealthPayload,
  type HealthPayload
} from '$lib/api-types';

/** Sidebar / shell: single source of truth so offline vs DB is never inconsistent. */
export type HealthChipState = 'backend_offline' | 'db_offline' | 'ok' | 'loading';

type HealthResult = { ok: true; payload: HealthPayload } | { ok: false; status: number | null };

/**
 * Reactive shell state (Svelte 5 runes). Do not duplicate into a separate `writable` store —
 * `fromStore` + the old `shared` blob caused UI that did not update when the probe changed.
 */
export const backendState = $state({
  offline: false,
  /** null = unknown/not yet checked */
  dbOk: null as boolean | null,
  /** last successful health payload (if any) */
  health: null as HealthPayload | null,
  offlineSince: null as number | null,
  lastHealthCheckAt: null as number | null,
  healthChip: 'loading' as HealthChipState,
});

const gs = globalThis as Record<string, unknown>;
const INFLIGHT_KEY = '__pbBackendHealthInflight';
type Inflight = { inFlight: Promise<HealthResult> | null; verifying: boolean };
function inflight(): Inflight {
  if (!gs[INFLIGHT_KEY]) {
    gs[INFLIGHT_KEY] = { inFlight: null, verifying: false } satisfies Inflight;
  }
  return gs[INFLIGHT_KEY] as Inflight;
}

function computeHealthChip(): HealthChipState {
  if (backendState.offline) return 'backend_offline';
  if (backendState.health === null) return 'loading';
  if (!backendState.health.db.ok) return 'db_offline';
  return 'ok';
}

function flushHealthChip() {
  backendState.healthChip = computeHealthChip();
}

export function getBackendOffline(): boolean {
  return backendState.offline;
}

export function setBackendOffline(next: boolean) {
  if (backendState.offline === next) {
    flushHealthChip();
    return;
  }
  backendState.offline = next;
  backendState.offlineSince = next ? Date.now() : null;
  flushHealthChip();
}

async function rawFetchHealth(timeoutMs = 5000): Promise<HealthResult> {
  const ctrl = new AbortController();
  const tmo = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch('/api/v1/health', {
        signal: ctrl.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
    } catch {
      return { ok: false, status: null };
    }
    if (!res.ok) return { ok: false, status: res.status };
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      return { ok: false, status: res.status };
    }
    if (!isValidHealthPayload(parsed)) {
      return { ok: false, status: res.status };
    }
    return { ok: true, payload: parsed };
  } catch {
    return { ok: false, status: null };
  } finally {
    clearTimeout(tmo);
  }
}

/**
 * Probes GET /api/v1/health. Concurrent callers share one in-flight request unless `force: true`
 * (used after gateway failures to re-verify even while a probe is still running).
 */
export async function probeHealth(opts?: { force?: boolean }): Promise<HealthResult> {
  const inf = inflight();
  if (!opts?.force && inf.inFlight) return inf.inFlight;

  backendState.lastHealthCheckAt = Date.now();
  flushHealthChip();

  inf.inFlight = (async () => {
    let r: HealthResult;
    try {
      r = await rawFetchHealth();
    } catch {
      r = { ok: false, status: null };
    }
    if (r.ok) {
      backendState.health = r.payload;
      backendState.dbOk = !!r.payload.db?.ok;
      setBackendOffline(false);
      flushHealthChip();
    } else {
      backendState.health = null;
      backendState.dbOk = null;
      setBackendOffline(true);
      flushHealthChip();
    }
    return r;
  })();

  try {
    return await inf.inFlight;
  } finally {
    inf.inFlight = null;
  }
}

export function noteGatewayFailure(status: number): void {
  if (!isUnreachableHttpStatus(status)) return;
  setBackendOffline(true);
  const inf = inflight();
  if (inf.verifying) return;
  inf.verifying = true;
  void probeHealth({ force: true }).finally(() => {
    inf.verifying = false;
  });
}

export async function ensureBackendOnlineOrThrow(): Promise<void> {
  if (!getBackendOffline()) return;
  throw new ApiUnreachableError(null);
}

flushHealthChip();
