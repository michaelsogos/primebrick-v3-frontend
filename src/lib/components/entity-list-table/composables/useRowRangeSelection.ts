export function useRowRangeSelection<T>(
  rowSelectionEnabled: boolean,
  selectedKeys: string[],
  onSelectedKeysChange: (keys: string[]) => void,
  viewRows: T[],
  rowKey: (row: T) => string,
  rowsLoading: boolean,
  error: string | null
) {
  let rowRangeMouseDown = $state(false);
  let rangeAnchorIndex = $state<number | null>(null);
  let rangeDragActive = $state(false);
  let lastRangeEndIndex = $state<number | null>(null);
  let selectionSnapshotAtMouseDown: Set<string> | null = null;
  let skipNextRowClickSelectToggle = false;

  function onRowRangeMouseDown(i: number, e: MouseEvent) {
    if (!rowSelectionEnabled || rowsLoading || error) return;
    rowRangeMouseDown = true;
    rangeAnchorIndex = i;
    rangeDragActive = false;
    lastRangeEndIndex = i;
    selectionSnapshotAtMouseDown = new Set(selectedKeys);
  }

  function onRowRangeMouseMove(e: MouseEvent) {
    if (!rowRangeMouseDown || rangeAnchorIndex === null) return;
    
    // Find which row is under the mouse
    const target = e.target as HTMLElement;
    const row = target.closest('[data-row-index]');
    if (!row) return;
    
    const index = parseInt(row.getAttribute('data-row-index') ?? '-1', 10);
    if (index < 0 || index >= viewRows.length) return;
    
    if (index !== lastRangeEndIndex) {
      rangeDragActive = true;
      lastRangeEndIndex = index;
      applyRowRangeBrush(rangeAnchorIndex, index);
    }
  }

  function applyRowRangeBrush(anchor: number, end: number) {
    if (selectionSnapshotAtMouseDown === null) return;
    
    const start = Math.min(anchor, end);
    const finish = Math.max(anchor, end);
    
    const keysInBrush = new Set<string>();
    for (let i = start; i <= finish; i++) {
      keysInBrush.add(rowKey(viewRows[i]));
    }
    
    // Symmetric difference: keys that are in exactly one of the two sets
    const toToggle = new Set<string>();
    for (const k of selectionSnapshotAtMouseDown) {
      if (!keysInBrush.has(k)) toToggle.add(k);
    }
    for (const k of keysInBrush) {
      if (!selectionSnapshotAtMouseDown.has(k)) toToggle.add(k);
    }
    
    // Apply toggle
    const next = new Set(selectedKeys);
    for (const k of toToggle) {
      if (next.has(k)) {
        next.delete(k);
      } else {
        next.add(k);
      }
    }
    
    onSelectedKeysChange(Array.from(next));
  }

  function resetRowRangeSelect() {
    rowRangeMouseDown = false;
    rangeAnchorIndex = null;
    rangeDragActive = false;
    lastRangeEndIndex = null;
    selectionSnapshotAtMouseDown = null;
    if (rangeDragActive) {
      skipNextRowClickSelectToggle = true;
    }
  }

  // Global mouse listeners
  $effect(() => {
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
    rowRangeMouseDown,
    rangeDragActive,
    skipNextRowClickSelectToggle,
    onRowRangeMouseDown,
    resetRowRangeSelect
  };
}
