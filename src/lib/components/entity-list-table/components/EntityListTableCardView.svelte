<script lang="ts" generics="TRow extends Record<string, unknown>">
  import CardViewRenderer from './CardViewRenderer.svelte';

  let {
    viewMode,
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
    loadingText,
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
    onPreviewRow
  }: EntityListTableCardViewProps = $props();

  type EntityListTableCardViewProps = {
    viewMode: 'table' | 'cards' | 'cards_list';
    viewRows: TRow[];
    shownColumns: any[];
    rowSelectionEnabled: boolean;
    selectedKeys: string[];
    rowKey: (row: TRow) => string;
    isRowDeleted: (row: TRow) => boolean;
    previewPanel: any;
    actionsEnabled: boolean;
    rowActions: any;
    entityRowActions: any;
    dropdownMenuRow: TRow | null;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick: number;
    cell: any;
    stickyColumnsGroup: any[];
    error: string | null;
    errorView?: (() => void) | null;
    rowsLoading: boolean;
    rowsLoadingView?: (() => void) | null;
    loadingText: string;
    rows: TRow[];
    emptyView?: (() => void) | null;
    emptyText: string;
    showSelectedOnly: boolean;
    selectionCount: number;
    orderedSelectedRows: TRow[];
    allOnPageSelected: boolean;
    headerIndeterminate: boolean;
    toggleAllOnPage: () => void;
    allColumns: any[];
    effectiveSortKey: string | null;
    sortDir: 'asc' | 'desc';
    onSortChange: (key: string, dir: 'asc' | 'desc') => void;
    sortableColumns: any[];
    datetimeIanaToggleColumns: any[];
    toggleDatetimeIana: (col: any) => void;
    onEntityRowClick: (key: string, e: MouseEvent) => void;
    onToggleRowSelect: (key: string) => void;
    onOpenRowDropdown: (row: TRow) => void;
    onCloseRowDropdown: () => void;
    onEditRow: (row: TRow) => void;
    rowActionsComposable: any;
    onPreviewRow: (row: TRow) => void;
  };
</script>

{#if viewMode !== 'table'}
  <CardViewRenderer
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
    onLoadVersionHistory={(r) => rowActionsComposable.loadVersionHistory(r)}
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
    onDuplicateRow={(r) => rowActionsComposable.handleDuplicateRow(r)}
    onDeleteRow={(r) => rowActionsComposable.handleDeleteRow(r)}
    onRestoreRow={(r) => rowActionsComposable.handleRestoreRow(r)}
    onPreviewRow={onPreviewRow}
  />
{/if}
