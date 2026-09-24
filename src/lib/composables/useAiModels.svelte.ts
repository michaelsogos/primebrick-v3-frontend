/**
 * useAiModels — singleton composable that fetches all AI models
 * once, caches them in `$state`, and exposes per-model_id lookups.
 *
 * Multiple components calling `useAiModels()` share the same cached
 * fetch (module-level singleton state).
 *
 * Caching layers:
 *   1. HTTP-level: `apiFetch` ETag cache (If-None-Match → 304 → synthetic 200
 *      from localStorage). See `src/lib/cache/fe-cache-store.ts`.
 *   2. Session-level: this composable's in-memory `$state`. Once loaded,
 *      subsequent calls return immediately without hitting the network.
 *
 * `invalidate()` clears the ETag cache and marks the in-memory state as
 * stale, so the next `getVisibleModels()` call re-fetches. Call this after
 * writes (create/update/delete) so other components pick up the new values.
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 *   - `_state` is internal (underscore prefix)
 *   - Exposed via `get state()` returning `DeepReadonly`
 *   - Mutations only through exposed mutator functions
 */
import type { DeepReadonly } from '$lib/types/deep-readonly';
import { fetchAiModels, apiFetch } from '$lib/api';
import type { AiModel } from '$lib/api-types';
import { clearCachedETag } from '$lib/cache/fe-cache-store';

const AI_MODELS_URL = '/api/v1/entities/ai_model/list';

type DeletionFilterMode = 'non_deleted' | 'deleted' | 'all';

// Module-level singleton — shared across all callers.
// svelte-ignore state_referenced_locally — module-level $state, intentionally shared.
const _state = $state({
  models: [] as AiModel[],
  loading: false,
  error: null as string | null,
  fetched: false,
  deletionFilterMode: 'non_deleted' as DeletionFilterMode,
});

/**
 * Full catalog — ALWAYS `deleted_records=INCLUDED`, independent of the
 * deletion-filter toggle. The toolbar filter is a LIST concern only: cache
 * management and canonical name resolution must see every cataloged model
 * (disabled AND soft-deleted), otherwise their cached files would be
 * wrongly reported as orphans.
 */
const _catalog = $state({
  models: [] as AiModel[],
  fetched: false,
});
let catalogPromise: Promise<void> | null = null;

async function ensureCatalogLoaded(): Promise<void> {
  if (_catalog.fetched || catalogPromise) return catalogPromise ?? Promise.resolve();
  catalogPromise = (async () => {
    try {
      _catalog.models = await fetchAiModels('INCLUDED');
      _catalog.fetched = true;
    } finally {
      catalogPromise = null;
    }
  })();
  return catalogPromise;
}

let fetchPromise: Promise<void> | null = null;

function deletionFilterToParam(mode: DeletionFilterMode): 'EXCLUDED' | 'ONLY' | 'INCLUDED' | undefined {
  if (mode === 'non_deleted') return undefined; // BE default is EXCLUDED
  if (mode === 'deleted') return 'ONLY';
  return 'INCLUDED';
}

async function ensureLoaded(): Promise<void> {
  if (_state.fetched || _state.loading || fetchPromise) {
    return fetchPromise ?? Promise.resolve();
  }
  return fetchVisibleModels();
}

async function fetchVisibleModels(): Promise<void> {
  _state.loading = true;
  _state.error = null;
  fetchPromise = (async () => {
    try {
      _state.models = await fetchAiModels(deletionFilterToParam(_state.deletionFilterMode));
      _state.fetched = true;
    } catch (err) {
      _state.error = err instanceof Error ? err.message : 'Failed to load AI models';
    } finally {
      _state.loading = false;
      fetchPromise = null;
    }
  })();
  return fetchPromise;
}

/**
 * Reload after data writes (create/update/delete/restore). Refreshes BOTH
 * the filtered list and the catalog snapshot — the snapshot is the source
 * of truth for cache attribution, so it must track catalog mutations.
 * UI filter changes do NOT go through here (see setDeletionFilterMode).
 */
async function reload(): Promise<void> {
  clearCachedETag(AI_MODELS_URL);
  _state.fetched = false;
  _catalog.fetched = false;
  await fetchVisibleModels();
  await ensureCatalogLoaded();
}

export function useAiModels() {
  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    /**
     * Visible list (respects the deletion-filter toggle) sorted by
     * sort_order — the catalog rows the user can actually pick.
     * Callers MUST call ensureLoaded() in onMount first (no state
     * mutation inside derived contexts).
     */
    getVisibleModels(): AiModel[] {
      return [..._state.models].sort((a, b) => a.sort_order - b.sort_order);
    },
    /**
     * Alive + compatible models — the set users can select for chat and
     * cerebellum tuning. From the catalog snapshot (not the filtered
     * list), excluding soft-deleted rows.
     */
    getAliveCompatibleModels(): AiModel[] {
      return _catalog.models
        .filter((m) => m.compatibility_status === 'COMPATIBLE' && !m.deleted_at)
        .sort((a, b) => a.sort_order - b.sort_order);
    },
    /**
     * FULL catalog — every ai_models row including disabled and soft-deleted,
     * unaffected by the deletion-filter toggle. Cache management and
     * canonical-name resolution use this; the filtered list uses `state.models`.
     * Call `ensureCatalogLoaded()` before reading (same contract as
     * `getVisibleModels`).
     */
    getAllModels(): AiModel[] {
      return _catalog.models;
    },
    getCatalogModelByModelId(model_id: string): AiModel | undefined {
      return _catalog.models.find((m) => m.model_id === model_id);
    },
    /**
     * Compatible-models snapshot — from the full catalog (INCLUDED), NOT
     * the filtered visible list and NOT filtered by is_enabled. This is
     * the stable reference for cache attribution and machine-rank
     * comparison: it changes only on catalog writes (reload/invalidate),
     * never on UI deletion-filter changes.
     */
    getCompatibleModels(): AiModel[] {
      return _catalog.models.filter((m) => m.compatibility_status === 'COMPATIBLE');
    },
    ensureCatalogLoaded,
    getModelByModelId(model_id: string): AiModel | undefined {
      // Same as getVisibleModels — no ensureLoaded() call here.
      return _state.models.find((m) => m.model_id === model_id);
    },
    ensureLoaded,
    reload,
    setDeletionFilterMode(mode: DeletionFilterMode): void {
      if (_state.deletionFilterMode === mode) return;
      _state.deletionFilterMode = mode;
      // UI filter only — must NOT touch the catalog snapshot.
      _state.fetched = false;
      void fetchVisibleModels();
    },
    async deleteModel(uuid: string, version: number, mfaToken?: string): Promise<boolean> {
      const res = await apiFetch(`/api/v1/entities/ai_model/${uuid}?version=${version}`, {
        method: 'DELETE',
        headers: mfaToken ? { 'X-MFA-Action-Authorization': mfaToken } : {},
      });
      if (!res.ok) return false;
      await reload();
      return true;
    },
    async restoreModel(uuid: string, version: number): Promise<boolean> {
      const res = await apiFetch(`/api/v1/entities/ai_model/${uuid}/restore?version=${version}`, {
        method: 'POST',
      });
      if (!res.ok) return false;
      await reload();
      return true;
    },
    invalidate(): void {
      clearCachedETag(AI_MODELS_URL);
      _state.fetched = false;
      _catalog.fetched = false;
    },
  };
}
