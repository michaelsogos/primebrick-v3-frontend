<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n';
  import { LoadingBar } from '$lib/components/ui/loading-bar';
  import * as Table from '$lib/components/ui/table';
  import CircleX from '@lucide/svelte/icons/circle-x'
  import Hourglass from '@lucide/svelte/icons/hourglass'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import TableRow from './TableRow.svelte';
  import type { MetaColumn } from '$lib/entity-list/types';

  let {
    error,
    errorView,
    rowsLoading,
    rowsLoadingView,
    loadingText,
    rows,
    viewRows,
    shownColumns,
    extraCols,
    emptyView,
    emptyText,
    showSelectedOnly,
    selectionCount,
    orderedSelectedRows,
    rowSelectionEnabled,
    selectedKeys,
    rowRangeSelection,
    datetimeIanaRenderTick,
    rowKey,
    isRowDeleted,
    previewPanel,
    actionsEnabled,
    rowChromeH,
    stickyColumnsGroup,
    stickyColumnsState,
    datetimeIanaModeByKey,
    cell,
    rowActions,
    entityRowActions,
    dropdownMenuRow,
    onRowRangeMouseDown,
    onEntityRowClick,
    onPreviewRow,
    onToggleRowSelect,
    onOpenRowDropdown,
    onCloseRowDropdown,
    onEditRow,
    onLoadVersionHistory,
    onDuplicateRow,
    onDeleteRow,
    onRestoreRow,
    stickyCellClass
  }: {
    error: string | null;
    errorView?: Snippet;
    rowsLoading: boolean;
    rowsLoadingView?: Snippet;
    loadingText: string;
    rows: TRow[];
    viewRows: TRow[];
    shownColumns: MetaColumn[];
    extraCols: number;
    emptyView?: Snippet;
    emptyText: string;
    showSelectedOnly: boolean;
    selectionCount: number;
    orderedSelectedRows: TRow[];
    rowSelectionEnabled: boolean;
    selectedKeys: string[];
    rowRangeSelection: {
      rowRangeMouseDown: boolean;
      rangeDragActive: boolean;
    };
    datetimeIanaRenderTick: number;
    rowKey: (row: TRow) => string;
    isRowDeleted: (row: TRow) => boolean;
    previewPanel: {
      focusedRowIndex: number | null;
    };
    actionsEnabled: boolean;
    rowChromeH: string;
    stickyColumnsGroup: MetaColumn[];
    stickyColumnsState: any;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    cell?: Snippet<[ { row: TRow; column: MetaColumn } ]>;
    rowActions?: Snippet<[ { row: TRow } ]>;
    entityRowActions?: {
      duplicate?: boolean;
      delete?: boolean;
      edit?: boolean;
      preview?: boolean;
    };
    dropdownMenuRow: TRow | null;
    onRowRangeMouseDown: (index: number, e: MouseEvent) => void;
    onEntityRowClick: (key: string, e: MouseEvent) => void;
    onPreviewRow: (row: TRow) => void;
    onToggleRowSelect: (key: string) => void;
    onOpenRowDropdown: (row: TRow) => void;
    onCloseRowDropdown: () => void;
    onEditRow: (row: TRow) => void;
    onLoadVersionHistory: (row: TRow) => void;
    onDuplicateRow: (row: TRow) => void;
    onDeleteRow: (row: TRow) => void;
    onRestoreRow: (row: TRow) => void;
    stickyCellClass: (key: string, idx: number, isHeader: boolean) => string | undefined;
  } = $props();
</script>

<Table.Body
  class={rowSelectionEnabled && rowRangeSelection.rowRangeMouseDown && rowRangeSelection.rangeDragActive ? 'select-none' : undefined}
