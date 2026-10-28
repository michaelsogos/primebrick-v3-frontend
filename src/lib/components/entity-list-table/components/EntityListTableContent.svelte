<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import type { MetaColumn } from '$lib/entity-list/types';
  import type { CellArgs, EntityRowActions } from '../types';
  import type { usePreviewPanel } from '../composables/usePreviewPanel.svelte';
  import type { useRowActions } from '../composables/useRowActions.svelte';
  import type { useStickyColumns } from '../composables/useStickyColumns.svelte';
  import type { useRowRangeSelection } from '../composables/useRowRangeSelection.svelte';
  import EntityListTableLoading from './EntityListTableLoading.svelte';
  import EntityListTableCardView from './EntityListTableCardView.svelte';
  import EntityListTableTableView from './EntityListTableTableView.svelte';

  let {
    metaLoading,
    viewMode,
    metaLoadingView,
    loadingText,
    viewRows,
    shownColumns,
    rowSelectionEnabled,
    selectedKeys,
    rowKey,
    isRowDeleted,
    previewPanel,
    actionsEnabled,
    rowActions,
    entityRowActions,
    dropdownMenuRow,
    datetimeIanaModeByKey,
    datetimeIanaRenderTick,
    sparklineData,
    cell,
    stickyColumnsGroup,
    error,
    errorView,
    rowsLoading,
    rowsLoadingView,
    rows,
    emptyView,
    emptyText,
    showSelectedOnly,
    selectionCount,
    orderedSelectedRows,
    allOnPageSelected,
    headerIndeterminate,
    toggleAllOnPage,
    allColumns,
    effectiveSortKey,
    sortDir,
    onSortChange,
    sortableColumns,
    datetimeIanaToggleColumns,
    toggleDatetimeIana,
    onEntityRowClick,
    onToggleRowSelect,
    onOpenRowDropdown,
    onCloseRowDropdown,
    onEditRow,
    rowActionsComposable,
    onPreviewRow,
    tableRef,
    tableDensityClass,
    stickyColumnsState,
    rowChromeH,
    checkboxInteractiveClass,
    visibleKeys,
    handleSortClick,
    rowRangeSelection,
    uid,
    pageSize,
    page,
    onPageChange,
    entity,
    entities_ns,
    columns,
    stickyColumns,
    dataColumns,
    auditingColumns,
    footerRangeTotal,
    footerPage,
    previewDropdownOpen,
    navigatePreview,
    extraCols
  }: EntityListTableContentProps = $props();

  type EntityListTableContentProps = {
    metaLoading: boolean;
    viewMode: 'table' | 'cards' | 'cards_list';
    metaLoadingView?: Snippet;
    loadingText: string;
    viewRows: TRow[];
    shownColumns: MetaColumn[];
    rowSelectionEnabled: boolean;
    selectedKeys: string[];
    rowKey: (row: TRow) => string;
    isRowDeleted: (row: TRow) => boolean;
    previewPanel: ReturnType<typeof usePreviewPanel<TRow>>;
    actionsEnabled: boolean;
    rowActions?: Snippet<[{ row: TRow }]>;
    entityRowActions?: EntityRowActions;
    dropdownMenuRow: TRow | null;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick: number;
    sparklineData?: Record<string, { by_key: Record<string, unknown[]>; bucket_unit?: string }>;
    cell?: Snippet<[CellArgs<TRow>]>;
    stickyColumnsGroup: MetaColumn[];
    error: string | null;
    errorView?: Snippet;
    rowsLoading: boolean;
    rowsLoadingView?: Snippet;
    rows: TRow[];
    emptyView?: Snippet;
    emptyText: string;
    showSelectedOnly: boolean;
    selectionCount: number;
    orderedSelectedRows: TRow[];
    allOnPageSelected: boolean;
    headerIndeterminate: boolean;
    toggleAllOnPage: () => void;
    allColumns: MetaColumn[];
    effectiveSortKey: string | null;
    sortDir: 'asc' | 'desc';
    onSortChange: (key: string | null, dir: 'asc' | 'desc') => void;
    sortableColumns: MetaColumn[];
    datetimeIanaToggleColumns: MetaColumn[];
    toggleDatetimeIana: (col: MetaColumn) => void;
    onEntityRowClick: (key: string, e: MouseEvent) => void;
    onToggleRowSelect: (key: string) => void;
    onOpenRowDropdown: (row: TRow) => void;
    onCloseRowDropdown: () => void;
    onEditRow: (row: TRow) => void;
    rowActionsComposable: ReturnType<typeof useRowActions<TRow>>;
    onPreviewRow: (row: TRow) => void;
    tableRef: HTMLTableElement | null;
    tableDensityClass: string;
    stickyColumnsState: ReturnType<typeof useStickyColumns>;
    rowChromeH: string;
    checkboxInteractiveClass: string;
    visibleKeys: string[];
    handleSortClick: (col: MetaColumn) => void;
    rowRangeSelection: ReturnType<typeof useRowRangeSelection>;
    uid: string;
    pageSize: number;
    page: number;
    onPageChange: (page: number) => void;
    entity: string;
    /** Entity-label i18n namespace (`meta.entities_ns`) — forwarded to PreviewPanelWrapper. */
    entities_ns?: string;
    columns: MetaColumn[];
    stickyColumns: MetaColumn[] | undefined;
    dataColumns: MetaColumn[] | undefined;
    auditingColumns: MetaColumn[] | undefined;
    footerRangeTotal: number;
    footerPage: number;
    previewDropdownOpen: boolean;
    navigatePreview: (direction: number) => void;
    extraCols: number;
  };
