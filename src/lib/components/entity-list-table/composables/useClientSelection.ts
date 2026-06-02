import { untrack } from 'svelte';

export function useClientSelection<T>(
  selectedKeys: string[],
  rows: T[],
  rowKey: (row: T) => string,
  pageSize: number,
  rowsLoading: boolean
) {
  let showSelectedOnly = $state(false);
  let clientSelectedPage = $state(1);
  let selectedRowByKey = $state(new Map<string, T>());

  // Merge rows into selection map
  $effect(() => {
    void rows;
    void selectedKeys;
    const sel = new Set(selectedKeys);
    const next = new Map<string, T>();
    for (const r of rows) {
      const k = rowKey(r);
      if (sel.has(k)) next.set(k, r);
    }
    // Preserve old selections
    const old = untrack(() => selectedRowByKey);
    for (const k of selectedKeys) {
      if (!next.has(k)) {
        const prev = old.get(k);
        if (prev) next.set(k, prev);
      }
    }
    selectedRowByKey = next;
  });

  const orderedSelectedRows = $derived(
    selectedKeys.map((k) => selectedRowByKey.get(k)).filter((r): r is T => r !== undefined)
  );

  const clientSelectedTotalPages = $derived(
    Math.max(1, Math.ceil(orderedSelectedRows.length / Math.max(1, pageSize)))
  );

  const viewRows = $derived(
    showSelectedOnly
      ? orderedSelectedRows.slice(
          (clientSelectedPage - 1) * pageSize,
          (clientSelectedPage - 1) * pageSize + pageSize
        )
      : rows
  );

  // Exit on server reload
  let prevRowsLoadingForServerList = $state(false);
  $effect(() => {
    const loading = rowsLoading;
    if (loading && !prevRowsLoadingForServerList) {
      if (showSelectedOnly) showSelectedOnly = false;
      clientSelectedPage = 1;
    }
    prevRowsLoadingForServerList = loading;
  });

  function isRowDeleted(row: T): boolean {
    const r = row as Record<string, unknown>;
    return 'deleted_at' in r && r.deleted_at !== null && r.deleted_at !== undefined;
  }

  const hasDeletedSelected = $derived(
    orderedSelectedRows.some(r => isRowDeleted(r))
  );

  const allSelectedDeleted = $derived(
    orderedSelectedRows.length > 0 && orderedSelectedRows.every(r => isRowDeleted(r))
  );

  return {
    showSelectedOnly,
    clientSelectedPage,
    orderedSelectedRows,
    clientSelectedTotalPages,
    viewRows,
    hasDeletedSelected,
    allSelectedDeleted,
    toggle: () => {
      const next = !showSelectedOnly;
      showSelectedOnly = next;
      if (next) clientSelectedPage = 1;
    }
  };
}
