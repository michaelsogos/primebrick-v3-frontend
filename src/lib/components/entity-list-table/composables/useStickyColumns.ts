import { onMount } from 'svelte';
import type { MetaColumn } from '$lib/entity-list/types';

export function useStickyColumns(
  rowSelectionEnabled: boolean,
  stickyColumnsGroup: MetaColumn[],
  visibleKeys: string[]
) {
  let checkboxHeadRef = $state<HTMLElement | null>(null);
  let stickyHeadRefs = $state<Map<string, HTMLElement>>(new Map());
  let stickyCellRefs = $state<Map<string, HTMLElement>>(new Map());
  let stickyLeftOffsets = $state<Map<string, number>>(new Map());
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
    const checkboxW = rowSelectionEnabled ? (checkboxHeadRef?.getBoundingClientRect().width ?? 0) : 0;

    // Get visible sticky columns in their persisted order
    const visibleStickyCols = stickyColumnsGroup
      .filter((c) => visibleKeys.includes(c.key));

    // Calculate offsets cumulatively based on order
    let currentLeft = checkboxW;
    const newOffsets = new Map<string, number>();

    for (const col of visibleStickyCols) {
      const headRef = stickyHeadRefs.get(col.key);
      const cellRef = stickyCellRefs.get(col.key);
      
      // Measure parent cell width instead of wrapper div width
      const headW = headRef?.parentElement?.getBoundingClientRect().width ?? 0;
      const cellW = cellRef?.parentElement?.getBoundingClientRect().width ?? 0;
      const colW = Math.max(headW, cellW);

      // If refs are not available (loading state), use existing offset or estimate
      if (colW === 0 && stickyLeftOffsets.has(col.key)) {
        newOffsets.set(col.key, stickyLeftOffsets.get(col.key)!);
      } else {
        newOffsets.set(col.key, currentLeft);
        currentLeft += colW;
      }
    }

    // Reassign for maximum Svelte 5 reactivity
    stickyLeftOffsets = new Map(newOffsets);
  }

  onMount(() => {
    const onResize = () => {
      requestAnimationFrame(() => updateStickyOffsets());
    };
    window.addEventListener('resize', onResize);
    requestAnimationFrame(() => updateStickyOffsets());
    return () => window.removeEventListener('resize', onResize);
  });

  // Keep offsets correct across HMR/theme/style changes without requiring a full refresh.
  $effect(() => {
    // Track visible keys and sticky columns to re-trigger effect when structure changes
    void checkboxHeadRef;
    void visibleKeys;
    void stickyColumnsGroup;

    stickyRO?.disconnect();
    stickyRO = null;

    const allRefs = [...stickyHeadRefs.values(), ...stickyCellRefs.values()];
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
    checkboxHeadRef,
    stickyHeadRefs,
    stickyCellRefs,
    stickyLeftOffsets,
    stickyRef,
    updateStickyOffsets
  };
}