</script>

<div class="min-h-0 flex-1 overflow-hidden">
  <EntityListTableLoading
    metaLoading={metaLoading}
    metaLoadingView={metaLoadingView}
    loadingText={loadingText}
  />
  {#if !metaLoading}
    <EntityListTableCardView
      viewMode={viewMode}
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
      cell={cell}
      stickyColumnsGroup={stickyColumnsGroup}
      sparklineData={sparklineData}
      error={error}
      errorView={errorView}
      rowsLoading={rowsLoading}
      rowsLoadingView={rowsLoadingView}
      loadingText={loadingText}
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
      onEntityRowClick={onEntityRowClick}
      onToggleRowSelect={onToggleRowSelect}
      onOpenRowDropdown={onOpenRowDropdown}
      onCloseRowDropdown={onCloseRowDropdown}
      onEditRow={onEditRow}
      rowActionsComposable={rowActionsComposable}
      onPreviewRow={onPreviewRow}
    />
    {#if viewMode === 'table'}
      <EntityListTableTableView
        tableRef={tableRef}
        tableDensityClass={tableDensityClass}
        rowSelectionEnabled={rowSelectionEnabled}
        stickyColumnsState={stickyColumnsState}
        rowChromeH={rowChromeH}
        checkboxInteractiveClass={checkboxInteractiveClass}
        allOnPageSelected={allOnPageSelected}
        headerIndeterminate={headerIndeterminate}
        toggleAllOnPage={toggleAllOnPage}
        shownColumns={shownColumns}
        stickyColumnsGroup={stickyColumnsGroup}
        visibleKeys={visibleKeys}
        sortKey={effectiveSortKey}
        sortDir={sortDir}
        rowsLoading={rowsLoading}
        handleSortClick={handleSortClick}
        datetimeIanaModeByKey={datetimeIanaModeByKey}
        toggleDatetimeIana={toggleDatetimeIana}
        actionsEnabled={actionsEnabled}
        previewPanel={previewPanel}
        viewRows={viewRows}
        error={error}
        errorView={errorView}
        rowsLoadingView={rowsLoadingView}
        loadingText={loadingText}
        rows={rows}
        extraCols={extraCols}
        emptyView={emptyView}
        emptyText={emptyText}
        showSelectedOnly={showSelectedOnly}
        selectionCount={selectionCount}
        orderedSelectedRows={orderedSelectedRows}
        rowRangeSelection={rowRangeSelection}
        datetimeIanaRenderTick={datetimeIanaRenderTick}
        sparklineData={sparklineData}
        rowKey={rowKey}
        isRowDeleted={isRowDeleted}
        cell={cell}
        rowActions={rowActions}
        entityRowActions={entityRowActions}
        dropdownMenuRow={dropdownMenuRow}
        onEntityRowClick={onEntityRowClick}
        handlePreviewRow={onPreviewRow}
        toggleRowSelect={onToggleRowSelect}
        openRowDropdown={onOpenRowDropdown}
        closeRowDropdown={onCloseRowDropdown}
        handleEditRow={onEditRow}
        rowActionsComposable={rowActionsComposable}
        uid={uid}
        pageSize={pageSize}
        page={page}
        onPageChange={onPageChange}
        entity={entity}
        entities_ns={entities_ns}
        columns={columns}
        stickyColumns={stickyColumns}
        dataColumns={dataColumns}
        auditingColumns={auditingColumns}
        selectedKeys={selectedKeys}
        footerRangeTotal={footerRangeTotal}
        footerPage={footerPage}
        previewDropdownOpen={previewDropdownOpen}
        navigatePreview={navigatePreview}
      />
    {/if}
  {/if}
</div>
