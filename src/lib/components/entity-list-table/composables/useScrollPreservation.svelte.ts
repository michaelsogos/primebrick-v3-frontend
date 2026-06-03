export function useScrollPreservation(options: {
  tableRef: () => HTMLTableElement | null;
  rowsLoading: () => boolean;
}) {
  let savedTableScrollLeft = $state(0);
  let prevRowsLoadingForScrollSave = $state(false);
  let prevRowsLoadingForScrollRestore = $state(false);

  function tableScrollHost(table: HTMLTableElement | null): HTMLElement | null {
    if (!table) return null;
    return table.closest('[data-slot=table-container]');
  }

  /** Capture horizontal scroll before the loading skeleton replaces row markup (browser often resets both axes). */
  $effect.pre(() => {
    void options.rowsLoading();
    void options.tableRef();
    const host = tableScrollHost(options.tableRef());
    if (options.rowsLoading() && !prevRowsLoadingForScrollSave && host) savedTableScrollLeft = host.scrollLeft;
    prevRowsLoadingForScrollSave = options.rowsLoading();
  });

  $effect(() => {
    void options.rowsLoading();
    void options.tableRef();
    const host = tableScrollHost(options.tableRef());
    if (!options.rowsLoading() && prevRowsLoadingForScrollRestore && host) {
      const left = savedTableScrollLeft;
      queueMicrotask(() => {
        host.scrollLeft = left;
        requestAnimationFrame(() => {
          if (host.scrollLeft !== left) host.scrollLeft = left;
        });
      });
    }
    prevRowsLoadingForScrollRestore = options.rowsLoading();
  });

  return {
    tableScrollHost,
    get savedTableScrollLeft() { return savedTableScrollLeft; }
  };
}
