import { writable } from 'svelte/store';
import { ApiUnreachableError, isUnreachableHttpStatus, type HealthPayload } from '$lib/api-types';

type BackendAvailabilityState = {
  offline: boolean;
  /** null = unknown/not yet checked */
  dbOk: boolean | null;
  /** last successful health payload (if any) */
  health: HealthPayload | null;
  offlineSince: number | null;
  lastHealthCheckAt: number | null;
};

const state = writable<BackendAvailabilityState>({
  offline: false,
  dbOk: null,
  health: null,
  offlineSince: null,
  lastHealthCheckAt: null,
});

type HealthResult = { ok: true; payload: HealthPayload } | { ok: false; status: number | null };

// Global singleton storage so HMR/multiple mounts share gating.
const gs = globalThis as any;
const KEY = '__pbBackendAvailability';
if (!gs[KEY]) {
  gs[KEY] = {
    offline: false,
    offlineSince: null as number | null,
    lastHealthCheckAt: null as number | null,
    health: null as HealthPayload | null,
    dbOk: null as boolean | null,
    inFlightHealth: null as Promise<HealthResult> | null,
    verifying: false,
  };
}
const shared = gs[KEY] as {
  offline: boolean;
  offlineSince: number | null;
  lastHealthCheckAt: number | null;
  health: HealthPayload | null;
  dbOk: boolean | null;
  inFlightHealth: Promise<HealthResult> | null;
  verifying: boolean;
};

function syncToStore() {
  state.set({
    offline: shared.offline,
    offlineSince: shared.offlineSince,
    lastHealthCheckAt: shared.lastHealthCheckAt,
    health: shared.health,
    dbOk: shared.dbOk,
  });
}
syncToStore();

export const backendAvailability = {
  subscribe: state.subscribe,
};

export function getBackendOffline(): boolean {
  return shared.offline;
}

export function setBackendOffline(next: boolean) {
  if (shared.offline === next) return;
  shared.offline = next;
  shared.offlineSince = next ? Date.now() : null;
  if (!next) {
    // reset unknowns as we are back online; next probes can re-evaluate dbOk.
    shared.dbOk = null;
  }
  syncToStore();
}

async function rawFetchHealth(timeoutMs = 5000): Promise<HealthResult> {
  // Use plain fetch so it works in SSR and does not recurse into apiFetch gating.
  const ctrl = new AbortController();
  const tmo = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch('/api/v1/health', { signal: ctrl.signal });
    } catch {
      return { ok: false, status: null };
    }
    if (!res.ok) return { ok: false, status: res.status };
    const payload = (await res.json()) as HealthPayload;
    return { ok: true, payload };
  } finally {
    clearTimeout(tmo);
  }
}

export async function probeHealth(opts?: { force?: boolean }): Promise<HealthResult> {
  const now = Date.now();
  if (!opts?.force && shared.inFlightHealth) return shared.inFlightHealth;

  shared.lastHealthCheckAt = now;
  syncToStore();
  shared.inFlightHealth = (async () => {
    const r = await rawFetchHealth();
    if (r.ok) {
      shared.health = r.payload;
      shared.dbOk = !!r.payload.db?.ok;
      setBackendOffline(false);
    } else {
      // keep offline if unreachable statuses or network failure
      if (r.status === null || isUnreachableHttpStatus(r.status)) setBackendOffline(true);
      // if backend responded but db is down, treat as offline for UI gating as requested
      // (backend online but DB down blocks core flows)
      // The health payload is unavailable in this branch.
    }
    return r;
  })();

  try {
    return await shared.inFlightHealth;
  } finally {
    shared.inFlightHealth = null;
  }
}

/**
 * Called when a request received a gateway/unreachable HTTP status.
 * - Flips offline=true immediately (so subsequent calls short-circuit)
 * - Performs a one-time immediate verification via /api/v1/health
 */
export function noteGatewayFailure(status: number): void {
  if (!isUnreachableHttpStatus(status)) return;
  setBackendOffline(true);
  if (shared.verifying) return;
  shared.verifying = true;
  void probeHealth({ force: true }).finally(() => {
    shared.verifying = false;
  });
}

export async function ensureBackendOnlineOrThrow(): Promise<void> {
  if (!getBackendOffline()) return;
  // If offline, caller should not attempt. Provide consistent error path.
  throw new ApiUnreachableError(null);
}

