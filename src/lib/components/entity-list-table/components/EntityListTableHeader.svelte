<script lang="ts">
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { EntityListToolbar, BulkActionsToolbar } from '../toolbar';
  import type { MetaColumn, AdvancedFilter, BulkCustomAction, FilterPreset } from '$lib/entity-list/types';
  import type { ActionChrome } from '../types';

  let {
    search,
    onSearchInput,
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
    onToggleFilters,
    stickyColumnsGroup,
    nonAuditingColumns,
    auditingColumnsGroup,
    visibleKeys,
    toggleColumnKey,
    resetColumnsAndSorting,
    onCreateAction,
    create_cta,
    filterPresets = [],
    presetSelections = {},
    onPresetChange,
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
    onBulkRestore,
    bulkCapabilities,
    bulkCustomActions = [],
    onBulkCustomAction,
    bulkDeleteChrome,
    bulkRestoreChrome,
    selectAll,
    sort,
    ianaToggle
  }: EntityListTableHeaderProps = $props();

  type EntityListTableHeaderProps = {
    search: string;
    onSearchInput: (value: string) => void;
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
    /** Funnel CTA handler — toggle semantics owned by the sheet-sync
     *  composable (open/close + live props; no parallel boolean state). */
    onToggleFilters: () => void;
    stickyColumnsGroup: MetaColumn[];
    nonAuditingColumns: MetaColumn[];
    auditingColumnsGroup: MetaColumn[];
    visibleKeys: string[];
    toggleColumnKey: (key: string) => void;
    resetColumnsAndSorting: () => void;
    onCreateAction?: () => void;
    create_cta?: { label_key?: string; icon?: string };
    filterPresets?: readonly FilterPreset[];
    presetSelections?: Record<string, string>;
    onPresetChange?: (presetId: string, optionId: string) => void;
    toolbarMode: 'filters' | 'bulk';
    hasAppliedFilters: boolean;
    filterValues: Record<string, unknown>;
    advancedFilters: AdvancedFilter[];
    selectedKeys: string[];
    hasDeletedSelected: boolean;
    allSelectedDeleted: boolean;
    onResetFilters: () => void;
    onFilterValuesChange?: (values: Record<string, unknown>) => void;
    onAdvancedFiltersChange?: (filters: AdvancedFilter[], connector: 'AND' | 'OR') => void;
    onToggleToolbarMode: () => void;
    onBulkExport: () => void;
    onHtmlExport: () => void;
    onBulkDuplicate: () => void;
    onBulkDelete: () => void;
    onBulkRestore: () => void;
    bulkCapabilities?: { export: boolean; htmlExport: boolean; duplicate: boolean; delete: boolean; restore: boolean };
    bulkCustomActions?: BulkCustomAction[];
    onBulkCustomAction?: (action: BulkCustomAction) => void;
    bulkDeleteChrome?: ActionChrome;
    bulkRestoreChrome?: ActionChrome;
    /** Populated only for card/card_list views — the shared lower bar's
     *  leading zones (select-all | sort builder | IANA CTA). Table view
     *  passes none (its chrome lives in thead/th). */
    selectAll?: { checked: boolean; indeterminate: boolean; onToggle: () => void; test_id?: string };
    sort?: {
      allColumns: MetaColumn[];
      sortableColumns: MetaColumn[];
      sortKey: string | null;
      sortDir: 'asc' | 'desc';
      onSortChange: (key: string | null, dir: 'asc' | 'desc') => void;
      test_id?: string;
    };
    ianaToggle?: {
      columns: MetaColumn[];
      modeByKey: Record<string, 'browser' | 'record'>;
      onToggle: (col: MetaColumn) => void;
      disabled?: boolean;
      test_id?: string;
    };
  };
</script>

<EntityListToolbar
  search={search}
  onSearchInput={onSearchInput}
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
  onToggleFilters={onToggleFilters}
  onColumnSelectorClick={() =>
    openSheet(
      'entity.columns',
      {
        stickyColumns: stickyColumnsGroup,
        nonAuditingColumns,
        auditingColumns: auditingColumnsGroup,
        visibleKeys,
        toggleColumnKey,
        onResetColumnVisibility: resetColumnsAndSorting
      }
    )}
  onCreateAction={onCreateAction}
  create_cta={create_cta}
  filterPresets={filterPresets}
  presetSelections={presetSelections}
  onPresetChange={onPresetChange}
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
  bulkCapabilities={bulkCapabilities}
  bulkCustomActions={bulkCustomActions}
  onBulkCustomAction={onBulkCustomAction}
  bulkDeleteChrome={bulkDeleteChrome}
  bulkRestoreChrome={bulkRestoreChrome}
  selectAll={selectAll}
  sort={sort}
  ianaToggle={ianaToggle}
/>
