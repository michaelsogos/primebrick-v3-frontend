/**
 * useConfigEntries — singleton composable that fetches all config entries
 * once, caches them in `$state`, and exposes per-key lookups.
 *
 * Multiple components calling `useConfigEntries()` share the same cached
 * fetch (module-level singleton state).
 *
 * Caching layers:
 *   1. HTTP-level: `apiFetch` ETag cache (If-None-Match → 304 → synthetic 200
 *      from localStorage). See `src/lib/cache/fe-cache-store.ts`.
 *   2. Session-level: this composable's in-memory `$state`. Once loaded,
 *      subsequent calls return immediately without hitting the network.
 *
 * `invalidate()` clears the ETag cache and marks the in-memory state as
 * stale, so the next `getValue()` call re-fetches. Call this after writes
 * (create/update/delete) so other components pick up the new values.
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 *   - `_state` is internal (underscore prefix)
 *   - Exposed via `get state()` returning `DeepReadonly`
 *   - Mutations only through exposed mutator functions
 */
import type { DeepReadonly } from '$lib/types/deep-readonly';
import { fetchConfigEntries } from '$lib/api';
import type { ConfigEntry } from '$lib/api-types';
import { clearCachedETag } from '$lib/cache/fe-cache-store';

const CONFIG_ENTRIES_URL = '/api/v1/entities/config_entries/list';

// Module-level singleton — shared across all callers.
// svelte-ignore state_referenced_locally — module-level $state, intentionally shared.
const _state = $state({
  entries: [] as ConfigEntry[],
  loading: false,
  error: null as string | null,
  fetched: false,
});

let fetchPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (_state.fetched || _state.loading || fetchPromise) {
    return fetchPromise ?? Promise.resolve();
  }
  _state.loading = true;
  _state.error = null;
  fetchPromise = (async () => {
    try {
      _state.entries = await fetchConfigEntries();
      _state.fetched = true;
    } catch (err) {
      _state.error = err instanceof Error ? err.message : 'Failed to load config';
    } finally {
      _state.loading = false;
      fetchPromise = null;
    }
  })();
  return fetchPromise;
}

export function useConfigEntries() {
  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    getEntry(key: string): DeepReadonly<ConfigEntry> | undefined {
      void ensureLoaded();
      return _state.entries.find((e) => e.key === key);
    },
    getValue(key: string): string | bigint | number | null | undefined {
      void ensureLoaded();
      return _state.entries.find((e) => e.key === key)?.value;
    },
    async refresh(): Promise<void> {
      _state.fetched = false;
      _state.loading = false;
      fetchPromise = null;
      await ensureLoaded();
    },
    invalidate(): void {
      clearCachedETag(CONFIG_ENTRIES_URL);
      _state.fetched = false;
    },
    ensureLoaded,
  };
}
