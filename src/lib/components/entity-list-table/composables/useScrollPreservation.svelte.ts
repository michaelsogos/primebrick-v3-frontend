import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useScrollPreservation(options: {
  tableRef: () => HTMLTableElement | null;
  rowsLoading: () => boolean;
}) {
  const _state = $state({
    savedTableScrollLeft: 0,
    prevRowsLoadingForScrollSave: false,
    prevRowsLoadingForScrollRestore: false,
  });

  function tableScrollHost(table: HTMLTableElement | null): HTMLElement | null {
    if (!table) return null;
    return table.closest('[data-slot=table-container]');
  }

  /** Capture horizontal scroll before the loading skeleton replaces row markup (browser often resets both axes). */
  $effect.pre(() => {
    void options.rowsLoading();
    void options.tableRef();
    const host = tableScrollHost(options.tableRef());
    if (options.rowsLoading() && !_state.prevRowsLoadingForScrollSave && host) _state.savedTableScrollLeft = host.scrollLeft;
    _state.prevRowsLoadingForScrollSave = options.rowsLoading();
  });

  $effect(() => {
    void options.rowsLoading();
    void options.tableRef();
    const host = tableScrollHost(options.tableRef());
    if (!options.rowsLoading() && _state.prevRowsLoadingForScrollRestore && host) {
      const left = _state.savedTableScrollLeft;
      queueMicrotask(() => {
        host.scrollLeft = left;
        requestAnimationFrame(() => {
          if (host.scrollLeft !== left) host.scrollLeft = left;
        });
      });
    }
    _state.prevRowsLoadingForScrollRestore = options.rowsLoading();
  });

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    tableScrollHost,
  };
}
