<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { closeSheet, openSheet, sheetState } from '$lib/shell/sheets/sheet-manager.svelte';
  import { EntityListToolbar, FilterBar, SelectionCounter } from '../toolbar';
  import { FiltersPanel, ColumnSelectorPanel } from '../panels';
  import BulkActionsToolbar from './BulkActionsToolbar.svelte';
  import type { MetaColumn, AdvancedFilter } from '$lib/entity-list/types';

  let {
    search,
    onSearchInput,
    searchPlaceholderKey,
    searchInKeys,
    searchableColumns,
    onSearchInKeysChange,
    toggleSearchKey,
    viewMode,
    onViewModeChange,
    deletionFilterMode,
    onDeletionFilterModeChange,
    hasSoftDelete = true,
    rowsLoading,
    refreshDisabled,
    onRefresh,
    filterableColumns,
    filtersOpen,
    onFiltersOpenChange,
    stickyColumnsGroup,
    nonAuditingColumns,
    auditingColumnsGroup,
    visibleKeys,
    toggleColumnKey,
    resetColumnsAndSorting,
    checkboxVisualOnlyClass,
    onCreateAction,
    toolbarMode,
    hasAppliedFilters,
    filterValues,
    advancedFilters,
    selectedKeys,
    hasDeletedSelected,
    allSelectedDeleted,
    onResetFilters,
    onFilterValuesChange,
    onAdvancedFiltersChange,
    onToggleToolbarMode,
    onBulkExport,
    onHtmlExport,
    onBulkDuplicate,
    onBulkDelete,
    onBulkRestore
  }: EntityListTableHeaderProps<TRow> = $props();

  type EntityListTableHeaderProps<TRow> = {
    search: string;
    onSearchInput: (value: string) => void;
    searchPlaceholderKey?: string;
    searchInKeys: string[] | null;
    searchableColumns: MetaColumn[];
    onSearchInKeysChange: (keys: string[] | null) => void;
    toggleSearchKey: (key: string) => void;
    viewMode: 'table' | 'cards' | 'cards_list';
    onViewModeChange: (mode: 'table' | 'cards' | 'cards_list') => void;
    deletionFilterMode: 'non_deleted' | 'deleted' | 'all';
    onDeletionFilterModeChange: (mode: 'non_deleted' | 'deleted' | 'all') => void;
    hasSoftDelete?: boolean;
    rowsLoading: boolean;
    refreshDisabled: boolean;
    onRefresh: () => void;
    filterableColumns: MetaColumn[];
    filtersOpen: boolean;
    onFiltersOpenChange: (open: boolean) => void;
    stickyColumnsGroup: MetaColumn[];
    nonAuditingColumns: MetaColumn[];
    auditingColumnsGroup: MetaColumn[];
    visibleKeys: string[];
    toggleColumnKey: (key: string) => void;
    resetColumnsAndSorting: () => void;
    checkboxVisualOnlyClass: string;
    onCreateAction?: () => void;
    toolbarMode: 'filters' | 'bulk';
    hasAppliedFilters: boolean;
    filterValues: Record<string, any>;
    advancedFilters: AdvancedFilter[];
    selectedKeys: string[];
    hasDeletedSelected: boolean;
    allSelectedDeleted: boolean;
    onResetFilters: () => void;
    onFilterValuesChange?: (values: Record<string, any>) => void;
    onAdvancedFiltersChange?: (filters: AdvancedFilter[], connector: 'AND' | 'OR') => void;
    onToggleToolbarMode: () => void;
    onBulkExport: () => void;
    onHtmlExport: () => void;
    onBulkDuplicate: () => void;
    onBulkDelete: () => void;
    onBulkRestore: () => void;
  };
</script>

<EntityListToolbar
  search={search}
  onSearchInput={onSearchInput}
  searchPlaceholderKey={searchPlaceholderKey}
  searchInKeys={searchInKeys}
  searchableColumns={searchableColumns}
  onSearchInKeysChange={onSearchInKeysChange}
  toggleSearchKey={toggleSearchKey}
  viewMode={viewMode}
  onViewModeChange={onViewModeChange}
  deletionFilterMode={deletionFilterMode}
  onDeletionFilterModeChange={onDeletionFilterModeChange}
  hasSoftDelete={hasSoftDelete}
  rowsLoading={rowsLoading}
  refreshDisabled={refreshDisabled}
  onRefresh={onRefresh}
  filterableColumns={filterableColumns}
  filtersOpen={filtersOpen}
  onFiltersOpenChange={(open) => {
    if (open) {
      if (sheetState.open && sheetState.panelId === 'entity.filters') {
        closeSheet();
        onFiltersOpenChange(false);
        return;
      }
      onFiltersOpenChange(true);
      openSheet('entity.filters', {
        content: FiltersPanel,
        props: {
          content: {},
          filterableColumns,
          filterValues: filterValues ?? {},
          onFilterValuesChange,
          onResetFilters
        }
      } as any, {
        contentClass: 'w-[360px] p-0',
        modal: false
      });
    } else {
      closeSheet();
      onFiltersOpenChange(false);
    }
  }}
  onColumnSelectorClick={() =>
    openSheet(
      'entity.columns',
      {
        stickyColumns: stickyColumnsGroup,
        nonAuditingColumns,
        auditingColumns: auditingColumnsGroup,
        visibleKeys,
        toggleColumnKey,
        onResetColumnVisibility: resetColumnsAndSorting,
        sheetMenuCheckboxClass: checkboxVisualOnlyClass
      } as any,
      { contentClass: 'w-[360px] p-0' }
    )}
  onCreateAction={onCreateAction}
/>

<BulkActionsToolbar
  toolbarMode={toolbarMode}
  hasAppliedFilters={hasAppliedFilters}
  filterValues={filterValues}
  advancedFilters={advancedFilters}
  selectedKeys={selectedKeys}
  hasDeletedSelected={hasDeletedSelected}
  allSelectedDeleted={allSelectedDeleted}
  filterableColumns={filterableColumns}
  onResetFilters={onResetFilters}
  onFilterValuesChange={(values: Record<string, unknown>) => onFilterValuesChange?.(values)}
  onAdvancedFiltersChange={(filters: AdvancedFilter[]) => onAdvancedFiltersChange?.(filters, 'AND')}
  onToggleToolbarMode={onToggleToolbarMode}
  onBulkExport={onBulkExport}
  onHtmlExport={onHtmlExport}
  onBulkDuplicate={onBulkDuplicate}
  onBulkDelete={onBulkDelete}
  onBulkRestore={onBulkRestore}
/>
