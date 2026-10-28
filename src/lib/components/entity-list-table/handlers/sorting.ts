import type { MetaColumn, AdvancedFilter } from '$lib/entity-list/types';
import type { useColumnOrder } from '../composables/useColumnOrder.svelte';

export function createSortingHandlers(
  columnOrder: ReturnType<typeof useColumnOrder>,
  defaultSort: () => { key: string; dir?: 'asc' | 'desc' } | undefined,
  defaultSortDir: () => 'asc' | 'desc',
  onResetColumnVisibility: () => (view: 'table' | 'cards' | 'cards_list') => void,
  onSortChange: () => (key: string | null, dir: 'asc' | 'desc') => void,
  rowsLoading: () => boolean,
  sortKey: () => string | null,
  sortDir: () => 'asc' | 'desc',
  dataColumns: () => MetaColumn[],
  auditingColumnsGroup: () => MetaColumn[],
  nonAuditingColumns: () => MetaColumn[],
  onFilterValuesChange?: () => ((values: Record<string, unknown>) => void) | undefined,
  onAdvancedFiltersChange?: () => ((filters: AdvancedFilter[], connector: 'AND' | 'OR') => void) | undefined,
  onResetFilters?: () => (() => void) | undefined
) {
  function resetColumnsAndSorting() {
    onResetColumnVisibility()('table');
    columnOrder.reset();
    const ds = defaultSort();
    const dsd = defaultSortDir();
    const sortCb = onSortChange();
    if (ds?.key) sortCb(ds.key, ds.dir ?? dsd);
    else sortCb(null, dsd);
  }

  function resetFilters() {
    onFilterValuesChange?.()?.({});
    onAdvancedFiltersChange?.()?.([], 'AND');
    onResetFilters?.()?.();
  }

  function reorderGroup(group: 'data' | 'auditing', fromKey: string, toKey: string) {
    columnOrder.reorderGroup(
      group,
      fromKey,
      toKey,
      dataColumns(),
      auditingColumnsGroup(),
      nonAuditingColumns()
    );
  }

  function handleSortClick(col: MetaColumn) {
    if (rowsLoading()) return;
    if (col.sortable === false) return;
    const sortCb = onSortChange();
    if (sortKey() !== col.key) {
      sortCb(col.key, 'asc');
    } else if (sortDir() === 'asc') {
      sortCb(col.key, 'desc');
    } else {
      sortCb(null, defaultSortDir());
    }
  }

  return {
    resetColumnsAndSorting,
    resetFilters,
    reorderGroup,
    handleSortClick
  };
}
