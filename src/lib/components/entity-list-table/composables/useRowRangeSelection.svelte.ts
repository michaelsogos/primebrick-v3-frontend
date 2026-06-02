import { untrack } from 'svelte';

export function useRowRangeSelection<T>(options: {
  rowSelectionEnabled: () => boolean;
  selectedKeys: () => string[];
  onSelectedKeysChange: (keys: string[]) => void;
  viewRows: () => T[];
  pageKeys: () => string[];
  rowKey: (row: T) => string;
  rowsLoading: () => boolean;
  error: () => string | null;
  page: () => number;
  pageSize: () => number;
}) {
  let rowRangeMouseDown = $state(false);
  let rangeAnchorIndex = $state<number | null>(null);
  let rangeDragActive = $state(false);
  let lastRangeEndIndex = $state<number | null>(null);
  let selectionSnapshotAtMouseDown: Set<string> | null = null;
  let skipNextRowClickSelectToggle = false;

  function canStartRowRangeSelect(e: MouseEvent): boolean {
    if (!options.rowSelectionEnabled() || options.rowsLoading() || options.error() || options.viewRows().length === 0) return false;
    if (e.button !== 0) return false;
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    if (t.closest('input, button, a, textarea, select, [role="button"]')) return false;
    return true;
  }

  function onRowRangeMouseDown(i: number, e: MouseEvent) {
    if (!options.rowSelectionEnabled()) return;
    skipNextRowClickSelectToggle = false;
    if (!canStartRowRangeSelect(e)) return;
    e.preventDefault();
    selectionSnapshotAtMouseDown = new Set(options.selectedKeys());
    rowRangeMouseDown = true;
    rangeAnchorIndex = i;
    rangeDragActive = false;
    lastRangeEndIndex = null;
  }

  function onRowRangeMouseMove(e: MouseEvent) {
    if (!rowRangeMouseDown || rangeAnchorIndex === null) return;
    
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tr = el?.closest?.('tr[data-row-index]');
    if (!(tr instanceof HTMLElement)) return;
    const raw = tr.dataset.rowIndex;
    const idx = raw === undefined ? NaN : Number(raw);
    const currentViewRows = options.viewRows();
    if (!Number.isFinite(idx) || idx < 0 || idx >= currentViewRows.length) return;
    
    if (!rangeDragActive) {
      if (idx === rangeAnchorIndex) return;
      rangeDragActive = true;
    }
    if (lastRangeEndIndex === idx) return;
    lastRangeEndIndex = idx;
    applyRowRangeBrush(rangeAnchorIndex, idx);
  }

  function applyRowRangeBrush(anchor: number, end: number) {
    const snap = selectionSnapshotAtMouseDown;
    if (!snap) return;

    const lo = Math.min(anchor, end);
    const hi = Math.max(anchor, end);
    const currentViewRows = options.viewRows();
    const rangeKeys = currentViewRows.slice(lo, hi + 1).map((r) => options.rowKey(r));
    const rangeSet = new Set(rangeKeys);
    const pageKeySet = new Set(options.pageKeys());

    const next = new Set<string>();
    for (const k of snap) {
      if (!pageKeySet.has(k)) {
        next.add(k);
        continue;
      }
      if (rangeSet.has(k)) continue;
      next.add(k);
    }
    for (const k of rangeKeys) {
      if (!snap.has(k)) next.add(k);
    }
    options.onSelectedKeysChange([...next]);
  }

  function resetRowRangeSelect() {
    if (untrack(() => rowRangeMouseDown && rangeDragActive)) skipNextRowClickSelectToggle = true;
    rowRangeMouseDown = false;
    rangeAnchorIndex = null;
    rangeDragActive = false;
    lastRangeEndIndex = null;
    selectionSnapshotAtMouseDown = null;
  }

  $effect(() => {
    void options.page();
    void options.pageSize();
    void options.rowsLoading();
    void options.error();
    resetRowRangeSelect();
  });

  // Global mouse listeners
  $effect(() => {
    void rowRangeMouseDown;
    if (!rowRangeMouseDown) return;
    const move = (e: MouseEvent) => onRowRangeMouseMove(e);
    const up = () => resetRowRangeSelect();
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  });

  return {
    get rowRangeMouseDown() { return rowRangeMouseDown; },
    get rangeDragActive() { return rangeDragActive; },
    get skipNextRowClickSelectToggle() { return skipNextRowClickSelectToggle; },
    set skipNextRowClickSelectToggle(value: boolean) { skipNextRowClickSelectToggle = value; },
    onRowRangeMouseDown,
    resetRowRangeSelect
  };
}
