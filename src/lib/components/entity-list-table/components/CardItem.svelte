<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils.js';
  import CardFieldRenderer from './CardFieldRenderer.svelte';
  import CardActions from './CardActions.svelte';
  import type { MetaColumn } from '$lib/entity-list/types';

  let {
    row,
    index,
    rowKey,
    rowSelected,
    rowDeleted,
    rowFocused,
    rowSelectionEnabled,
    actionsEnabled,
    shownColumns,
    stickyColumnsGroup,
    datetimeIanaModeByKey,
    datetimeIanaRenderTick,
    cell,
    rowActions,
    entityRowActions,
    dropdownMenuRow,
    viewMode,
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
    selectedKeys
  }: {
    row: TRow;
    index: number;
    rowKey: string;
    rowSelected: boolean;
    rowDeleted: boolean;
    rowFocused: boolean;
    rowSelectionEnabled: boolean;
    actionsEnabled: boolean;
    shownColumns: MetaColumn[];
    stickyColumnsGroup: MetaColumn[];
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick: number;
    cell?: Snippet<[{ row: TRow; column: MetaColumn }]>;
    rowActions?: Snippet<[{ row: TRow }]>;
    entityRowActions?: {
      edit?: boolean;
      duplicate?: boolean;
      preview?: boolean;
      delete?: boolean;
    };
    dropdownMenuRow: TRow | null;
    viewMode: 'cards_list' | 'cards_grid';
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
    selectedKeys: string[];
  } = $props();
</script>

<div
  role="button"
  tabindex={rowSelectionEnabled ? 0 : -1}
  aria-disabled={!rowSelectionEnabled}
  data-state={rowSelected ? 'selected' : undefined}
  class={cn(
    'group rounded-md border bg-background p-3 shadow-sm transition-colors',
    viewMode === 'cards_list'
      ? 'flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:gap-4'
      : undefined,
    rowSelectionEnabled
      ? rowSelected
        ? 'cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800'
        : 'cursor-pointer hover:bg-accent/40'
      : undefined,
    rowSelected
      ? 'bg-neutral-50 ring-1 ring-primary/40 dark:bg-neutral-700 dark:ring-primary/35'
      : undefined,
    rowFocused ? 'border-2 border-primary ring-2 ring-primary/20' : ''
  )}
  onclick={(e) => {
    if (!rowSelectionEnabled) return;
    onEntityRowClick(rowKey, e);
  }}
  onkeydown={
    (e) => {
      if (!rowSelectionEnabled) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onToggleRowSelect(rowKey);
    }
  }
>
  {#if viewMode === 'cards_list'}
    <div
      class="flex w-full shrink-0 items-start justify-between gap-2 sm:w-auto sm:flex-col sm:items-stretch sm:gap-2"
    >
      <CardActions
        row={row}
        rowKey={rowKey}
        rowSelected={rowSelected}
        rowDeleted={rowDeleted}
        rowSelectionEnabled={rowSelectionEnabled}
        actionsEnabled={actionsEnabled}
        selectedKeys={selectedKeys}
        rowActions={rowActions}
        entityRowActions={entityRowActions}
        dropdownMenuRow={dropdownMenuRow}
        onToggleRowSelect={onToggleRowSelect}
        onOpenRowDropdown={onOpenRowDropdown}
        onCloseRowDropdown={onCloseRowDropdown}
        onEditRow={onEditRow}
        onLoadVersionHistory={onLoadVersionHistory}
        onDuplicateRow={onDuplicateRow}
        onDeleteRow={onDeleteRow}
        onRestoreRow={onRestoreRow}
        onPreviewRow={onPreviewRow}
        isListMode={true}
      />

      <div class="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-3">
        {#each shownColumns as col (col.key)}
          <CardFieldRenderer
            row={row}
            column={col}
            rowSelected={rowSelected}
            rowDeleted={rowDeleted}
            rowSelectionEnabled={rowSelectionEnabled}
            stickyColumnsGroup={stickyColumnsGroup}
            datetimeIanaModeByKey={datetimeIanaModeByKey}
            datetimeIanaRenderTick={datetimeIanaRenderTick}
            cell={cell}
            viewMode={viewMode}
          />
        {/each}
      </div>
    </div>
  {:else}
    <div class="mb-2 flex items-start justify-between gap-2">
      <CardActions
        row={row}
        rowKey={rowKey}
        rowSelected={rowSelected}
        rowDeleted={rowDeleted}
        rowSelectionEnabled={rowSelectionEnabled}
        actionsEnabled={actionsEnabled}
        selectedKeys={selectedKeys}
        rowActions={rowActions}
        entityRowActions={entityRowActions}
        dropdownMenuRow={dropdownMenuRow}
        onToggleRowSelect={onToggleRowSelect}
        onOpenRowDropdown={onOpenRowDropdown}
        onCloseRowDropdown={onCloseRowDropdown}
        onEditRow={onEditRow}
        onLoadVersionHistory={onLoadVersionHistory}
        onDuplicateRow={onDuplicateRow}
        onDeleteRow={onDeleteRow}
        onRestoreRow={onRestoreRow}
        onPreviewRow={onPreviewRow}
        isListMode={false}
      />
    </div>

    <div class="flex flex-col gap-2">
      {#each shownColumns as col (col.key)}
        <CardFieldRenderer
          row={row}
          column={col}
          rowSelected={rowSelected}
          rowDeleted={rowDeleted}
          rowSelectionEnabled={rowSelectionEnabled}
          stickyColumnsGroup={stickyColumnsGroup}
          datetimeIanaModeByKey={datetimeIanaModeByKey}
          datetimeIanaRenderTick={datetimeIanaRenderTick}
          cell={cell}
          viewMode={viewMode}
        />
      {/each}
    </div>
  {/if}
</div>
