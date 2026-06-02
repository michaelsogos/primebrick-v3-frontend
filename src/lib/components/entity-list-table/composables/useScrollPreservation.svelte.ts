export function useScrollPreservation(
  tableRef: HTMLTableElement | null,
  rowsLoading: boolean
) {
  let savedTableScrollLeft = $state(0);
  let prevRowsLoadingForScrollSave = $state(false);
  let prevRowsLoadingForScrollRestore = $state(false);

  function tableScrollHost(table: HTMLTableElement | null): HTMLElement | null {
    if (!table) return null;
    return table.closest('[data-slot=table-container]');
  }

  /** Capture horizontal scroll before the loading skeleton replaces row markup (browser often resets both axes). */
  $effect.pre(() => {
    void rowsLoading;
    void tableRef;
    const host = tableScrollHost(tableRef);
    if (rowsLoading && !prevRowsLoadingForScrollSave && host) savedTableScrollLeft = host.scrollLeft;
    prevRowsLoadingForScrollSave = rowsLoading;
  });

  $effect(() => {
    void rowsLoading;
    void tableRef;
    const host = tableScrollHost(tableRef);
    if (!rowsLoading && prevRowsLoadingForScrollRestore && host) {
      const left = savedTableScrollLeft;
      queueMicrotask(() => {
        host.scrollLeft = left;
        requestAnimationFrame(() => {
          if (host.scrollLeft !== left) host.scrollLeft = left;
        });
      });
    }
    prevRowsLoadingForScrollRestore = rowsLoading;
  });

  return {
    tableScrollHost,
    savedTableScrollLeft
  };
}
