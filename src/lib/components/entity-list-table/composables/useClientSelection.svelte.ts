import { untrack } from 'svelte';
import type { DeepReadonly } from '$lib/types/deep-readonly';
import { isRowDeleted as isRowDeletedUtil } from '../utils';

export function useClientSelection<T extends Record<string, unknown>>(options: {
  selectedKeys: () => string[];
  rows: () => T[];
  rowKey: (row: T) => string;
  pageSize: () => number;
  rowsLoading: () => boolean;
  rowSelectionEnabled: () => boolean;
  showSelectedOnly: () => boolean;
  clientSelectedPage: () => number;
  setShowSelectedOnly: (v: boolean) => void;
  setClientSelectedPage: (p: number) => void;
}) {
  const _state = $state({
    selectedRowByKey: new Map<string, T>(),
  });

  // Merge rows into selection map
  $effect(() => {
    const sk = options.selectedKeys();
    const r = options.rows();
    const sel = new Set(sk);
    const next = new Map<string, T>();
    for (const row of r) {
      const k = options.rowKey(row);
      if (sel.has(k)) next.set(k, row);
    }
    // Preserve old selections
    const old = untrack(() => _state.selectedRowByKey);
    for (const k of sk) {
      if (!next.has(k)) {
        const prev = old.get(k);
        if (prev) next.set(k, prev);
      }
    }
    _state.selectedRowByKey = next;
  });

  const orderedSelectedRows = $derived(
    options.selectedKeys().map((k) => _state.selectedRowByKey.get(k)).filter((r): r is T => r !== undefined)
  );

  const clientSelectedTotalPages = $derived(
    Math.max(1, Math.ceil(orderedSelectedRows.length / Math.max(1, options.pageSize())))
  );

  const viewRows = $derived(
    options.rowSelectionEnabled() && options.showSelectedOnly()
      ? orderedSelectedRows.slice(
          (options.clientSelectedPage() - 1) * options.pageSize(),
          (options.clientSelectedPage() - 1) * options.pageSize() + options.pageSize()
        )
      : options.rows()
  );

  const hasDeletedSelected = $derived(
    orderedSelectedRows.some(r => isRowDeletedUtil(r))
  );

  const allSelectedDeleted = $derived(
    orderedSelectedRows.length > 0 && orderedSelectedRows.every(r => isRowDeletedUtil(r))
  );

  // Exit on server reload
  let prevRowsLoadingForServerList = $state(false);
  $effect(() => {
    const loading = options.rowsLoading();
    if (loading && !prevRowsLoadingForServerList) {
      if (options.showSelectedOnly()) options.setShowSelectedOnly(false);
      options.setClientSelectedPage(1);
    }
    prevRowsLoadingForServerList = loading;
  });

  // Exit when selection is empty or row selection is disabled
  $effect(() => {
    const sk = options.selectedKeys();
    const enabled = options.rowSelectionEnabled();
    if (sk.length === 0 && options.showSelectedOnly()) {
      options.setShowSelectedOnly(false);
      options.setClientSelectedPage(1);
    }
    if (!enabled && options.showSelectedOnly()) {
      options.setShowSelectedOnly(false);
      options.setClientSelectedPage(1);
    }
  });

  // Clamp clientSelectedPage when orderedSelectedRows shrinks
  $effect(() => {
    void orderedSelectedRows.length;
    void options.pageSize();
    if (!options.showSelectedOnly()) return;
    const maxP = Math.max(1, Math.ceil(orderedSelectedRows.length / Math.max(1, options.pageSize())));
    if (options.clientSelectedPage() > maxP) options.setClientSelectedPage(maxP);
  });

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    get orderedSelectedRows() { return orderedSelectedRows; },
    get clientSelectedTotalPages() { return clientSelectedTotalPages; },
    get viewRows() { return viewRows; },
    get hasDeletedSelected() { return hasDeletedSelected; },
    get allSelectedDeleted() { return allSelectedDeleted; },
  };
}
