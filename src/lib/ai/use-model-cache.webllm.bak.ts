/**
 * useModelCache — composable managing WebLLM model cache lifecycle.
 *
 * Responsibilities:
 * - Check which models are cached (IndexedDB via hasModelInCache)
 * - Estimate per-model size from Cache API response content-length headers
 * - Estimate global storage usage via navigator.storage.estimate()
 * - Delete a single model from cache (IndexedDB + Cache API)
 * - Block deletion if the model is currently loaded in VRAM ("in use")
 * - Delete all cached models except the active one
 * - Track MRU (most-recently-used) order in localStorage for auto-eviction
 * - Auto-evict oldest models beyond MAX_CACHED (3) when a new model is loaded
 *
 * Follows the composable state exposure pattern (mandatory AGENTS.md rule):
 * - Consolidated `_state` object (underscore = internal)
 * - Exposed via `get state(): DeepReadonly<typeof _state>`
 * - Mutations only through exposed mutator functions
 */
import type { DeepReadonly } from '$lib/types/deep-readonly';

/** Cache API cache name used by the Service Worker (must match sw-regex-ai.js). */
const SW_CACHE_NAME = 'webllm-models-v1';

/** localStorage key for persisting the MRU order across page reloads. */
const MRU_STORAGE_KEY = 'primebrick:ai-model-mru';

/** Maximum number of models to keep cached. Older ones are auto-evicted. */
const MAX_CACHED = 3;

