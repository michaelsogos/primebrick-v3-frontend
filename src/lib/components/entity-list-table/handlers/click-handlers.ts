import type { useRowActions } from '../composables/useRowActions.svelte';
import type { useRowRangeSelection } from '../composables/useRowRangeSelection.svelte';

export function createClickHandlers<TRow extends Record<string, unknown>>(
  rowActionsComposable: ReturnType<typeof useRowActions<TRow>>,
  detailHref: (row: TRow) => string | null,
  rowSelectionEnabled: () => boolean,
  rowsLoading: () => boolean,
  error: () => string | null,
  rowRangeSelection: ReturnType<typeof useRowRangeSelection>,
  toggleRowSelect: (key: string) => void
) {
  function handleEditRow(row: TRow) {
    rowActionsComposable.handleEditRow(row);
  }

  // Row dblclick → the record's `kind:"detail"` census route in a NEW
  // browser tab. `window.open` inside a user gesture focuses the new tab
  // natively; no detail decl → the record is not standalone-browsable.
  function handleRowDblClick(row: TRow) {
    const href = detailHref(row);
    if (!href) {
      if (import.meta.env.DEV) {
        console.warn('[EntityListTable] dblclick ignored — no kind:"detail" census route for this entity');
      }
      return;
    }
    window.open(href, '_blank');
  }

  function onEntityRowClick(key: string, e: MouseEvent) {
    if (!rowSelectionEnabled() || rowsLoading() || error()) return;
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
    if (!rowSelectionEnabled() || rowsLoading() || error()) return;
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
    handleRowDblClick,
    onEntityRowClick,
    onEntityCardClick
  };
}
