<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils.js';
  import { t } from '$lib/i18n';
  import { Checkbox, checkboxInteractiveClass } from '$lib/components/ui/checkbox';
  import * as Table from '$lib/components/ui/table';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import { TableCell } from '../table';
  import CellRenderer from './CellRenderer.svelte';
  import {
    entityListGrayChromeCellClass,
    entityListDestructiveChromeCellClass,
    entityListDestructiveBandStickyInteractionClass,
    entityListGrayBandStickyInteractionClass,
    entityListDefaultScrollInteractionClass,
    entityListDestructiveScrollInteractionClass,
    datetimeIanaCellHighlightClass,
    isDatetimeIanaRecordMode,
    entityListDataCellValignClass
  } from '../utils/cell-styling';
  import MoreVertical from '@lucide/svelte/icons/more-vertical'
  import Pencil from '@lucide/svelte/icons/pencil'
  import Copy from '@lucide/svelte/icons/copy'
  import FileClock from '@lucide/svelte/icons/file-clock'
  import Eye from '@lucide/svelte/icons/eye'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import ArrowUpFromLine from '@lucide/svelte/icons/arrow-up-from-line';
  import type { CellArgs } from '../types';

  type TableRowCellArgs = CellArgs<TRow>;

  let {
    row,
    index,
    rowKey,
    rowSelected,
    rowDeleted,
    rowFocused,
    rowSelectionEnabled,
    actionsEnabled,
    rowChromeH,
    selectedKeys,
    shownColumns,
    stickyColumnsGroup,
    stickyColumnsState,
    datetimeIanaModeByKey,
    datetimeIanaRenderTick,
    cell,
    rowActions,
    entityRowActions,
    dropdownMenuRow,
    previewPanel,
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
    stickyCellClass,
    isRowDeleted
  }: {
    row: TRow;
    index: number;
    rowKey: string;
    rowSelected: boolean;
    rowDeleted: boolean;
    rowFocused: boolean;
    rowSelectionEnabled: boolean;
    actionsEnabled: boolean;
    rowChromeH: string;
    selectedKeys: string[];
    shownColumns: import('$lib/entity-list/types').MetaColumn[];
    stickyColumnsGroup: import('$lib/entity-list/types').MetaColumn[];
    stickyColumnsState: {
      stickyLeftOffsets: Record<string, number>;
      stickyRef: any;
    };
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick: number;
    cell?: Snippet<[TableRowCellArgs]>;
    rowActions?: Snippet<[{ row: TRow }]>;
    entityRowActions?: {
      edit?: boolean;
      duplicate?: boolean;
      preview?: boolean;
      delete?: boolean;
    };
    dropdownMenuRow: TRow | null;
    previewPanel: {
      focusedRowIndex: number | null;
    };
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
    isRowDeleted: (row: TRow) => boolean;
  } = $props();
</script>

<Table.Row
  suppressCellHoverMuted
  data-row-index={rowSelectionEnabled ? index : undefined}
  data-focused-row-index={rowFocused ? index : undefined}
  data-state={rowSelected ? 'selected' : undefined}
  class={cn(
    'group/entity-row',
    rowSelected ? 'data-[state=selected]:bg-transparent!' : undefined,
    rowFocused ? 'border-2 border-primary ring-2 ring-primary/20' : ''
  )}
  onmousedown={rowSelectionEnabled ? (e) => onRowRangeMouseDown(index, e) : undefined}
  onclick={rowSelectionEnabled ? (e) => onEntityRowClick(rowKey, e) : undefined}
  ondblclick={() => onPreviewRow(row)}
