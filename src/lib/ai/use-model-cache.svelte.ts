/**
 * useModelCache — composable managing Transformers.js model cache lifecycle.
 *
 * Responsibilities:
 * - Check which models are cached (via Cache API scan)
 * - Measure per-model size from Cache API response blob sizes
 * - Estimate global storage usage via navigator.storage.estimate()
 * - Delete a single model from cache (Cache API)
 * - Block deletion if the model is currently loaded in VRAM ("in use")
 * - Delete all cached models
 * - Track MRU (most-recently-used) order in localStorage for auto-eviction
 * - Auto-evict oldest models beyond MAX_CACHED (3) when a new model is loaded
 *
 * Transformers.js uses the browser Cache API automatically (env.useBrowserCache).
 * Models are cached under cache names containing "transformers", "onnx", or "hf".
 * This composable scans those caches and groups files by model_id (extracted from URL).
 *
 * Follows the composable state exposure pattern (mandatory AGENTS.md rule):
 * - Consolidated `_state` object (underscore = internal)
 * - Exposed via `get state(): DeepReadonly<typeof _state>`
 * - Mutations only through exposed mutator functions
 */
import type { DeepReadonly } from '$lib/types/deep-readonly';

/** localStorage key for persisting the MRU order across page reloads. */
const MRU_STORAGE_KEY = 'primebrick:ai-model-mru-transformers';

/** Maximum number of models to keep cached. Older ones are auto-evicted. */
const MAX_CACHED = 3;

/** Cache name prefixes used by Transformers.js (env.useBrowserCache). */
const TRANSFORMERS_CACHE_PREFIXES = ['transformers', 'onnx', 'hf'];

/**
 * Derives a user-friendly display name from a raw model_id, for orphaned
 * cache entries that have no catalog display name.
 * "onnx-community/Qwen2.5-Coder-3B-Instruct#fp16" → "Qwen2.5 Coder 3B (fp16)"
 */
export function friendlyModelName(model_id: string): string {
  const [repo, dtype] = model_id.split('#');
  const base = (repo.split('/').pop() ?? repo).replace(/-/g, ' ');
  return dtype ? `${base} (${dtype})` : base;
}

