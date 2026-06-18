export function createClickHandlers<TRow extends Record<string, unknown>>(
  rowActionsComposable: any,
  previewPanel: any,
  rowSelectionEnabled: boolean,
  rowsLoading: boolean,
  error: string | null,
  rowRangeSelection: any,
  toggleRowSelect: (key: string) => void
) {
  function handleEditRow(row: TRow) {
    rowActionsComposable.handleEditRow(row);
  }

  function handlePreviewRow(row: TRow) {
    previewPanel.openPreview(row);
  }

  function onEntityRowClick(key: string, e: MouseEvent) {
    if (!rowSelectionEnabled || rowsLoading || error) return;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (
      t.closest(
        'input, button, a, textarea, select, [role="button"], [role="checkbox"], [data-slot=dropdown-menu-trigger]'
      )
    ) {
      return;
    }
    if (rowRangeSelection.skipNextRowClickSelectToggle) {
      rowRangeSelection.skipNextRowClickSelectToggle = false;
      return;
    }
    toggleRowSelect(key);
    e.stopPropagation();
  }

  function onEntityCardClick(key: string, e: MouseEvent) {
    if (!rowSelectionEnabled || rowsLoading || error) return;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (
      t.closest(
        'input, button, a, textarea, select, [role="checkbox"], [data-slot=dropdown-menu-trigger], [data-pb-card-cta]'
      )
    ) {
      return;
    }
    toggleRowSelect(key);
    e.stopPropagation();
  }

  return {
    handleEditRow,
    handlePreviewRow,
    onEntityRowClick,
    onEntityCardClick
  };
}
