import { untrack } from 'svelte';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useRowRangeSelection<T>(options: {
  rowSelectionEnabled: () => boolean;
  selectedKeys: () => string[];
  onSelectedKeysChange: () => (keys: string[]) => void;
  viewRows: () => T[];
  pageKeys: () => string[];
  rowKey: (row: T) => string;
  rowsLoading: () => boolean;
  error: () => string | null;
  page: () => number;
  pageSize: () => number;
}) {
  const _state = $state({
    rowRangeMouseDown: false,
    rangeAnchorIndex: null as number | null,
    rangeDragActive: false,
    lastRangeEndIndex: null as number | null,
  });
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
    _state.rowRangeMouseDown = true;
    _state.rangeAnchorIndex = i;
    _state.rangeDragActive = false;
    _state.lastRangeEndIndex = null;
  }

  function onRowRangeMouseMove(e: MouseEvent) {
    if (!_state.rowRangeMouseDown || _state.rangeAnchorIndex === null) return;
    
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tr = el?.closest?.('tr[data-row-index]');
    if (!(tr instanceof HTMLElement)) return;
    const raw = tr.dataset.rowIndex;
    const idx = raw === undefined ? NaN : Number(raw);
    const currentViewRows = options.viewRows();
    if (!Number.isFinite(idx) || idx < 0 || idx >= currentViewRows.length) return;
    
    if (!_state.rangeDragActive) {
      if (idx === _state.rangeAnchorIndex) return;
      _state.rangeDragActive = true;
    }
    if (_state.lastRangeEndIndex === idx) return;
    _state.lastRangeEndIndex = idx;
    applyRowRangeBrush(_state.rangeAnchorIndex, idx);
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
    options.onSelectedKeysChange()([...next]);
  }

  function resetRowRangeSelect() {
    if (untrack(() => _state.rowRangeMouseDown && _state.rangeDragActive)) skipNextRowClickSelectToggle = true;
    _state.rowRangeMouseDown = false;
    _state.rangeAnchorIndex = null;
    _state.rangeDragActive = false;
    _state.lastRangeEndIndex = null;
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
    void _state.rowRangeMouseDown;
    if (!_state.rowRangeMouseDown) return;
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
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    get skipNextRowClickSelectToggle() { return skipNextRowClickSelectToggle; },
    set skipNextRowClickSelectToggle(value: boolean) { skipNextRowClickSelectToggle = value; },
    onRowRangeMouseDown,
    resetRowRangeSelect
  };
}
