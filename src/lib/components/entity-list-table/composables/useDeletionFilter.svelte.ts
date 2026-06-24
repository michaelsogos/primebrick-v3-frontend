import { onMount } from 'svelte';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export type DeletionFilterMode = 'non_deleted' | 'deleted' | 'all';

export function useDeletionFilter(
  uid: string,
  columnOrderStorageKey?: string,
  deletionFilterModeProp: DeletionFilterMode = 'non_deleted',
  onDeletionFilterModeChange?: (mode: DeletionFilterMode) => void
) {
  const deletionFilterStorageKey = $derived(
    columnOrderStorageKey ? `${columnOrderStorageKey}:deletionFilter` : `pb.entityList:${uid}:deletionFilter`
  );

  const _rawDeletion = (() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(deletionFilterStorageKey);
  })();

  const _initialDeletionMode: DeletionFilterMode | null =
    _rawDeletion === 'non_deleted' || _rawDeletion === 'deleted' || _rawDeletion === 'all' ? _rawDeletion : null;

  const _state = $state({
    deletionFilterMode: (_initialDeletionMode ?? deletionFilterModeProp) as DeletionFilterMode,
  });

  function readDeletionFilter(): DeletionFilterMode | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(deletionFilterStorageKey);
      if (raw === 'non_deleted' || raw === 'deleted' || raw === 'all') return raw;
      return null;
    } catch {
      return null;
    }
  }

  function writeDeletionFilter(next: DeletionFilterMode) {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(deletionFilterStorageKey, next);
    } catch {
      // ignore quota / blocked storage
    }
  }

  // Initialize on mount
  onMount(() => {
    const stored = readDeletionFilter();
    if (stored) {
      _state.deletionFilterMode = stored;
      // If the restored value differs from what the parent passed, notify the parent so it re-fetches
      if (stored !== deletionFilterModeProp) {
        onDeletionFilterModeChange?.(stored);
      }
    }
  });

  // Persist changes
  let lastDeletionFilterMode: DeletionFilterMode | null = null;
  $effect(() => {
    void _state.deletionFilterMode;
    writeDeletionFilter(_state.deletionFilterMode);
    // Skip the initial firing so we don't trigger an extra refresh on mount when the
    // value didn't actually change (the parent already holds the same value).
    if (lastDeletionFilterMode !== null && lastDeletionFilterMode !== _state.deletionFilterMode) {
      onDeletionFilterModeChange?.(_state.deletionFilterMode);
    }
    lastDeletionFilterMode = _state.deletionFilterMode;
  });

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    get deletionFilterStorageKey() { return deletionFilterStorageKey; },
    setDeletionFilterMode: (mode: DeletionFilterMode) => { _state.deletionFilterMode = mode; }
  };
}