>
  {#if error}
    {#if errorView}
      {@render errorView()}
    {:else}
      <Table.Row>
        <Table.Cell colspan={shownColumns.length + extraCols} class="p-0">
          <div class="grid min-h-56 place-items-center p-3">
            <div class="relative flex flex-col items-center gap-2 text-center">
              <div class="pb-watermark-error">
                <CircleX class="size-20 text-destructive" />
              </div>
              <div class="text-sm font-medium text-muted-foreground">{error}</div>
            </div>
          </div>
        </Table.Cell>
      </Table.Row>
    {/if}
  {:else if rowsLoading && (!rows || rows.length === 0)}
    {#if rowsLoadingView}
      {@render rowsLoadingView()}
    {:else}
      <Table.Row>
        <Table.Cell colspan={shownColumns.length + extraCols} class="p-0">
          <div class="w-full">
            <LoadingBar size="xs" />
            <div class="grid min-h-56 place-items-center p-3">
              <div class="relative flex flex-col items-center gap-2 text-center">
                <div class="pb-watermark-loading">
                  <Hourglass class="size-20 text-info" />
                </div>
                <div class="text-sm font-medium text-muted-foreground">{loadingText}</div>
              </div>
            </div>
          </div>
        </Table.Cell>
      </Table.Row>
    {/if}
  {:else if !rows || rows.length === 0}
    {#if emptyView}
      {@render emptyView()}
    {:else}
      <Table.Row>
        <Table.Cell colspan={shownColumns.length + extraCols} class="p-0">
          <div class="grid min-h-56 place-items-center p-3">
            <div class="relative flex flex-col items-center gap-2 text-center">
              <div class="pb-watermark-empty">
                <TriangleAlert class="size-20 text-warning" />
              </div>
              <div class="text-sm font-medium text-muted-foreground">{emptyText}</div>
            </div>
          </div>
        </Table.Cell>
      </Table.Row>
    {/if}
  {:else if !viewRows || viewRows.length === 0}
    <Table.Row>
      <Table.Cell colspan={shownColumns.length + extraCols} class="p-0">
        <div class="grid min-h-56 place-items-center p-3">
          <div class="relative flex flex-col items-center gap-2 text-center">
            <div class="pb-watermark-empty">
              <TriangleAlert class="size-20 text-warning" />
            </div>
            <div class="text-sm font-medium text-muted-foreground">
              {#if showSelectedOnly && selectionCount > 0 && orderedSelectedRows.length === 0}
                {$t('entities.list.selectedRowsNotLoadedHint')}
              {:else}
                {$t('entities.list.noSelectedRowsInView')}
              {/if}
            </div>
          </div>
        </div>
      </Table.Cell>
    </Table.Row>
  {:else if viewRows && viewRows.length > 0}
    <!-- DEBUG: viewRowsLen={viewRows.length} -->
    {#each viewRows as r, i (rowKey(r))}
      {@const rk = rowKey(r)}
      {@const rowSelected = rowSelectionEnabled && selectedKeys.includes(rk)}
      {@const rowDeleted = isRowDeleted(r)}
      <TableRow
        {i}
        row={r}
        rowKey={rk}
        rowSelected={rowSelected}
        rowDeleted={rowDeleted}
        {shownColumns}
        {extraCols}
        {rowSelectionEnabled}
        {selectedKeys}
        {rowRangeSelection}
        {datetimeIanaRenderTick}
        {previewPanel}
        {actionsEnabled}
        {rowChromeH}
        {stickyColumnsGroup}
        {stickyColumnsState}
        {datetimeIanaModeByKey}
        {cell}
        {rowActions}
        {entityRowActions}
        {dropdownMenuRow}
        onRowRangeMouseDown={(index: number, e: MouseEvent) => rowRangeSelection.onRowRangeMouseDown(index, e)}
        onEntityRowClick={onEntityRowClick}
        onPreviewRow={onPreviewRow}
        onToggleRowSelect={onToggleRowSelect}
        onOpenRowDropdown={onOpenRowDropdown}
        onCloseRowDropdown={onCloseRowDropdown}
        onEditRow={onEditRow}
        onLoadVersionHistory={onLoadVersionHistory}
        onDuplicateRow={onDuplicateRow}
        onDeleteRow={onDeleteRow}
        onRestoreRow={onRestoreRow}
        {stickyCellClass}
      />
    {/each}
  {/if}
</Table.Body>
