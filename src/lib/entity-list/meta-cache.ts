/**
 * meta-cache — shared per-`basePath` entity-meta cache + in-flight dedup.
 *
 * Meta is static UI configuration — fetch it once per entity base path and
 * share the result across every mount (multiple page instances, dev/HMR
 * remounts). The in-flight promise is shared so concurrent mounts issue a
 * single request; a rejected fetch clears the in-flight slot so the next
 * caller retries (the old per-page implementation could leave it stuck).
 *
 * Lives on `globalThis` so the cache survives module-level HMR.
 */
import { apiFetchWithTimeout } from '$lib/api';
import { ApiListError, readApiErrorDetails } from './api-list-error';
import type { EntityMeta } from './types';

interface MetaCacheEntry {
  data?: EntityMeta;
  inFlight?: Promise<EntityMeta>;
}

const CACHE_KEY = '__pbEntityMetaCacheByBasePath';

function store(): Map<string, MetaCacheEntry> {
  const g = globalThis as Record<string, unknown>;
  if (!(g[CACHE_KEY] instanceof Map)) g[CACHE_KEY] = new Map<string, MetaCacheEntry>();
  return g[CACHE_KEY] as Map<string, MetaCacheEntry>;
}

/**
 * Fetch `GET {basePath}/meta` once per base path — returns the cached meta on
 * subsequent calls, dedupes concurrent callers on one in-flight request.
 *
 * @throws ApiListError with the BE error code on non-OK responses.
 */
export function fetchEntityMeta(basePath: string): Promise<EntityMeta> {
  const entry = store().get(basePath) ?? {};
  if (entry.data) return Promise.resolve(entry.data);
  if (entry.inFlight) return entry.inFlight;

  const inFlight = (async () => {
    const res = await apiFetchWithTimeout(`${basePath}/meta`, undefined, 30_000);
    if (!res.ok) {
      const apiDetails = await readApiErrorDetails(res);
      const code = apiDetails.code ?? 'GET_METADATA_FAILED';
      throw new ApiListError(code, res.status, apiDetails.internalCode ?? undefined, apiDetails.instance ?? undefined);
    }
    const meta = (await res.json()) as EntityMeta;
    entry.data = meta;
    return meta;
  })();

  entry.inFlight = inFlight;
  store().set(basePath, entry);
  // Rejected fetches must not poison the slot — clear in-flight on settle
  // so the next caller retries instead of awaiting a dead promise forever.
  inFlight.finally(() => {
    if (entry.inFlight === inFlight) entry.inFlight = undefined;
  });
  return inFlight;
}

/** Test/debug helper — drop every cached meta + in-flight slot. */
export function clearEntityMetaCache(): void {
  store().clear();
}
