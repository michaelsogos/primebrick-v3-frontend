<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import type { MetaColumn } from '$lib/entity-list/types';
  import type { CellArgs, EntityRowActions } from '../types';
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
    focusedRowIndex,
    onOpenColumnSelector,
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
    effectiveSortKey,
    sortDir,
    toggleDatetimeIana,
    onEntityRowClick,
    onToggleRowSelect,
    onOpenRowDropdown,
    onCloseRowDropdown,
    onEditRow,
    rowActionsComposable,
    onRowDblClick,
    tableRef = $bindable(),
    tableDensityClass,
    stickyColumnsState,
    rowChromeH,
    checkboxInteractiveClass,
    visibleKeys,
    handleSortClick,
    rowRangeSelection,
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
    focusedRowIndex: number | null;
    onOpenColumnSelector: () => void;
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
    effectiveSortKey: string | null;
    sortDir: 'asc' | 'desc';
    toggleDatetimeIana: (col: MetaColumn) => void;
    onEntityRowClick: (key: string, e: MouseEvent) => void;
    onToggleRowSelect: (key: string) => void;
    onOpenRowDropdown: (row: TRow) => void;
    onCloseRowDropdown: () => void;
    onEditRow: (row: TRow) => void;
    rowActionsComposable: ReturnType<typeof useRowActions<TRow>>;
    onRowDblClick: (row: TRow) => void;
    tableRef: HTMLTableElement | null;
    tableDensityClass: string;
    stickyColumnsState: ReturnType<typeof useStickyColumns>;
    rowChromeH: string;
    checkboxInteractiveClass: string;
    visibleKeys: string[];
    handleSortClick: (col: MetaColumn) => void;
    rowRangeSelection: ReturnType<typeof useRowRangeSelection>;
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
      focusedRowIndex={focusedRowIndex}
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
      onEntityRowClick={onEntityRowClick}
      onToggleRowSelect={onToggleRowSelect}
      onOpenRowDropdown={onOpenRowDropdown}
      onCloseRowDropdown={onCloseRowDropdown}
      onEditRow={onEditRow}
      rowActionsComposable={rowActionsComposable}
    />
    {#if viewMode === 'table'}
      <EntityListTableTableView
        bind:tableRef
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
        focusedRowIndex={focusedRowIndex}
        onOpenColumnSelector={onOpenColumnSelector}
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
        onRowDblClick={onRowDblClick}
        toggleRowSelect={onToggleRowSelect}
        openRowDropdown={onOpenRowDropdown}
        closeRowDropdown={onCloseRowDropdown}
        handleEditRow={onEditRow}
        rowActionsComposable={rowActionsComposable}
        selectedKeys={selectedKeys}
      />
    {/if}
  {/if}
</div>
