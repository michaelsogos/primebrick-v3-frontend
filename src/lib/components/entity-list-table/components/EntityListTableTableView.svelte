<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { Table, Root as TableRoot } from '$lib/components/ui/table';
  import { cn } from '$lib/utils';
  import TableBody from './TableBody.svelte';
  import PreviewPanelWrapper from './PreviewPanelWrapper.svelte';
  import EntityListTableHeaderRow from './EntityListTableHeaderRow.svelte';
  import { stickyCellClassWithCompute } from '../utils/cell-styling';
  import type { Snippet } from 'svelte';
  import type { MetaColumn } from '$lib/entity-list/types';

  let {
    tableRef,
    tableDensityClass,
    rowSelectionEnabled,
    stickyColumnsState,
    rowChromeH,
    checkboxInteractiveClass,
    allOnPageSelected,
    headerIndeterminate,
    toggleAllOnPage,
    shownColumns,
    stickyColumnsGroup,
    visibleKeys,
    sortKey,
    sortDir,
    rowsLoading,
    handleSortClick,
    datetimeIanaModeByKey,
    toggleDatetimeIana,
    actionsEnabled,
    previewPanel,
    viewRows,
    error,
    errorView,
    rowsLoadingView,
    loadingText,
    rows,
    extraCols,
    emptyView,
    emptyText,
    showSelectedOnly,
    selectionCount,
    orderedSelectedRows,
    rowRangeSelection,
    datetimeIanaRenderTick,
    rowKey,
    isRowDeleted,
    cell,
    rowActions,
    entityRowActions,
    dropdownMenuRow,
    onEntityRowClick,
    handlePreviewRow,
    toggleRowSelect,
    openRowDropdown,
    closeRowDropdown,
    handleEditRow,
    rowActionsComposable,
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
    selectedKeys,
    footerRangeTotal,
    footerPage,
    previewDropdownOpen,
    navigatePreview
  }: EntityListTableTableViewProps = $props();

  type EntityListTableTableViewProps = {
    tableRef: any;
    tableDensityClass: string;
    rowSelectionEnabled: boolean;
    stickyColumnsState: any;
    rowChromeH: string;
    checkboxInteractiveClass: string;
    allOnPageSelected: boolean;
    headerIndeterminate: boolean;
    toggleAllOnPage: () => void;
    shownColumns: any[];
    stickyColumnsGroup: any[];
    visibleKeys: string[];
    sortKey: string | null;
    sortDir: 'asc' | 'desc';
    rowsLoading: boolean;
    handleSortClick: (col: any) => void;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    toggleDatetimeIana: (col: any) => void;
    actionsEnabled: boolean;
    previewPanel: any;
    viewRows: TRow[];
    error: string | null;
    errorView?: Snippet;
    rowsLoadingView?: Snippet;
    loadingText: string;
    rows: any;
    extraCols: number;
    emptyView?: Snippet;
    emptyText: string;
    showSelectedOnly: boolean;
    selectionCount: number;
    orderedSelectedRows: TRow[];
    rowRangeSelection: any;
    datetimeIanaRenderTick: number;
    rowKey: (row: TRow) => string;
    isRowDeleted: (row: TRow) => boolean;
    cell: any;
    rowActions: any;
    entityRowActions: any;
    dropdownMenuRow: TRow | null;
    onEntityRowClick: (key: string, e: MouseEvent) => void;
    handlePreviewRow: (row: TRow) => void;
    toggleRowSelect: (key: string) => void;
    openRowDropdown: (row: TRow) => void;
    closeRowDropdown: () => void;
    handleEditRow: (row: TRow) => void;
    rowActionsComposable: any;
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
    selectedKeys: string[];
    footerRangeTotal: number;
    footerPage: number;
    previewDropdownOpen: boolean;
    navigatePreview: (direction: number) => void;
  };
</script>

