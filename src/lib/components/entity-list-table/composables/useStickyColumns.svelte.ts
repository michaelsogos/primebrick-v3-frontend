import { onMount } from 'svelte';
import type { MetaColumn } from '$lib/entity-list/types';

export function useStickyColumns(options: {
  rowSelectionEnabled: () => boolean;
  stickyColumnsGroup: () => MetaColumn[];
  visibleKeys: () => string[];
}) {
  const safeStickyColumnsGroup = $derived.by(() => options.stickyColumnsGroup() ?? []);

  let checkboxHeadRef = $state<HTMLElement | null>(null);
  let stickyHeadRefs = $state<Map<string, HTMLElement>>(new Map());
  let stickyCellRefs = $state<Map<string, HTMLElement>>(new Map());
  let stickyLeftOffsets = $state<Record<string, number>>({});
  let stickyRO: ResizeObserver | null = null;

  function stickyRef(node: HTMLElement, params: { key: string; isHead: boolean }) {
    let currentKey = params.key;
    let currentIsHead = params.isHead;

    // Initial registration
    let refs = currentIsHead ? stickyHeadRefs : stickyCellRefs;
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
          refs = currentIsHead ? stickyHeadRefs : stickyCellRefs;
          refs.set(currentKey, node);
        }
        queueMicrotask(() => updateStickyOffsets());
      },
      destroy() {
        // Final cleanup on page change or row destruction
        const finalRefs = currentIsHead ? stickyHeadRefs : stickyCellRefs;
        finalRefs.delete(currentKey);
        queueMicrotask(() => updateStickyOffsets());
      }
    };
  }

  function updateStickyOffsets() {
    // Use DOM geometry instead of ref binding
    // First th in thead is always the checkbox column in tables with selection
    const checkboxCol = document.querySelector('thead th:first-child');
    const checkboxW = checkboxCol ? Math.ceil(checkboxCol.getBoundingClientRect().width) : 0;

    const visibleStickyCols = safeStickyColumnsGroup
      .filter((c) => options.visibleKeys().includes(c.key));

    let currentLeft = checkboxW;
    const newOffsets: Record<string, number> = {};

    for (const col of visibleStickyCols) {
      const headRef = stickyHeadRefs.get(col.key);
      const cellRef = stickyCellRefs.get(col.key);

      const headCellW = Math.ceil(headRef?.parentElement?.getBoundingClientRect().width ?? 0);
      const cellCellW = Math.ceil(cellRef?.parentElement?.getBoundingClientRect().width ?? 0);
      const colW = Math.max(headCellW, cellCellW);

      if (colW === 0 && col.key in stickyLeftOffsets) {
        newOffsets[col.key] = stickyLeftOffsets[col.key];
      } else {
        newOffsets[col.key] = currentLeft;
        currentLeft += colW;
      }
    }

    stickyLeftOffsets = newOffsets;
  }

  onMount(() => {
    const onResize = () => {
      requestAnimationFrame(() => updateStickyOffsets());
    };
    window.addEventListener('resize', onResize);
    requestAnimationFrame(() => updateStickyOffsets());
    return () => window.removeEventListener('resize', onResize);
  });

  // Effect 1: Track Svelte state changes (structure/visibility)
  $effect(() => {
    // Register reactive dependencies
    void checkboxHeadRef; // Track ref changes
    options.rowSelectionEnabled();
    options.visibleKeys();
    const group = safeStickyColumnsGroup;

    // Recalculate offsets when structure changes
    updateStickyOffsets();
  });

  // Effect 2: Manage ResizeObserver for DOM dimension changes
  $effect(() => {
    // Track checkboxHeadRef so effect re-runs when ref populates after mount
    void checkboxHeadRef;

    stickyRO?.disconnect();
    stickyRO = null;

    const allRefs = [...stickyHeadRefs.values(), ...stickyCellRefs.values()];
    
    // Add checkbox ref if it exists (matching original implementation)
    if (checkboxHeadRef) {
      allRefs.push(checkboxHeadRef);
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
    get checkboxHeadRef() { return checkboxHeadRef; },
    set checkboxHeadRef(v) { checkboxHeadRef = v; },
    get stickyHeadRefs() { return stickyHeadRefs; },
    get stickyCellRefs() { return stickyCellRefs; },
    get stickyLeftOffsets() { return stickyLeftOffsets; },
    stickyRef,
    updateStickyOffsets
  };
}
