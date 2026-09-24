/**
 * useAiCerebellum — per-assistant tuning presets ("cerebellum").
 *
 * Singleton cache keyed by assistant_key: the first caller for an assistant
 * fetches all enabled cerebellum rows for that assistant once; subsequent
 * callers share the cached rows (tunings are few — a handful per model).
 *
 * Follows the same exposure pattern as useAiModels:
 *   - module-level `_state` per assistant_key (shared across callers)
 *   - `ensureLoaded()` MUST be called in onMount — never inside $derived
 *   - lookups are pure reads over the cached rows
 */
import type { DeepReadonly } from '$lib/types/deep-readonly';
import { fetchAiCerebellum } from '$lib/api';
import type { AiCerebellum } from '$lib/api-types';
import { clearCachedETag } from '$lib/cache/fe-cache-store';

const AI_CEREBELLUM_URL = '/api/v1/entities/ai_cerebellum/list';

interface AssistantCache {
  tunings: AiCerebellum[];
  loading: boolean;
  error: string | null;
  fetched: boolean;
}

// Module-level singleton — keyed by assistant_key, shared across callers.
// svelte-ignore state_referenced_locally — module-level $state, intentionally shared.
const _caches = $state<Record<string, AssistantCache>>({});

const _promises = new Map<string, Promise<void> | null>();

function getCache(assistant_key: string): AssistantCache {
  if (!_caches[assistant_key]) {
    _caches[assistant_key] = { tunings: [], loading: false, error: null, fetched: false };
  }
  return _caches[assistant_key];
}

async function load(assistant_key: string): Promise<void> {
  const cache = getCache(assistant_key);
  cache.loading = true;
  cache.error = null;
  const p = (async () => {
    try {
      cache.tunings = await fetchAiCerebellum({ assistant_key });
      cache.fetched = true;
    } catch (err) {
      cache.error = err instanceof Error ? err.message : 'Failed to load AI cerebellum tunings';
    } finally {
      cache.loading = false;
      _promises.set(assistant_key, null);
    }
  })();
  _promises.set(assistant_key, p);
  return p;
}

/**
 * Tuning handle bound to one assistant. Create per assistant wrapper:
 * `const cerebellum = useAiCerebellum('json_config')`.
 */
export function useAiCerebellum(assistant_key: string) {
  function ensureLoaded(): Promise<void> {
    const cache = getCache(assistant_key);
    if (cache.fetched || cache.loading || _promises.get(assistant_key)) {
      return _promises.get(assistant_key) ?? Promise.resolve();
    }
    return load(assistant_key);
  }

  return {
    get state(): DeepReadonly<AssistantCache> {
      return getCache(assistant_key) as DeepReadonly<AssistantCache>;
    },
    ensureLoaded,
    /**
     * Enabled tunings for a model (at most one — the (assistant, model) pair
     * is unique in the DB).
     * Pure read — call ensureLoaded() in onMount first.
     */
    getTuningsForModel(model_id: string): AiCerebellum[] {
      return getCache(assistant_key).tunings
        .filter((t) => t.model_id === model_id && t.is_enabled);
    },
    async invalidate(): Promise<void> {
      clearCachedETag(AI_CEREBELLUM_URL);
      const cache = getCache(assistant_key);
      cache.fetched = false;
      await load(assistant_key);
    },
  };
}
