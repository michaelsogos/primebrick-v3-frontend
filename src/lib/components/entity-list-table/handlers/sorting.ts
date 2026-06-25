import type { MetaColumn } from '$lib/entity-list/types';

export function createSortingHandlers(
  columnOrder: any,
  defaultSort: { key: string; dir?: 'asc' | 'desc' } | undefined,
  defaultSortDir: 'asc' | 'desc',
  onResetColumnVisibility: (view: 'table' | 'cards' | 'cards_list') => void,
  onSortChange: (key: string | null, dir: 'asc' | 'desc') => void,
  rowsLoading: () => boolean,
  sortKey: () => string | null,
  sortDir: () => 'asc' | 'desc',
  dataColumns: () => any,
  auditingColumnsGroup: () => any,
  nonAuditingColumns: () => any,
  onFilterValuesChange?: (values: Record<string, any>) => void,
  onAdvancedFiltersChange?: (filters: any[], connector: 'AND' | 'OR') => void,
  onResetFilters?: () => void
) {
  function resetColumnsAndSorting() {
    onResetColumnVisibility('table');
    columnOrder.reset();
    if (defaultSort?.key) onSortChange(defaultSort.key, defaultSort.dir ?? defaultSortDir);
    else onSortChange(null, defaultSortDir);
  }

  function resetFilters() {
    onFilterValuesChange?.({});
    onAdvancedFiltersChange?.([], 'AND');
    onResetFilters?.();
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
    if (sortKey() !== col.key) {
      onSortChange(col.key, 'asc');
    } else if (sortDir() === 'asc') {
      onSortChange(col.key, 'desc');
    } else {
      onSortChange(null, defaultSortDir);
    }
  }

  return {
    resetColumnsAndSorting,
    resetFilters,
    reorderGroup,
    handleSortClick
  };
}