export function useModelCache() {
  const _state = $state({
    /** model_id → is_cached (from IndexedDB via hasModelInCache). */
    cache_status: {} as Record<string, boolean>,
    /** model_id → estimated size in bytes (from Cache API content-length). */
    model_sizes: {} as Record<string, number>,
    /** Total bytes used (from navigator.storage.estimate). */
    storage_usage: null as number | null,
    /** Total bytes quota (from navigator.storage.estimate). */
    storage_quota: null as number | null,
    /** model_ids ordered by last use (most recent first). */
    mru_order: [] as string[],
    is_checking: false,
    is_deleting: false,
    /** Error message for the last failed operation (e.g. "model in use"). */
    error: null as string | null,
    /**
     * Models found in the Cache API that are NOT in the ai_models DB catalog.
     * These are "orphaned" — downloaded previously but no longer listed.
     * model_id → estimated size in bytes.
     */
    orphaned_models: {} as Record<string, number>,
  });

  /** Load MRU order from localStorage. */
  function loadMru(): string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(MRU_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  /** Save MRU order to localStorage. */
  function saveMru(order: string[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(MRU_STORAGE_KEY, JSON.stringify(order));
    } catch {
      // ignore
    }
  }

  /**
   * Scan the Cache API for ALL cached model IDs (not just the known ones).
   * Extracts the model_id from the URL path (huggingface.co/mlc-ai/{model_id}/...).
   * Returns a map of model_id → total size in bytes.
   */
  async function scanAllCachedModels(): Promise<Record<string, number>> {
    const sizes: Record<string, number> = {};
    if (typeof caches === 'undefined') return sizes;

    try {
      const cache = await caches.open(SW_CACHE_NAME);
      const keys = await cache.keys();

      for (const req of keys) {
        const url = new URL(req.url);
        const parts = url.pathname.split('/');
        const idx = parts.indexOf('mlc-ai');
        if (idx < 0 || !parts[idx + 1]) continue;

        const modelId = parts[idx + 1];
        const response = await cache.match(req);
        if (response) {
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
            sizes[modelId] = (sizes[modelId] ?? 0) + parseInt(contentLength, 10);
          }
        }
      }
    } catch {
      // ignore
    }

    return sizes;
  }

  /**
   * Estimate per-model sizes from the Cache API.
   * Groups cached HTTP responses by model ID (matching the URL path)
   * and sums content-length headers.
   */
  async function estimateModelSizes(model_ids: string[]): Promise<Record<string, number>> {
    const sizes: Record<string, number> = {};
    if (typeof caches === 'undefined') return sizes;

    try {
      const cache = await caches.open(SW_CACHE_NAME);
      const keys = await cache.keys();

      for (const req of keys) {
        const url = req.url;
        for (const model_id of model_ids) {
          // Model files URLs contain the model_id in the path
          if (url.includes(model_id)) {
            const response = await cache.match(req);
            if (response) {
              const contentLength = response.headers.get('content-length');
              if (contentLength) {
                sizes[model_id] = (sizes[model_id] ?? 0) + parseInt(contentLength, 10);
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }

    return sizes;
  }

  /**
   * Refresh cache status for the given model IDs.
   * Checks IndexedDB (hasModelInCache), estimates per-model sizes from Cache API,
   * and gets the global storage estimate.
   */
  async function refreshCacheStatus(model_ids: string[]): Promise<void> {
    _state.is_checking = true;
    _state.error = null;
    try {
      const webllm = await import('@mlc-ai/web-llm');
      const status: Record<string, boolean> = {};
      for (const id of model_ids) {
        status[id] = await webllm.hasModelInCache(id);
      }
      _state.cache_status = status;

      // Per-model sizes from Cache API (known models)
      _state.model_sizes = await estimateModelSizes(model_ids);

      // Scan ALL cached models to detect orphans (not in the DB catalog)
      const knownSet = new Set(model_ids);
      const allCached = await scanAllCachedModels();
      const orphans: Record<string, number> = {};
      for (const [id, size] of Object.entries(allCached)) {
        if (!knownSet.has(id)) {
          orphans[id] = size;
        }
      }
      _state.orphaned_models = orphans;

      // Global storage estimate
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        _state.storage_usage = est.usage ?? null;
        _state.storage_quota = est.quota ?? null;
      }

      // Load MRU from localStorage
      _state.mru_order = loadMru();
    } catch {
      // ignore
    } finally {
      _state.is_checking = false;
    }
  }

  /**
   * Delete a single model from cache (IndexedDB + Cache API).
   * Blocks deletion if the model is currently loaded in VRAM (active_model_id).
   */
  async function deleteModel(model_id: string, active_model_id: string | null): Promise<void> {
    if (model_id === active_model_id) {
      _state.error = 'in_use';
      return;
    }

    _state.is_deleting = true;
    _state.error = null;
    try {
      const webllm = await import('@mlc-ai/web-llm');
      await webllm.deleteModelAllInfoInCache(model_id);

      // Also purge Cache API entries for this model
      if (typeof caches !== 'undefined') {
        const cache = await caches.open(SW_CACHE_NAME);
        const keys = await cache.keys();
        await Promise.all(
          keys
            .filter((req) => req.url.includes(model_id))
            .map((req) => cache.delete(req)),
        );
      }

      _state.cache_status[model_id] = false;
      _state.model_sizes[model_id] = 0;
      delete _state.orphaned_models[model_id];

      // Remove from MRU
      _state.mru_order = _state.mru_order.filter((id) => id !== model_id);
      saveMru(_state.mru_order);
    } catch (err) {
      _state.error = err instanceof Error ? err.message : 'Failed to delete model';
    } finally {
      _state.is_deleting = false;
    }
  }

  /**
   * Delete all cached models except the one currently in use.
   */
  async function deleteAllModels(active_model_id: string | null): Promise<void> {
    _state.is_deleting = true;
    _state.error = null;
    try {
      // Known cached models
      const cachedIds = Object.keys(_state.cache_status).filter(
        (id) => _state.cache_status[id] && id !== active_model_id,
      );

      for (const id of cachedIds) {
        await deleteModel(id, active_model_id);
      }

      // Orphaned models (not in DB catalog but present in Cache API)
      const orphanIds = Object.keys(_state.orphaned_models).filter(
        (id) => id !== active_model_id,
      );
      for (const id of orphanIds) {
        await deleteModel(id, active_model_id);
      }

      // If no active model, clear entire SW cache
      if (!active_model_id && typeof caches !== 'undefined') {
        await caches.delete(SW_CACHE_NAME);
      }

      // Refresh storage estimate
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        _state.storage_usage = est.usage ?? null;
        _state.storage_quota = est.quota ?? null;
      }
    } catch (err) {
      _state.error = err instanceof Error ? err.message : 'Failed to delete all models';
    } finally {
      _state.is_deleting = false;
    }
  }

  /**
   * Record that a model was just used (called on model load/switch).
   * Updates the MRU list and auto-evicts oldest models beyond MAX_CACHED.
   */
  async function recordModelUse(model_id: string): Promise<void> {
    let order = loadMru();

    // Remove if already present
    order = order.filter((id) => id !== model_id);

    // Prepend (most recent first)
    order.unshift(model_id);

    // Auto-evict: if more than MAX_CACHED models are cached, delete the oldest
    const webllm = await import('@mlc-ai/web-llm');
    const cachedStatus: Record<string, boolean> = {};

    // Check which models in MRU are actually cached
    for (const id of order) {
      cachedStatus[id] = await webllm.hasModelInCache(id);
    }

    // Count cached models
    const cachedIds = order.filter((id) => cachedStatus[id]);

    // If more than MAX_CACHED, evict the oldest (from the end)
    if (cachedIds.length > MAX_CACHED) {
      const toEvict = cachedIds.slice(MAX_CACHED);
      for (const id of toEvict) {
        try {
          await webllm.deleteModelAllInfoInCache(id);
          if (typeof caches !== 'undefined') {
            const cache = await caches.open(SW_CACHE_NAME);
            const keys = await cache.keys();
            await Promise.all(
              keys
                .filter((req) => req.url.includes(id))
                .map((req) => cache.delete(req)),
            );
          }
          cachedStatus[id] = false;
        } catch {
          // ignore eviction errors
        }
      }
    }

    // Update state
    _state.mru_order = order.filter((id) => cachedStatus[id] || id === model_id);
    _state.cache_status = { ..._state.cache_status, ...cachedStatus };
    saveMru(_state.mru_order);
  }

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    refreshCacheStatus,
    deleteModel,
    deleteAllModels,
    recordModelUse,
  };
}
