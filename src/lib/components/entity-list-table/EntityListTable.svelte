<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { t } from '$lib/i18n';
  import { checkboxVisualOnlyClass, checkboxInteractiveClass } from '$lib/components/ui/checkbox';
  import EntityListTableHeader from './components/EntityListTableHeader.svelte';
  import EntityListTableDialogs from './components/EntityListTableDialogs.svelte';
  import EntityListTableContent from './components/EntityListTableContent.svelte';
  import TableFooter from './components/TableFooter.svelte';

  import {
    useStickyColumns,
    useScrollPreservation,
    useRowRangeSelection,
    useFilterPersistence,
    useToolbarMode,
    useClientSelection,
    useKeyboardNavigation,
    useSheetPanels
  } from './composables';
  import { useColumnOrder } from './composables/useColumnOrder.svelte';
  import { useViewMode } from './composables';
  import {
    isRowDeleted as isRowDeletedUtil,
    getRowKey
  } from './utils';
  import { useExport } from './composables/useExport.svelte.js';
  import { useBulkActions } from './composables/useBulkActions.svelte.js';
  import { useRowActions } from './composables/useRowActions.svelte.js';
  import { useDialogs } from './composables/useDialogs.svelte.js';
  import { usePreviewPanel } from './composables/usePreviewPanel.svelte.js';
  import { useDeletionFilter } from './composables/useDeletionFilter.svelte';
  import { createSelectionHandlers } from './handlers/selection';
  import { createSortingHandlers } from './handlers/sorting';
  import { createClickHandlers } from './handlers/click-handlers';
  import type { MetaColumn } from '$lib/entity-list/types';
  import { setAuditColumnsContext } from './context';

  import type { EntityListTableProps, CellArgs } from './types';

  let {
    uid,
    entity = 'customer',
    translationKey,
    columns,
    stickyColumns,
    dataColumns,
    auditingColumns,
    viewVisibility,
    columnOrderStorageKey,
    defaultSort,
    pageSizeOptions: pageSizeOptionsProp,
    searchPlaceholderKey,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    rows,
    total,
    metaLoading,
    rowsLoading,
    error,
    page,
    pageSize,
    onPageChange,
    onPageSizeChange,
    search,
    onSearchInput,
    searchInKeys,
    onSearchInKeysChange,
    sortKey,
    sortDir,
    onSortChange,
    visibleKeys,
    onVisibleKeysChange,
    onResetColumnVisibility,
    selectedKeys = $bindable<string[]>([]),
    onSelectedKeysChange,
    rowSelectionEnabled = true,
    onRefresh,
    refreshDisabled = false,
    rowActionsEnabled = false,
    rowActions,
    entityRowActions,
    customActionHandlers,
    onCreateAction,
    onEditAction,
    filtersOpen = $bindable(false),
    filterValues = {},
    onFilterValuesChange,
    onResetFilters,
    advancedFilters = [],
    onAdvancedFiltersChange,
    filterValuesStorageKey,
    advancedFiltersStorageKey,
    deletionFilterMode: deletionFilterModeProp = $bindable('non_deleted'),
    onDeletionFilterModeChange,
    datetimeIanaModeByKey = $bindable<Record<string, 'browser' | 'record'>>({}),
    datetimeIanaRenderTick = $bindable(0),
    cell,
    metaLoadingView,
    rowsLoadingView,
    emptyView,
    errorView,
    loadingMessage,
    noRecordsMessage
  }: EntityListTableProps<TRow> = $props();

  // Set context for child components — must be reactive because auditingColumns
  // arrives after meta is loaded (initial value is [] before meta fetch completes)
  $effect(() => {
    setAuditColumnsContext(auditingColumns);
  });

  // Translation key for dynamic i18n keys (dialogs, version history).
  // Falls back to `entity` when not explicitly provided.
  const effectiveTranslationKey = $derived(translationKey ?? entity ?? 'customer');

  // Utility functions moved to utils.ts
  const rowKey = (row: TRow): string => getRowKey(row, uid);

  // Column order management using composable
  const columnOrder = useColumnOrder(() => columnOrderStorageKey);
  const orderState = columnOrder.state;

  const allColumns = $derived.by(() => {
    let all: MetaColumn[];
    if (stickyColumns || auditingColumns) {
      all = [
        ...columnOrder.applyKeyOrder(stickyColumns ?? [], orderState.sticky),
        ...columnOrder.applyKeyOrder(dataColumns ?? [], orderState.data),
        ...columnOrder.applyKeyOrder(auditingColumns ?? [], orderState.auditing)
      ];
    } else {
      all = columns;
    }
    // Deduplicate by key, preserving order.
    const seen = new Set<string>();
    const dedup: MetaColumn[] = [];
    for (const col of all) {
      if (!seen.has(col.key)) {
        seen.add(col.key);
        dedup.push(col);
      }
    }
    return dedup;
  });
  const datetimeIanaToggleColumns = $derived(allColumns.filter((c) => !!c.datetimeIanaToggle));
  const sortableColumns = $derived(allColumns.filter((c) => c.sortable !== false));
  const searchableColumns = $derived(allColumns.filter((c) => c.searchable !== false));
  const filterableColumns = $derived(allColumns.filter((c) => c.filterable !== false));
  const shownColumns = $derived(allColumns.filter((c) => visibleKeys.includes(c.key)));
  const stickyColumnsGroup = $derived(
    columnOrder.applyKeyOrder(
      stickyColumns ??
      (() => {
        // Back-compat: use sticky flag from column metadata
        return allColumns.filter((c) => c.sticky === true);
      })(),
      orderState.sticky
    )
  );

  const auditingKeySet = new Set([
    'created_at',
    'created_by',
    'updated_at',
    'updated_by',
    'version',
    'deleted_at',
    'deleted_by'
  ]);
  const auditingColumnsGroup = $derived(
    columnOrder.applyKeyOrder(auditingColumns ?? allColumns.filter((c) => auditingKeySet.has(c.key)), orderState.auditing)
  );
  const hasSoftDelete = $derived(
    auditingColumnsGroup.some((c) => c.key === 'deleted_at' || c.key === 'deleted_by')
  );
  const nonAuditingColumns = $derived(
    columnOrder.applyKeyOrder(
      dataColumns ??
        allColumns.filter(
          (c) => !auditingKeySet.has(c.key) && !stickyColumnsGroup.some((s) => s.key === c.key)
        ),
      orderState.data
    )
  );

  // View mode management using composable
  const viewModeStorageKey = $derived(
    columnOrderStorageKey ? `${columnOrderStorageKey}:viewMode` : `pb.entityList:${uid}:viewMode`
  );
  const viewModeComposable = useViewMode({
    initialMode: 'table',
    storageKey: () => viewModeStorageKey
  });
  const viewMode = $derived(viewModeComposable.state.viewMode);

  // Deletion filter management using composable
  const deletionFilterComposable = useDeletionFilter(
    () => uid,
    () => columnOrderStorageKey,
    () => deletionFilterModeProp ?? 'non_deleted',
    () => onDeletionFilterModeChange
  );
  const deletionFilterMode = $derived(deletionFilterComposable.state.deletionFilterMode);

  // When the entity has no soft-delete columns, force the deletion filter to
  // 'non_deleted' so the BE never receives a deleted_records param and the
  // toggle button group is hidden (see EntityListToolbar).
  $effect(() => {
    if (!hasSoftDelete && deletionFilterMode !== 'non_deleted') {
      deletionFilterComposable.setDeletionFilterMode('non_deleted');
    }
  });

  // Sheet panel management composable
  const sheetPanels = useSheetPanels({
    columnOrder,
    columns: () => columns,
    visibleKeys: () => visibleKeys,
    searchInKeys: () => searchInKeys,
    onSearchInKeysChange: () => onSearchInKeysChange,
    onVisibleKeysChange: () => onVisibleKeysChange,
    onResetColumnVisibility: () => onResetColumnVisibility,
    filterableColumns: () => filterableColumns,
    searchableColumns: () => searchableColumns,
    nonAuditingColumns: () => nonAuditingColumns,
    auditingColumnsGroup: () => auditingColumnsGroup,
    stickyColumnsGroup: () => stickyColumnsGroup,
    filterValues: () => filterValues ?? null,
    onFilterValuesChange: () => onFilterValuesChange,
    onResetFilters: () => onResetFilters,
    advancedFilters: () => advancedFilters ?? null,
    onAdvancedFiltersChange: () => onAdvancedFiltersChange,
    filtersOpen: () => filtersOpen,
    setFiltersOpen: (open) => { filtersOpen = open; },
    checkboxVisualOnlyClass,
  });
  const toggleSearchKey = sheetPanels.toggleSearchKey;
  const toggleColumnKey = sheetPanels.toggleColumnKey;

  const rowChromeH = $derived('h-6');
  /** Use `thead th` / `tbody td` selectors � attribute-based [&_[data-slot=�]] variants are unreliable in Tailwind. */
  const tableDensityClass = $derived(
    '[&_th]:h-6! [&_th]:py-1 [&_th]:text-xs [&_tbody_td]:py-1.5! [&_tbody_td]:text-sm'
  );

  // Panels are mounted via global SheetHost; keep local boolean state only for the optional `filters` slot.

  function toggleDatetimeIana(col: MetaColumn) {
    const cur = datetimeIanaModeByKey[col.key] ?? 'browser';
    const next: 'browser' | 'record' = cur === 'browser' ? 'record' : 'browser';
    datetimeIanaModeByKey = { ...datetimeIanaModeByKey, [col.key]: next };
    datetimeIanaRenderTick++;
  }
  const isRowDeleted = (row: TRow): boolean => isRowDeletedUtil(row);

  let dropdownMenuRow = $state<TRow | null>(null);
  let previewDropdownOpen = $state(false);

  /** Navigate preview records */
  /** Open dropdown menu for a specific row */
  function openRowDropdown(row: TRow) {
    dropdownMenuRow = row;
  }

  /** Close dropdown menu */
  function closeRowDropdown() {
    dropdownMenuRow = null;
  }

  /** Navigate preview records */
  function navigatePreview(direction: number) {
    previewPanel.navigatePreview(direction > 0 ? "next" : "prev");
  }

  const defaultSortDir = $derived(defaultSort?.dir ?? 'asc');
  const effectiveSortKey = $derived(sortKey ?? defaultSort?.key ?? null);
  const pageSizeOptions = $derived(pageSizeOptionsProp ?? [10, 25, 50, 100]);
  const totalPages = $derived(Math.max(1, Math.ceil(Number(total) / Number(pageSize))));


  /** Client-only: show all selected rows with client-side paging (no server calls until exit or reload). */
  let showSelectedOnly = $state(false);
  let clientSelectedPage = $state(1);

  const clientSelection = useClientSelection<TRow>({
    selectedKeys: () => selectedKeys,
    rows: () => rows ?? [],
    rowKey,
    pageSize: () => pageSize,
    rowsLoading: () => rowsLoading,
    rowSelectionEnabled: () => rowSelectionEnabled,
    showSelectedOnly: () => showSelectedOnly,
    clientSelectedPage: () => clientSelectedPage,
    setShowSelectedOnly: (v: boolean) => { showSelectedOnly = v; },
    setClientSelectedPage: (p: number) => { clientSelectedPage = p; },
  });

  const orderedSelectedRows = $derived(clientSelection.orderedSelectedRows);
  const hasDeletedSelected = $derived(clientSelection.hasDeletedSelected);
  const allSelectedDeleted = $derived(clientSelection.allSelectedDeleted);
  const clientSelectedTotalPages = $derived(clientSelection.clientSelectedTotalPages);
  const footerUsesClientPaging = $derived(rowSelectionEnabled && showSelectedOnly);
  const footerPage = $derived(footerUsesClientPaging ? clientSelectedPage : page);
  const footerTotalPages = $derived(footerUsesClientPaging ? clientSelectedTotalPages : totalPages);
  const footerRangeTotal = $derived(footerUsesClientPaging ? orderedSelectedRows.length : Number(total));
  const footerRangeStart = $derived(
    footerRangeTotal === 0 ? 0 : (Number(footerPage) - 1) * Number(pageSize) + 1
  );
  const footerRangeEnd = $derived(
    footerRangeTotal === 0 ? 0 : Math.min(Number(footerPage) * Number(pageSize), footerRangeTotal)
  );

  const viewRows = $derived(clientSelection.viewRows);
  const pageKeys = $derived(viewRows.map((r) => rowKey(r)));
  const selectedOnPageCount = $derived(pageKeys.filter((k) => selectedKeys.includes(k)).length);
  const allOnPageSelected = $derived(pageKeys.length > 0 && selectedOnPageCount === pageKeys.length);
  /** Header checkbox tri-state: partial selection on current page. */
  const headerIndeterminate = $derived(selectedOnPageCount > 0 && !allOnPageSelected);
  const actionsEnabled = $derived(!!rowActionsEnabled || !!rowActions);
  const extraCols = $derived((rowSelectionEnabled ? 1 : 0) + (actionsEnabled ? 1 : 0));

  /** `<table>` from `Table.Root`; used to find the scroll host and preserve horizontal scroll across row reloads. */
  let tableRef = $state<HTMLTableElement | null>(null);

  // Sticky offsets (measured widths so we can keep columns auto-sized).
  const stickyColumnsState = useStickyColumns({
    rowSelectionEnabled: () => rowSelectionEnabled,
    stickyColumnsGroup: () => stickyColumnsGroup,
    visibleKeys: () => visibleKeys
  });

  // Scroll preservation
  const scrollPreservation = useScrollPreservation({
    tableRef: () => tableRef,
    rowsLoading: () => rowsLoading
  });

  // Row range selection
  const rowRangeSelection = useRowRangeSelection({
    rowSelectionEnabled: () => rowSelectionEnabled,
    selectedKeys: () => selectedKeys,
    // svelte-ignore state_referenced_locally
    onSelectedKeysChange,
    viewRows: () => viewRows,
    pageKeys: () => pageKeys,
    rowKey,
    rowsLoading: () => rowsLoading,
    error: () => error,
    page: () => clientSelectedPage,
    pageSize: () => pageSize
  });

  // Filter persistence
  const filterPersistence = useFilterPersistence({
    uid: () => uid,
    // svelte-ignore state_referenced_locally
    filterValuesStorageKey,
    // svelte-ignore state_referenced_locally
    advancedFiltersStorageKey,
    // svelte-ignore state_referenced_locally
    columnOrderStorageKey
  });

  // Toolbar mode
  const toolbarModeState = useToolbarMode({
    selectedKeys: () => selectedKeys,
    filterValues: () => filterValues,
    advancedFilters: () => advancedFilters
  });

  const exportComposable = useExport({
    entity: () => entity,
    selectedKeys: () => selectedKeys,
    uid: () => uid,
    columns: () => columns,
    search: () => search,
    searchInKeys: () => searchInKeys,
    sortKey: () => sortKey,
    sortDir: () => sortDir,
    filterValues: () => filterValues,
    advancedFilters: () => advancedFilters,
    deletionFilterMode: () => deletionFilterMode,
    onExportStart: () => {
      // Optional: handle export start
    },
    onExportComplete: () => {
      // Optional: handle export complete
    },
    onExportError: (error) => {
      // Optional: handle export error
    }
  });

  const previewPanel = usePreviewPanel<TRow>({
    viewRows: () => viewRows,
    rowKey: rowKey,
    onFieldChange: (row, field, value) => {
      // Handle field change if needed
    },
    onRefresh: () => onRefresh
  });

  const dialogs = useDialogs<TRow>();

  const bulkActions = useBulkActions({
    entity: () => entity,
    selectedKeys: () => selectedKeys,
    onBulkActionStart: () => {
      // Optional: handle bulk action start
    },
    onBulkActionComplete: () => {
      // Optional: handle bulk action complete
    },
    onBulkActionError: (error) => {
      // Optional: handle bulk action error
    },
    onSelectionChange: (keys) => {
      selectedKeys = keys;
    },
    onRefresh: () => onRefresh,
    onToolbarModeChange: () => {
      toolbarModeState.setMode('filters');
    },
    t: $t,
    dialogs: {
      openBulkDeleteDialog: dialogs.openBulkDeleteDialog,
      closeBulkDeleteDialog: dialogs.closeBulkDeleteDialog,
      openBulkRestoreDialog: dialogs.openBulkRestoreDialog,
      closeBulkRestoreDialog: dialogs.closeBulkRestoreDialog,
      openDuplicateDialog: dialogs.openDuplicateDialog,
      closeDuplicateDialog: dialogs.closeDuplicateDialog
    },
    setDuplicateScope: dialogs.setDuplicateScope
  });

  const rowActionsComposable = useRowActions<TRow>({
    entity: () => entity,
    translationKey: () => effectiveTranslationKey,
    uid: () => uid,
    columns: () => columns,
    onEditAction: () => onEditAction,
    onRefresh: () => onRefresh,
    isRowDeleted: isRowDeleted,
    rowKey: rowKey,
    onPreviewRow: (row) => {
      previewPanel.openPreview(row);
    },
    closeRowDropdown: closeRowDropdown,
    t: $t,
    customActionHandlers: () => customActionHandlers,
    dialogs: {
      openDeleteDialog: dialogs.openDeleteDialog,
      closeDeleteDialog: dialogs.closeDeleteDialog,
      openRestoreDialog: dialogs.openRestoreDialog,
      closeRestoreDialog: dialogs.closeRestoreDialog,
      openDuplicateDialog: dialogs.openDuplicateDialog,
      closeDuplicateDialog: dialogs.closeDuplicateDialog,
      setDuplicateScope: dialogs.setDuplicateScope,
      setRowToDelete: dialogs.setRowToDelete,
      setRowToRestore: dialogs.setRowToRestore,
      setSingleRowToDuplicate: dialogs.setSingleRowToDuplicate
    }
  });

  // Selection handlers
  const selectionHandlers = createSelectionHandlers(
    () => selectedKeys,
    () => onSelectedKeysChange,
    () => pageKeys,
    () => allOnPageSelected
  );
  const { toggleRowSelect, toggleAllOnPage } = selectionHandlers;

  const keyboardNav = useKeyboardNavigation<TRow>({
    viewRows: () => viewRows,
    rowSelectionEnabled: () => rowSelectionEnabled,
    selectedKeys: () => selectedKeys,
    onSelectedKeysChange: () => onSelectedKeysChange,
    rowKey,
    previewPanelOpen: () => previewPanel.state.previewPanelOpen,
    previewRowIndex: () => previewPanel.state.previewRowIndex,
    focusedRowIndex: () => previewPanel.state.focusedRowIndex,
    setFocusedRowIndex: (i: number) => previewPanel.setFocusedRowIndex(i),
    openPreview: (row: TRow) => previewPanel.openPreview(row),
    navigatePreview: (direction: 'next' | 'prev') => previewPanel.navigatePreview(direction),
    dropdownMenuRow: () => dropdownMenuRow,
    previewDropdownOpen: () => previewDropdownOpen,
    closeRowDropdown,
    page: () => page,
    pageSize: () => pageSize,
    totalPages: () => totalPages,
    onPageChange: () => onPageChange,
    openRowDropdown,
    footerUsesClientPaging: () => footerUsesClientPaging,
    clientSelectedPage: () => clientSelectedPage,
    setClientSelectedPage: (p: number) => { clientSelectedPage = p; },
    toggleRowSelect,
    tableRef: () => tableRef
  });

  // Sorting handlers
  const sortingHandlers = createSortingHandlers(
    columnOrder,
    () => defaultSort,
    () => defaultSortDir,
    () => onResetColumnVisibility,
    () => onSortChange,
    () => rowsLoading,
    () => sortKey,
    () => sortDir,
    () => dataColumns,
    () => auditingColumnsGroup,
    () => nonAuditingColumns,
    () => onFilterValuesChange,
    () => onAdvancedFiltersChange,
    () => onResetFilters
  );
  const { resetColumnsAndSorting, resetFilters, reorderGroup, handleSortClick } = sortingHandlers;

  // Click handlers
  const clickHandlers = createClickHandlers(
    rowActionsComposable,
    previewPanel,
    () => rowSelectionEnabled,
    () => rowsLoading,
    () => error,
    rowRangeSelection,
    toggleRowSelect
  );
  const { handleEditRow, handlePreviewRow, onEntityRowClick, onEntityCardClick } = clickHandlers;

  const loadingText = $derived(loadingMessage ?? $t('common.loading'));
  const emptyText = $derived(noRecordsMessage ?? $t('entities.list.noRecords'));

  const selectionCount = $derived(selectedKeys.length);
  const selectionPastParticipleKey = $derived(
    selectionCount === 1 ? 'entities.list.selectedSingular' : 'entities.list.selectedPlural'
  );
