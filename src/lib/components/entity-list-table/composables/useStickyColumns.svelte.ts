import { onMount, untrack } from 'svelte';
import type { MetaColumn } from '$lib/entity-list/types';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useStickyColumns(options: {
  rowSelectionEnabled: () => boolean;
  stickyColumnsGroup: () => MetaColumn[];
  visibleKeys: () => string[];
}) {
  const safeStickyColumnsGroup = $derived.by(() => options.stickyColumnsGroup() ?? []);

  const _state = $state({
    checkboxHeadRef: null as HTMLElement | null,
    stickyHeadRefs: new Map<string, HTMLElement>(),
    stickyCellRefs: new Map<string, HTMLElement>(),
    stickyLeftOffsets: {} as Record<string, number>,
  });
  let stickyRO: ResizeObserver | null = null;

  function stickyRef(node: HTMLElement, params: { key: string; isHead: boolean }) {
    let currentKey = params.key;
    let currentIsHead = params.isHead;

    // Initial registration
    let refs = currentIsHead ? _state.stickyHeadRefs : _state.stickyCellRefs;
    refs.set(currentKey, node);
    queueMicrotask(() => updateStickyOffsets());

    return {
      update(newParams: { key: string; isHead: boolean }) {
        // If key changes (e.g., due to dynamic column reordering)
        if (newParams.key !== currentKey || newParams.isHead !== currentIsHead) {
          // Clean up old association
          refs.delete(currentKey);

          // Update current parameters
          currentKey = newParams.key;
          currentIsHead = newParams.isHead;

          // Register on correct Map
          refs = currentIsHead ? _state.stickyHeadRefs : _state.stickyCellRefs;
          refs.set(currentKey, node);
        }
        queueMicrotask(() => updateStickyOffsets());
      },
      destroy() {
        // Final cleanup on page change or row destruction
        const finalRefs = currentIsHead ? _state.stickyHeadRefs : _state.stickyCellRefs;
        finalRefs.delete(currentKey);
        queueMicrotask(() => updateStickyOffsets());
      }
    };
  }

  let updatingStickyOffsets = false;

  function updateStickyOffsets() {
    if (updatingStickyOffsets) return;
    updatingStickyOffsets = true;
    try {
      // Use DOM geometry instead of ref binding
      // First th in thead is always the checkbox column in tables with selection
      const checkboxCol = document.querySelector('thead th:first-child');
      const checkboxW = checkboxCol ? Math.ceil(checkboxCol.getBoundingClientRect().width) : 0;

      const visibleStickyCols = safeStickyColumnsGroup
        .filter((c) => options.visibleKeys().includes(c.key));

      let currentLeft = checkboxW;
      const newOffsets: Record<string, number> = {};

      for (const col of visibleStickyCols) {
        const headRef = _state.stickyHeadRefs.get(col.key);
        const cellRef = _state.stickyCellRefs.get(col.key);

        const headCellW = Math.ceil(headRef?.parentElement?.getBoundingClientRect().width ?? 0);
        const cellCellW = Math.ceil(cellRef?.parentElement?.getBoundingClientRect().width ?? 0);
        const colW = Math.max(headCellW, cellCellW);

        if (colW === 0 && col.key in _state.stickyLeftOffsets) {
          newOffsets[col.key] = _state.stickyLeftOffsets[col.key];
        } else {
          newOffsets[col.key] = currentLeft;
          currentLeft += colW;
        }
      }

      untrack(() => {
        _state.stickyLeftOffsets = newOffsets;
      });
    } finally {
      updatingStickyOffsets = false;
    }
  }

  onMount(() => {
    const onResize = () => {
      requestAnimationFrame(() => updateStickyOffsets());
    };
    window.addEventListener('resize', onResize);
    requestAnimationFrame(() => updateStickyOffsets());
    return () => window.removeEventListener('resize', onResize);
  });

  // ResizeObserver effect: watches DOM dimension changes only
  $effect(() => {
    // Track checkboxHeadRef so effect re-runs when ref populates after mount
    void _state.checkboxHeadRef;

    stickyRO?.disconnect();
    stickyRO = null;

    const allRefs = [..._state.stickyHeadRefs.values(), ..._state.stickyCellRefs.values()];
    
    // Add checkbox ref if it exists (matching original implementation)
    if (_state.checkboxHeadRef) {
      allRefs.push(_state.checkboxHeadRef);
    }
    
    if (allRefs.length > 0) {
      stickyRO = new ResizeObserver(() => {
        requestAnimationFrame(() => updateStickyOffsets());
      });
      for (const ref of allRefs) {
        stickyRO.observe(ref);
      }
    }

    return () => {
      stickyRO?.disconnect();
      stickyRO = null;
    };
  });

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    get checkboxHeadRef() { return _state.checkboxHeadRef; },
    set checkboxHeadRef(v) { _state.checkboxHeadRef = v; },
    stickyRef,
    updateStickyOffsets
  };
}