>
  {#if rowSelectionEnabled}
    <Table.Cell
      class={cn(
        'w-10 min-w-10 max-w-10 sticky left-0 z-50 bg-clip-border p-2',
        rowDeleted
          ? entityListDestructiveChromeCellClass(rowSelected)
          : entityListGrayChromeCellClass(rowSelected)
      )}
    >
      <div class={cn('flex items-center justify-center', rowChromeH)}>
        <Checkbox
          id={`row-select-${rowKey}`}
          value={rowKey}
          class={checkboxInteractiveClass}
          checked={rowSelected}
          onCheckedChange={() => onToggleRowSelect(rowKey)}
          aria-label="select row"
        />
      </div>
    </Table.Cell>
  {/if}
  {#each shownColumns as col, colIdx (col.key)}
    {#if stickyColumnsGroup.some((s) => s.key === col.key)}
      {#if index === 0}
        <Table.Cell
          style="left: {stickyColumnsState.stickyLeftOffsets[col.key] ?? 0}px;"
          class={cn(
            stickyCellClass(col.key, colIdx, false),
            datetimeIanaCellHighlightClass(col, rowSelected, datetimeIanaModeByKey),
            isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)
              ? undefined
              : (rowDeleted
                ? entityListDestructiveBandStickyInteractionClass(rowSelected)
                : entityListGrayBandStickyInteractionClass(rowSelected)),
            entityListDataCellValignClass(col)
          )}
        >
          <div use:stickyColumnsState.stickyRef={{ key: col.key, isHead: false }}>
            <CellRenderer
              row={row}
              column={col}
              cell={cell}
              datetimeIanaModeByKey={datetimeIanaModeByKey}
              datetimeIanaRenderTick={datetimeIanaRenderTick}
            />
          </div>
        </Table.Cell>
      {:else}
        <Table.Cell
          style="left: {stickyColumnsState.stickyLeftOffsets[col.key] ?? 0}px;"
          class={cn(
            stickyCellClass(col.key, colIdx, false),
            datetimeIanaCellHighlightClass(col, rowSelected, datetimeIanaModeByKey),
            isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)
              ? undefined
              : (rowDeleted
                ? entityListDestructiveBandStickyInteractionClass(rowSelected)
                : entityListGrayBandStickyInteractionClass(rowSelected)),
            entityListDataCellValignClass(col)
          )}
        >
          <CellRenderer
            row={row}
            column={col}
            cell={cell}
            datetimeIanaModeByKey={datetimeIanaModeByKey}
            datetimeIanaRenderTick={datetimeIanaRenderTick}
          />
        </Table.Cell>
      {/if}
    {:else}
      <Table.Cell
        class={cn(
          stickyCellClass(col.key, colIdx, false),
          datetimeIanaCellHighlightClass(col, rowSelected, datetimeIanaModeByKey),
          isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)
            ? undefined
            : (rowDeleted
              ? entityListDestructiveScrollInteractionClass(rowSelected)
              : entityListDefaultScrollInteractionClass(rowSelected)),
          entityListDataCellValignClass(col)
        )}
      >
        <CellRenderer
          row={row}
          column={col}
          cell={cell}
          datetimeIanaModeByKey={datetimeIanaModeByKey}
          datetimeIanaRenderTick={datetimeIanaRenderTick}
        />
      </Table.Cell>
    {/if}
  {/each}
  {#if actionsEnabled}
    <Table.Cell
      class={cn(
        'w-10 min-w-10 max-w-10 sticky right-0 z-50 bg-clip-border p-2',
        entityListGrayChromeCellClass(rowSelected)
      )}
    >
      <div class={cn('flex items-center justify-center', rowChromeH)}>
        {#if rowActions}
          {@render rowActions({ row })}
        {:else}
          <DropdownMenu.Root open={dropdownMenuRow === row} onOpenChange={(open) => { if (!open) onCloseRowDropdown(); }}>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Button 
                  {...props}
                  variant="ghost" 
                  size="icon-sm" 
                  aria-label="row actions" 
                  title="actions"
                  onclick={(e) => {
                    e.stopPropagation();
                    onOpenRowDropdown(row);
                  }}
                >
                  <MoreVertical class="size-4" />
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content class="w-56" align="end">
              {#if entityRowActions?.edit !== false}
                <DropdownMenu.Item
                  onclick={(e) => { e.stopPropagation(); if (isRowDeleted(row)) return; onEditRow(row); }}
                  class={isRowDeleted(row) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                >
                  <div class="flex items-center gap-2">
                    <Pencil class="size-4 opacity-70" />
                    <span>{$t('common.edit')}</span>
                  </div>
                </DropdownMenu.Item>
              {/if}
              {#if entityRowActions?.duplicate !== false}
                <DropdownMenu.Item
                  onclick={(e) => { e.stopPropagation(); if (isRowDeleted(row)) return; onDuplicateRow(row); }}
                  class={isRowDeleted(row) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                >
                  <div class="flex items-center gap-2">
                    <Copy class="size-4 opacity-70" />
                    <span>{$t('common.duplicate')}</span>
                  </div>
                </DropdownMenu.Item>
              {/if}
              <DropdownMenu.Item
                onclick={(e) => { e.stopPropagation(); onLoadVersionHistory(row); }}
              >
                <div class="flex items-center gap-2">
                  <FileClock class="size-4 opacity-70" />
                  <span>{$t('common.versionHistory')}</span>
                </div>
              </DropdownMenu.Item>
              {#if entityRowActions?.preview !== false}
                <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); onPreviewRow(row); }}>
                  <div class="flex items-center gap-2">
                    <Eye class="size-4 opacity-70" />
                    <span>{$t('entities.list.preview')}</span>
                  </div>
                </DropdownMenu.Item>
              {/if}
              {#if entityRowActions?.delete !== false}
                <DropdownMenu.Separator />
                {#if isRowDeleted(row)}
                  <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); onRestoreRow(row); }} class="text-warning">
                    <div class="flex items-center gap-2">
                      <span class="relative flex items-center justify-center">
                        <Trash2 class="size-4 text-warning/70" />
                        <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                      </span>
                      <span>{$t('common.restore')}</span>
                    </div>
                  </DropdownMenu.Item>
                {:else}
                  <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); onDeleteRow(row); }} class="text-destructive">
                    <div class="flex items-center gap-2">
                      <Trash2 class="size-4 text-destructive/70" />
                      <span>{$t('common.delete')}</span>
                    </div>
                  </DropdownMenu.Item>
                {/if}
              {/if}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}
      </div>
    </Table.Cell>
  {/if}
</Table.Row>
