/**
 * FE cache store — localStorage-based ETag cache for API responses.
 *
 * When the BE returns `X-PB-Cached: true` + `ETag`, `apiFetch` stores the
 * response body + ETag here. On the next request, `apiFetch` sends
 * `If-None-Match` and the BE returns `304` if nothing changed.
 *
 * On `304`, `apiFetch` returns a synthetic `Response` with the cached body
 * so callers don't change (they still call `res.json()` and get the data).
 *
 * Storage: localStorage (persistent across sessions). The 5-min TTL ensures
 * stale entries are revalidated periodically.
 */

import { browser } from '$app/environment';

const FE_CACHE_PREFIX = 'pb:etag:';
const FE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — performance only; a 304 means "unchanged", correctness comes from BE-side invalidation

interface FECacheEntry {
  etag: string;
  body: string;
  cached_at: number;
}

/** Get the cached ETag + body for a URL, or null if not cached or stale. */
export function getCachedETag(url: string): { etag: string; body: string } | null {
  if (!browser) return null;
  const key = `${FE_CACHE_PREFIX}${url}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FECacheEntry;
    if (Date.now() - parsed.cached_at > FE_CACHE_TTL_MS) return null;
    return { etag: parsed.etag, body: parsed.body };
  } catch {
    // Corrupt cache entry — remove it
    localStorage.removeItem(key);
    return null;
  }
}

/** Store an ETag + body for a URL. */
export function setCachedETag(url: string, etag: string, body: string): void {
  if (!browser) return;
  const key = `${FE_CACHE_PREFIX}${url}`;
  const entry: FECacheEntry = { etag, body, cached_at: Date.now() };
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Quota exceeded — evict oldest entries and retry once
    evictOldestEntries();
    try {
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // Still failing — give up silently (cache is best-effort)
    }
  }
}

/** Clear the cached ETag for a URL (e.g. after a write). */
export function clearCachedETag(url: string): void {
  if (!browser) return;
  localStorage.removeItem(`${FE_CACHE_PREFIX}${url}`);
}

/** Clear all cached ETags (e.g. on logout). */
export function clearAllCachedETags(): void {
  if (!browser) return;
  Object.keys(localStorage)
    .filter((k) => k.startsWith(FE_CACHE_PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}

/** Evict the oldest 25% of cache entries to free up quota. */
function evictOldestEntries(): void {
  if (!browser) return;
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(FE_CACHE_PREFIX));
  if (keys.length === 0) return;
  const entries = keys
    .map((k) => {
      try {
        const parsed = JSON.parse(localStorage.getItem(k)!) as FECacheEntry;
        return { key: k, cached_at: parsed.cached_at };
      } catch {
        return { key: k, cached_at: 0 };
      }
    })
    .sort((a, b) => a.cached_at - b.cached_at);
  const evictCount = Math.ceil(entries.length / 4);
  for (let i = 0; i < evictCount; i++) {
    localStorage.removeItem(entries[i].key);
  }
}
