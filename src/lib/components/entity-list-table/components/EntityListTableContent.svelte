<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import type { MetaColumn } from '$lib/entity-list/types';
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
    columns,
    stickyColumns,
    dataColumns,
    auditingColumns,
    rowActionsEnabled,
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
    viewRows: any;
    shownColumns: any[];
    rowSelectionEnabled: boolean;
    selectedKeys: string[];
    rowKey: any;
    isRowDeleted: any;
    previewPanel: any;
    actionsEnabled: boolean;
    rowActions: any;
    entityRowActions: any;
    dropdownMenuRow: any;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick: number;
    cell: any;
    stickyColumnsGroup: any[];
    error: string | null;
    errorView?: Snippet;
    rowsLoading: boolean;
    rowsLoadingView?: Snippet;
    rows: any;
    emptyView?: Snippet;
    emptyText: string;
    showSelectedOnly: boolean;
    selectionCount: number;
    orderedSelectedRows: any;
    allOnPageSelected: boolean;
    headerIndeterminate: boolean;
    toggleAllOnPage: () => void;
    allColumns: any[];
    effectiveSortKey: string | null;
    sortDir: 'asc' | 'desc';
    onSortChange: (key: string | null, dir: 'asc' | 'desc') => void;
    sortableColumns: any[];
    datetimeIanaToggleColumns: any[];
    toggleDatetimeIana: (col: any) => void;
    onEntityRowClick: (key: string, e: MouseEvent) => void;
    onToggleRowSelect: (key: string) => void;
    onOpenRowDropdown: (row: any) => void;
    onCloseRowDropdown: () => void;
    onEditRow: (row: any) => void;
    rowActionsComposable: any;
    onPreviewRow: (row: any) => void;
    tableRef: any;
    tableDensityClass: string;
    stickyColumnsState: any;
    rowChromeH: string;
    checkboxInteractiveClass: string;
    visibleKeys: string[];
    handleSortClick: (col: any) => void;
    rowRangeSelection: any;
    uid: string;
    pageSize: number;
    page: number;
    onPageChange: (page: number) => void;
    entity: string;
    columns: MetaColumn[];
    stickyColumns: any[] | undefined;
    dataColumns: any[] | undefined;
    auditingColumns: any[] | undefined;
    rowActionsEnabled: boolean;
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
      datetimeIanaRenderTick={datetimeIanaRenderTick}
      cell={cell}
      stickyColumnsGroup={stickyColumnsGroup}
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
        columns={columns}
        stickyColumns={stickyColumns}
        dataColumns={dataColumns}
        auditingColumns={auditingColumns}
        rowActionsEnabled={rowActionsEnabled}
        selectedKeys={selectedKeys}
        footerRangeTotal={footerRangeTotal}
        footerPage={footerPage}
        previewDropdownOpen={previewDropdownOpen}
        navigatePreview={navigatePreview}
      />
    {/if}
  {/if}
</div>