<div class="flex h-full overflow-hidden" role="region" aria-label="Table and preview panel">
  <div class="flex-1 min-w-0 overflow-hidden">
    {#snippet tableChildren()}
      <EntityListTableHeaderRow
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
        sortKey={sortKey}
        sortDir={sortDir}
        rowsLoading={rowsLoading}
        handleSortClick={handleSortClick}
        datetimeIanaModeByKey={datetimeIanaModeByKey}
        toggleDatetimeIana={toggleDatetimeIana}
        actionsEnabled={actionsEnabled}
        previewPanel={previewPanel}
        viewRows={viewRows}
      />
      <TableBody
        error={error}
        errorView={errorView}
        rowsLoading={rowsLoading}
        rowsLoadingView={rowsLoadingView}
        loadingText={loadingText}
        rows={rows}
        viewRows={viewRows}
        shownColumns={shownColumns}
        extraCols={extraCols}
        emptyView={emptyView}
        emptyText={emptyText}
        showSelectedOnly={showSelectedOnly}
        selectionCount={selectionCount}
        orderedSelectedRows={orderedSelectedRows}
        rowSelectionEnabled={rowSelectionEnabled}
        selectedKeys={selectedKeys}
        rowRangeSelection={rowRangeSelection}
        datetimeIanaRenderTick={datetimeIanaRenderTick}
        rowKey={rowKey}
        isRowDeleted={isRowDeleted}
        previewPanel={previewPanel}
        actionsEnabled={actionsEnabled}
        rowChromeH={rowChromeH}
        stickyColumnsGroup={stickyColumnsGroup}
        onLoadVersionHistory={(row: TRow) => rowActionsComposable.loadVersionHistory(row)}
        stickyColumnsState={stickyColumnsState}
        datetimeIanaModeByKey={datetimeIanaModeByKey}
        cell={cell}
        rowActions={rowActions}
        entityRowActions={entityRowActions}
        dropdownMenuRow={dropdownMenuRow}
        onRowRangeMouseDown={(index: number, e: MouseEvent) => rowRangeSelection.onRowRangeMouseDown(index, e)}
        onEntityRowClick={onEntityRowClick}
        onPreviewRow={handlePreviewRow}
        onToggleRowSelect={toggleRowSelect}
        onOpenRowDropdown={openRowDropdown}
        onCloseRowDropdown={closeRowDropdown}
        onEditRow={handleEditRow}
        onDuplicateRow={(row: TRow) => rowActionsComposable.handleDuplicateRow(row)}
        onDeleteRow={(row: TRow) => rowActionsComposable.handleDeleteRow(row)}
        onRestoreRow={(row: TRow) => rowActionsComposable.handleRestoreRow(row)}
        stickyCellClass={(key, idx, isHeader) => stickyCellClassWithCompute(key, stickyColumnsGroup, visibleKeys, isHeader)}
      />
    {/snippet}
    <TableRoot
      class={cn(
        'w-full bg-background **:data-[slot=table]:isolate **:data-[slot=table]:bg-background **:data-[slot=table-cell]:bg-clip-border [&_[data-slot=table-cell]:not(.sticky)]:bg-background dark:[&_[data-slot=table-cell]:not(.sticky)]:bg-neutral-950 [&_[data-slot=table-head]:not(.sticky)]:bg-neutral-50 dark:[&_[data-slot=table-head]:not(.sticky)]:bg-neutral-900',
        tableDensityClass
      )}
      containerClass="h-full overflow-auto"
      children={tableChildren}
      bind:ref={tableRef}
    />
  </div>

  <PreviewPanelWrapper
    {previewPanel}
    {rows}
    {viewRows}
    {uid}
    {pageSize}
    {page}
    {onPageChange}
    {entity}
    {columns}
    {stickyColumns}
    {dataColumns}
    {auditingColumns}
    {rowActionsEnabled}
    {rowActions}
    {entityRowActions}
    {datetimeIanaModeByKey}
    {isRowDeleted}
    {rowKey}
    {rowSelectionEnabled}
    selectedKeys={selectedKeys as Set<string> | string[]}
    footerRangeTotal={footerRangeTotal}
    footerPage={footerPage}
    {previewDropdownOpen}
    navigatePreview={navigatePreview}
    onEditRow={handleEditRow}
    onDuplicateRow={(row: TRow) => rowActionsComposable.handleDuplicateRow(row)}
    onDeleteRow={(row: TRow) => rowActionsComposable.handleDeleteRow(row)}
    onRestoreRow={(row: TRow) => rowActionsComposable.handleRestoreRow(row)}
    onPreviewDropdownOpenChange={(open: boolean) => previewDropdownOpen = open}
    {rowsLoading}
    {cell}
  />
</div>
