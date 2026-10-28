<script lang="ts" generics="TRow extends Record<string, unknown>">
  import CardViewRenderer from './CardViewRenderer.svelte';
  import type { Snippet } from 'svelte';
  import type { MetaColumn } from '$lib/entity-list/types';
  import type { CellArgs, EntityRowActions } from '../types';
  import type { usePreviewPanel } from '../composables/usePreviewPanel.svelte';
  import type { useRowActions } from '../composables/useRowActions.svelte';

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
    onPreviewRow,
    sparklineData
  }: EntityListTableCardViewProps = $props();

  type EntityListTableCardViewProps = {
    viewMode: 'table' | 'cards' | 'cards_list';
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
    cell?: Snippet<[CellArgs<TRow>]>;
    stickyColumnsGroup: MetaColumn[];
    error: string | null;
    errorView?: Snippet;
    rowsLoading: boolean;
    rowsLoadingView?: Snippet;
    loadingText: string;
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
    /** Per-column batch sparkline buckets — same map as the table view. */
    sparklineData?: Record<string, { by_key: Record<string, unknown[]>; bucket_unit?: string }>;
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
    handleCustomAction={(a, r) => rowActionsComposable.handleCustomAction(a, r)}
    sparklineData={sparklineData}
  />
{/if}
