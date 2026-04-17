import { ensureBackendOnlineOrThrow, noteGatewayFailure } from '$lib/backend-availability';
import {
  ApiDatabaseUnavailableError,
  ApiUnreachableError,
  isUnreachableHttpStatus,
  type HealthPayload,
  type ModuleInfo
} from '$lib/api-types';

export type { HealthModule, HealthPayload, ModuleInfo } from '$lib/api-types';
export { ApiDatabaseUnavailableError, ApiUnreachableError, isUnreachableHttpStatus } from '$lib/api-types';

async function responseIsDatabaseUnavailable(res: Response): Promise<boolean> {
  if (!isUnreachableHttpStatus(res.status)) return false;
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return false;
  try {
    const data = (await res.clone().json()) as { error?: unknown };
    return data.error === 'DATABASE_UNAVAILABLE';
  } catch {
    return false;
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await ensureBackendOnlineOrThrow();

  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (e) {
    const aborted =
      (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') ||
      (e instanceof Error && e.name === 'AbortError');
    if (aborted) throw e;
    noteGatewayFailure(503);
    throw new ApiUnreachableError(null);
  }

  if (!res.ok && isUnreachableHttpStatus(res.status)) {
    if (await responseIsDatabaseUnavailable(res)) {
      throw new ApiDatabaseUnavailableError(res.status);
    }
    noteGatewayFailure(res.status);
    throw new ApiUnreachableError(res.status);
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

export async function fetchHealth(): Promise<HealthPayload> {
  const res = await apiFetch('/api/v1/health');
  if (!res.ok) throw new Error(`Health request failed (${res.status})`);
  return (await res.json()) as HealthPayload;
}
