<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n';
  import { LoadingBar } from '$lib/components/ui/loading-bar';
  import { CircleX } from '@primebrick/ui/vendor/lucide'
  import { Hourglass } from '@primebrick/ui/vendor/lucide'
  import { TriangleAlert } from '@primebrick/ui/vendor/lucide';
  import { cn } from '$lib/utils.js';
  import CardItem from './CardItem.svelte';
  import type { MetaColumn, RowCustomAction } from '$lib/entity-list/types';
  import type { EntityRowActions } from '../types';

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
    onEntityRowClick,
    onToggleRowSelect,
    onOpenRowDropdown,
    onCloseRowDropdown,
    onEditRow,
    onLoadVersionHistory,
    onDuplicateRow,
    onDeleteRow,
    onRestoreRow,
    onPreviewRow,
    handleCustomAction,
    sparklineData
  }: {
    viewMode: 'cards_list' | 'cards_grid' | 'cards';
    viewRows: TRow[];
    shownColumns: MetaColumn[];
    rowSelectionEnabled: boolean;
    selectedKeys: string[];
    rowKey: (row: TRow) => string;
    isRowDeleted: (row: TRow) => boolean;
    previewPanel: { state: { focusedRowIndex: number | null } };
    actionsEnabled: boolean;
    rowActions?: Snippet<[{ row: TRow }]>;
    entityRowActions?: EntityRowActions;
    dropdownMenuRow: TRow | null;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    cell?: Snippet<[{ row: TRow; column: MetaColumn }]>;
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
    onEntityRowClick: (key: string, e: MouseEvent) => void;
    onToggleRowSelect: (key: string) => void;
    onOpenRowDropdown: (row: TRow) => void;
    onCloseRowDropdown: () => void;
    onEditRow: (row: TRow) => void;
    onLoadVersionHistory: (row: TRow) => void;
    onDuplicateRow: (row: TRow) => void;
    onDeleteRow: (row: TRow) => void;
    onRestoreRow: (row: TRow) => void;
    onPreviewRow: (row: TRow) => void;
    handleCustomAction?: (action: RowCustomAction, row: TRow) => void;
    /** Per-column batch sparkline buckets — same map as the table view. */
    sparklineData?: Record<string, { by_key: Record<string, unknown[]>; bucket_unit?: string }>;
  } = $props();

  // Convert 'cards' to 'cards_grid' for internal use
  const internalViewMode = $derived(viewMode === 'cards' ? 'cards_grid' : viewMode);
</script>

<div class="h-full overflow-auto">
  {#if error}
    {#if errorView}
      {@render errorView()}
    {:else}
      <div class="grid min-h-56 place-items-center">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-error">
            <CircleX class="size-20 text-destructive" />
          </div>
          <div class="text-sm font-medium text-muted-foreground">{error}</div>
        </div>
      </div>
    {/if}
  {:else if rowsLoading && (!rows || rows.length === 0)}
    {#if rowsLoadingView}
      {@render rowsLoadingView()}
    {:else}
      <div class="w-full">
        <LoadingBar size="xs" />
        <div class="grid min-h-56 place-items-center">
          <div class="relative flex flex-col items-center gap-2 text-center">
            <div class="pb-watermark-loading">
              <Hourglass class="size-20 text-info" />
            </div>
            <div class="text-sm font-medium text-muted-foreground">{loadingText}</div>
          </div>
        </div>
      </div>
    {/if}
  {:else if !rows || rows.length === 0}
    {#if emptyView}
      {@render emptyView()}
    {:else}
      <div class="grid min-h-56 place-items-center">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-empty">
            <TriangleAlert class="size-20 text-warning" />
          </div>
          <div class="text-sm font-medium text-muted-foreground">{emptyText}</div>
        </div>
      </div>
    {/if}
  {:else if !viewRows || viewRows.length === 0}
    <div class="grid min-h-56 place-items-center">
      <div class="relative flex flex-col items-center gap-2 text-center">
        <div class="pb-watermark-empty">
          <TriangleAlert class="size-20 text-warning" />
        </div>
        <div class="text-sm font-medium text-muted-foreground">
          {#if showSelectedOnly && selectionCount > 0 && orderedSelectedRows.length === 0}
            {$t('system.entities.list.selected_rows_not_loaded_hint')}
          {:else}
            {$t('system.entities.list.no_selected_rows_in_view')}
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <div class="p-3">
      <div
        class={cn(
          internalViewMode === 'cards_list'
            ? 'flex flex-col gap-3'
            : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
        )}
      >
        {#if viewRows && viewRows.length > 0}
        {#each viewRows as r (rowKey(r))}
          {@const rk = rowKey(r)}
          {@const rowSelected = rowSelectionEnabled && selectedKeys.includes(rk)}
          {@const rowDeleted = isRowDeleted(r)}
          {@const rowFocused = previewPanel.state.focusedRowIndex !== null && viewRows[previewPanel.state.focusedRowIndex] === r}
          <CardItem
            row={r}
            rowKey={rk}
            rowSelected={rowSelected}
            rowDeleted={rowDeleted}
            rowFocused={rowFocused}
            rowSelectionEnabled={rowSelectionEnabled}
            actionsEnabled={actionsEnabled}
            shownColumns={shownColumns}
            stickyColumnsGroup={stickyColumnsGroup}
            datetimeIanaModeByKey={datetimeIanaModeByKey}
            cell={cell}
            rowActions={rowActions}
            entityRowActions={entityRowActions}
            dropdownMenuRow={dropdownMenuRow}
            viewMode={internalViewMode}
            onEntityRowClick={onEntityRowClick}
            onToggleRowSelect={onToggleRowSelect}
            onOpenRowDropdown={onOpenRowDropdown}
            onCloseRowDropdown={onCloseRowDropdown}
            onEditRow={onEditRow}
            onLoadVersionHistory={onLoadVersionHistory}
            onDuplicateRow={onDuplicateRow}
            onDeleteRow={onDeleteRow}
            onRestoreRow={onRestoreRow}
            onPreviewRow={onPreviewRow}
            handleCustomAction={handleCustomAction}
            sparklineData={sparklineData}
          />
        {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