export function useModelCache() {
  const _state = $state({
    /** model_id → is_cached (from Cache API scan). */
    cache_status: {} as Record<string, boolean>,
    /** model_id → measured size in bytes (from Cache API blob sizes). */
    model_sizes: {} as Record<string, number>,
    /** Total bytes used (from navigator.storage.estimate). */
    storage_usage: null as number | null,
    /** Total bytes quota (from navigator.storage.estimate). */
    storage_quota: null as number | null,
    /** model_ids ordered by last use (most recent first). */
    mru_order: [] as string[],
    is_checking: false,
    /** True after the first cache scan completes — gates the empty state. */
    has_scanned: false,
    is_deleting: false,
    /** Error message for the last failed operation (e.g. "model in use"). */
    error: null as string | null,
    /**
     * Models found in the Cache API that are NOT in the ai_models DB catalog.
     * These are "orphaned" — downloaded previously but no longer listed.
     * model_id → measured size in bytes.
     */
    orphaned_models: {} as Record<string, number>,
    /**
     * Storage breakdown segments (bytes). Their sum + free space must equal
     * the storage quota — the progress bar is only honest if every used byte
     * is attributed to exactly one segment.
     */
    /** Bytes attributed to models present in the ai_models catalog. */
    cataloged_bytes: 0,
    /** Bytes in Cache API entries whose URL is not attributable to a model. */
    non_model_cache_bytes: 0,
    /**
     * storage.estimate().usage minus all measured bytes — covers IndexedDB,
     * service workers, localStorage and anything the Cache API scan cannot see.
     */
    other_storage_bytes: 0,
  });

  /** Last full scan result — reused to recompute the breakdown after deletes. */
  let lastScan: { models: Record<string, number>; non_model_bytes: number } | null = null;
  let lastKnown: { knownSet: Set<string>; knownRepos: Set<string> } | null = null;

  /** Recompute the storage breakdown segments from the last scan + estimate. */
  function computeBreakdown(): void {
    if (!lastScan || !lastKnown) return;
    let cataloged = 0;
    let orphaned = 0;
    for (const [id, size] of Object.entries(lastScan.models)) {
      if (lastKnown.knownSet.has(id) || lastKnown.knownRepos.has(id)) {
        cataloged += size;
      } else {
        orphaned += size;
      }
    }
    _state.cataloged_bytes = cataloged;
    _state.non_model_cache_bytes = lastScan.non_model_bytes;
    const attributed = cataloged + orphaned + lastScan.non_model_bytes;
    _state.other_storage_bytes = Math.max(0, (_state.storage_usage ?? 0) - attributed);
  }

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
   * Check if a cache name belongs to Transformers.js.
   */
  function isTransformersCache(name: string): boolean {
    return TRANSFORMERS_CACHE_PREFIXES.some((prefix) =>
      name.toLowerCase().includes(prefix),
    );
  }

  /**
   * Extract the model_id from a HuggingFace URL.
   * Transformers.js downloads from huggingface.co/{repo_id}/resolve/main/...
   * The repo_id is the model_id (e.g. onnx-community/Qwen3.5-2B-ONNX).
   */
  function extractModelId(url: string): string | null {
    try {
      const u = new URL(url);
      if (u.hostname !== 'huggingface.co' && u.hostname !== 'cdn-lfs.huggingface.co' && u.hostname !== 'cdn-lfs-us-1.huggingface.co') {
        return null;
      }
      // Path: /onnx-community/Qwen3.5-2B-ONNX/resolve/main/...
      // or: /onnx-community/Qwen3.5-2B-ONNX/resolve/...
      const parts = u.pathname.split('/').filter(Boolean);
      // Find "resolve" and take the two parts before it
      const resolveIdx = parts.indexOf('resolve');
      if (resolveIdx >= 2) {
        return parts.slice(resolveIdx - 2, resolveIdx).join('/');
      }
      // Fallback: first two path segments
      if (parts.length >= 2) {
        return parts.slice(0, 2).join('/');
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * ONNX dtype suffix → catalog variant id fragment. Filenames carry the
   * dtype: model_q4f16.onnx, decoder_model_merged_quantized.onnx, etc.
   * Longest suffixes first so 'q4f16' wins over 'q4'.
   */
  const FILE_DTYPE_MAP: [string, string][] = [
    ['q4f16', 'q4f16'], ['q2f16', 'q2f16'], ['q1f16', 'q1f16'],
    ['quantized', 'q8'], ['int8', 'q8'], ['uint8', 'uint8'],
    ['bnb4', 'bnb4'], ['fp16', 'fp16'],
    ['q4', 'q4'], ['q2', 'q2'], ['q1', 'q1'],
  ];

  /**
   * Extract the catalog variant key ('<repo>#<dtype>') from a cached file URL.
   * Files without a dtype suffix (config, tokenizer, unsuffixed model.onnx)
   * return the bare repo id — they are shared by all variants of that repo.
   */
  function extractVariantKey(url: string): string | null {
    const repo = extractModelId(url);
    if (!repo) return null;
    const base = url.split('/').pop() ?? '';
    for (const [suffix, dtype] of FILE_DTYPE_MAP) {
      if (base.includes(`_${suffix}.onnx`)) return `${repo}#${dtype}`;
    }
    return repo;
  }

  /**
   * Scan ALL Cache API stores — no name filter. Every cached response is
   * measured; entries whose URL maps to a model are grouped by variant key
   * ('<repo>#<dtype>' or bare '<repo>'), everything else (non-model caches,
   * unparsable URLs, legacy SW caches) counts into `non_model_bytes`.
   */
  async function scanAllCachedModels(): Promise<{
    models: Record<string, number>;
    non_model_bytes: number;
  }> {
    const models: Record<string, number> = {};
    let non_model_bytes = 0;
    if (typeof caches === 'undefined') return { models, non_model_bytes };

    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const req of keys) {
          const response = await cache.match(req);
          if (!response) continue;
          const blob = await response.blob();
          const key = extractVariantKey(req.url);
          if (key) {
            models[key] = (models[key] ?? 0) + blob.size;
          } else {
            non_model_bytes += blob.size;
          }
        }
      }
    } catch {
      // ignore
    }

    return { models, non_model_bytes };
  }

  /**
   * Refresh cache status for the given model IDs.
   */
  async function refreshCacheStatus(model_ids: string[]): Promise<void> {
    _state.is_checking = true;
    _state.error = null;
    try {
      const scan = await scanAllCachedModels();
      const allCached = scan.models;
      lastScan = scan;
      const knownSet = new Set(model_ids);
      // Bare repo ids present in the catalog (variant ids carry '#dtype').
      const knownRepos = new Set(model_ids.map((id) => id.split('#')[0]));
      lastKnown = { knownSet, knownRepos };

      // Per-model sizes and cache status for known models.
      // A variant is cached only when ITS dtype-suffixed files are present;
      // its reported size also counts files shared at repo level.
      const status: Record<string, boolean> = {};
      const sizes: Record<string, number> = {};
      for (const id of model_ids) {
        const variantBytes = allCached[id] ?? 0;
        const sharedBytes = allCached[id.split('#')[0]] ?? 0;
        status[id] = variantBytes > 0;
        sizes[id] = variantBytes + sharedBytes;
      }
      _state.cache_status = status;
      _state.model_sizes = sizes;

      // Detect orphans (cached but not in DB catalog — neither as variant
      // nor as a bare repo of any cataloged model)
      const orphans: Record<string, number> = {};
      for (const [id, size] of Object.entries(allCached)) {
        if (!knownSet.has(id) && !knownRepos.has(id)) {
          orphans[id] = size;
        }
      }
      _state.orphaned_models = orphans;

      // Global storage estimate, then attribute every used byte to a segment
      await refreshStorageEstimate();
      computeBreakdown();

      // Load MRU from localStorage
      _state.mru_order = loadMru();
    } catch {
      // ignore
    } finally {
      _state.is_checking = false;
      _state.has_scanned = true;
    }
  }

  /** Re-read navigator.storage.estimate() into state (after deletions). */
  async function refreshStorageEstimate(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
    const est = await navigator.storage.estimate();
    _state.storage_usage = est.usage ?? null;
    _state.storage_quota = est.quota ?? null;
  }

  /**
   * Delete a single model from cache (all Transformers.js caches).
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
      if (typeof caches !== 'undefined') {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          if (!isTransformersCache(name)) continue;
          const cache = await caches.open(name);
          const keys = await cache.keys();
          await Promise.all(
            keys
              .filter((req) => {
                // Delete the variant's own files plus repo-shared files
                // (config/tokenizer) — other variants re-fetch them if needed.
                const key = extractVariantKey(req.url);
                return key === model_id || key === model_id.split('#')[0];
              })
              .map((req) => cache.delete(req)),
          );
        }
      }

      _state.cache_status[model_id] = false;
      _state.model_sizes[model_id] = 0;
      delete _state.orphaned_models[model_id];

      // Drop the deleted entries from the last scan so the breakdown
      // segments stay consistent with what was actually removed
      if (lastScan) {
        delete lastScan.models[model_id];
        delete lastScan.models[model_id.split('#')[0]];
      }

      // Remove from MRU
      _state.mru_order = _state.mru_order.filter((id) => id !== model_id);
      saveMru(_state.mru_order);

      // Refresh the storage bar — freed bytes show immediately
      await refreshStorageEstimate();
      computeBreakdown();
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

      // Orphaned models
      const orphanIds = Object.keys(_state.orphaned_models).filter(
        (id) => id !== active_model_id,
      );
      for (const id of orphanIds) {
        await deleteModel(id, active_model_id);
      }

      // If no active model, clear all Transformers.js caches entirely
      if (!active_model_id && typeof caches !== 'undefined') {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          if (isTransformersCache(name)) {
            await caches.delete(name);
          }
        }
      }

      // Rescan + refresh so the breakdown reflects the mass deletion
      lastScan = await scanAllCachedModels();
      await refreshStorageEstimate();
      computeBreakdown();
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
    order = order.filter((id) => id !== model_id);
    order.unshift(model_id);

    // Check which models in MRU are actually cached
    const allCached = (await scanAllCachedModels()).models;
    const cachedStatus: Record<string, boolean> = {};
    for (const id of order) {
      cachedStatus[id] = (allCached[id] ?? 0) > 0;
    }

    // Count cached models
    const cachedIds = order.filter((id) => cachedStatus[id]);

    // If more than MAX_CACHED, evict the oldest (from the end)
    if (cachedIds.length > MAX_CACHED) {
      const toEvict = cachedIds.slice(MAX_CACHED);
      for (const id of toEvict) {
        try {
          await deleteModel(id, null);
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