</script>

<svelte:window onkeydown={keyboardNav.handleGlobalKeyDown} />




<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <EntityListTableHeader
    search={search}
    onSearchInput={onSearchInput}
    searchPlaceholderKey={searchPlaceholderKey}
    searchInKeys={searchInKeys}
    searchableColumns={searchableColumns}
    onSearchInKeysChange={onSearchInKeysChange}
    toggleSearchKey={toggleSearchKey}
    viewMode={viewMode}
    onViewModeChange={viewModeComposable.setViewMode}
    deletionFilterMode={deletionFilterMode}
    onDeletionFilterModeChange={deletionFilterComposable.setDeletionFilterMode}
    hasSoftDelete={hasSoftDelete}
    rowsLoading={rowsLoading}
    refreshDisabled={refreshDisabled}
    onRefresh={onRefresh}
    filterableColumns={filterableColumns}
    filtersOpen={filtersOpen}
    onFiltersOpenChange={(open) => { filtersOpen = open; }}
    stickyColumnsGroup={stickyColumnsGroup}
    nonAuditingColumns={nonAuditingColumns}
    auditingColumnsGroup={auditingColumnsGroup}
    visibleKeys={visibleKeys}
    toggleColumnKey={toggleColumnKey}
    resetColumnsAndSorting={resetColumnsAndSorting}
    checkboxVisualOnlyClass={checkboxVisualOnlyClass}
    onCreateAction={onCreateAction}
    toolbarMode={toolbarModeState.state.toolbarMode}
    hasAppliedFilters={toolbarModeState.hasAppliedFilters}
    filterValues={filterValues}
    advancedFilters={advancedFilters}
    selectedKeys={selectedKeys}
    hasDeletedSelected={hasDeletedSelected}
    allSelectedDeleted={allSelectedDeleted}
    onResetFilters={resetFilters}
    onFilterValuesChange={onFilterValuesChange}
    onAdvancedFiltersChange={onAdvancedFiltersChange}
    onToggleToolbarMode={toolbarModeState.toggle}
    onBulkExport={() => exportComposable.openExportDialog()}
    onHtmlExport={() => exportComposable.openHtmlExportConfirmDialog()}
    onBulkDuplicate={() => bulkActions.handleBulkDuplicate()}
    onBulkDelete={() => bulkActions.handleBulkDelete()}
    onBulkRestore={() => bulkActions.handleBulkRestore()}
  />

  <EntityListTableContent
    metaLoading={metaLoading}
    viewMode={viewMode}
    metaLoadingView={metaLoadingView}
    loadingText={loadingText}
    viewRows={viewRows}
    shownColumns={shownColumns}
    rowSelectionEnabled={rowSelectionEnabled}
    selectedKeys={selectedKeys}
    rowKey={rowKey}
    isRowDeleted={isRowDeleted}
    previewPanel={previewPanel}
    actionsEnabled={actionsEnabled}
    rowActions={rowActions}
    entityRowActions={entityRowActions}
    dropdownMenuRow={dropdownMenuRow}
    datetimeIanaModeByKey={datetimeIanaModeByKey}
    datetimeIanaRenderTick={datetimeIanaRenderTick}
    cell={cell}
    stickyColumnsGroup={stickyColumnsGroup}
    error={error}
    errorView={errorView}
    rowsLoading={rowsLoading}
    rowsLoadingView={rowsLoadingView}
    rows={rows}
    emptyView={emptyView}
    emptyText={emptyText}
    showSelectedOnly={showSelectedOnly}
    selectionCount={selectionCount}
    orderedSelectedRows={orderedSelectedRows}
    allOnPageSelected={allOnPageSelected}
    headerIndeterminate={headerIndeterminate}
    toggleAllOnPage={toggleAllOnPage}
    allColumns={allColumns}
    effectiveSortKey={effectiveSortKey}
    sortDir={sortDir}
    onSortChange={onSortChange}
    sortableColumns={sortableColumns}
    datetimeIanaToggleColumns={datetimeIanaToggleColumns}
    toggleDatetimeIana={toggleDatetimeIana}
    onEntityRowClick={onEntityCardClick}
    onToggleRowSelect={toggleRowSelect}
    onOpenRowDropdown={openRowDropdown}
    onCloseRowDropdown={closeRowDropdown}
    onEditRow={handleEditRow}
    rowActionsComposable={rowActionsComposable}
    onPreviewRow={handlePreviewRow}
    tableRef={tableRef}
    tableDensityClass={tableDensityClass}
    stickyColumnsState={stickyColumnsState}
    rowChromeH={rowChromeH}
    checkboxInteractiveClass={checkboxInteractiveClass}
    visibleKeys={visibleKeys}
    handleSortClick={handleSortClick}
    rowRangeSelection={rowRangeSelection}
    uid={uid}
    pageSize={pageSize}
    page={page}
    onPageChange={onPageChange}
    entity={entity}
    columns={columns}
    stickyColumns={stickyColumns}
    dataColumns={dataColumns}
    auditingColumns={auditingColumns}
    rowActionsEnabled={rowActionsEnabled}
    footerRangeTotal={footerRangeTotal}
    footerPage={footerPage}
    previewDropdownOpen={previewDropdownOpen}
    navigatePreview={navigatePreview}
    extraCols={extraCols}
  />

  <TableFooter
    footerRangeTotal={footerRangeTotal}
    footerRangeStart={footerRangeStart}
    footerRangeEnd={footerRangeEnd}
    footerPage={footerPage}
    footerTotalPages={footerTotalPages}
    footerUsesClientPaging={footerUsesClientPaging}
    bind:clientSelectedPage={clientSelectedPage}
    rowSelectionEnabled={rowSelectionEnabled}
    selectionCount={selectionCount}
    selectionLabelKey={selectionLabelKey}
    selectionLabelSingularKey={selectionLabelSingularKey}
    selectionLabelText={selectionLabelText}
    selectionLabelSingularText={selectionLabelSingularText}
    selectionPastParticipleKey={selectionPastParticipleKey}
    bind:showSelectedOnly={showSelectedOnly}
    pageSize={pageSize}
    pageSizeOptions={pageSizeOptions}
    page={page}
    totalPages={totalPages}
    onPageChange={onPageChange}
    onPageSizeChange={onPageSizeChange}
  />
  </div>

  <EntityListTableDialogs
    {dialogs}
    {rowActionsComposable}
    {bulkActions}
    {exportComposable}
    {selectedKeys}
    {total}
    {entity}
    translationKey={effectiveTranslationKey}
  />

