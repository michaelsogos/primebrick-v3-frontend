<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Switch } from '$lib/components/ui/switch';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { badgeClassesFromToken } from '$lib/colors/badge';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import {
    ChevronLeft,
    ChevronRight,
    Pencil,
    PencilOff,
    MoreVertical,
    Copy,
    FileClock,
    Trash2,
    ArrowUpFromLine,
    X
  } from 'lucide-svelte';
  import type { MetaColumn } from '$lib/entity-list/types';
  import { formatDatetimeCellDisplay } from '$lib/entity-list';
  import { formatListCellValue } from '$lib/i18n/date-format';
  import { isBlankish, getAuditFieldValue, isCardFieldEmpty } from '../utils/cell-formatting';
  import {
    isDatetimeIanaRecordMode,
    datetimeIanaCardFieldHighlightClass
  } from '../utils/cell-styling';

  type CellArgs = { row: TRow; column: MetaColumn };

  interface PreviewPanelProps {
    row: TRow;
    previewEditMode: boolean;
    previewRowIndex: number;
    previewDropdownOpen: boolean;
    totalRecords: number;
    currentPage: number;
    pageSize: number;
    onPreviewEditModeChange: (mode: boolean) => void;
    onNavigatePreview: (direction: number) => void;
    onPreviewDropdownOpenChange: (open: boolean) => void;
    onEditRow: (row: TRow) => void;
    onDuplicateRow: (row: TRow) => void;
    onDeleteRow: (row: TRow) => void;
    onRestoreRow: (row: TRow) => void;
    onLoadVersionHistory: (row: TRow) => void;
    onClosePreview: () => void;
    cell?: Snippet<[CellArgs]>;
    columns: MetaColumn[];
    stickyColumns?: MetaColumn[];
    dataColumns?: MetaColumn[];
    auditingColumns?: MetaColumn[];
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    entityRowActions?: { edit?: boolean; duplicate?: boolean; delete?: boolean; preview?: boolean };
    isRowDeleted: (row: TRow) => boolean;
    rowSelectionEnabled: boolean;
    rowSelected: boolean;
  }

  let {
    row,
    previewEditMode,
    previewRowIndex,
    previewDropdownOpen,
    totalRecords,
    currentPage,
    pageSize,
    onPreviewEditModeChange,
    onNavigatePreview,
    onPreviewDropdownOpenChange,
    onEditRow,
    onDuplicateRow,
    onDeleteRow,
    onRestoreRow,
    onLoadVersionHistory,
    onClosePreview,
    cell,
    columns,
    stickyColumns = [],
    dataColumns = [],
    auditingColumns = [],
    datetimeIanaModeByKey,
    entityRowActions,
    isRowDeleted,
    rowSelectionEnabled,
    rowSelected
  }: PreviewPanelProps = $props();

  const rowDeleted = $derived(isRowDeleted(row));
  const shownColumns = $derived([...(stickyColumns || []), ...(dataColumns || [])]);

  function listDefaultCellValue(row: TRow, col: MetaColumn) {
    const value = row[col.key];
    if (col.type === 'boolean') {
      return value === true ? '✓' : value === false ? '✗' : '-';
    } else if (col.badge?.values && value) {
      const badgeValue = value as string;
      const badgeColors = badgeClassesFromToken(col.badge.values[badgeValue]?.color ?? null);
      return {
        type: 'badge',
        colors: badgeColors,
        text: col.badge.values[badgeValue]?.labelText || $t(col.badge.values[badgeValue]?.labelKey || `entities.customer.status.${badgeValue}`)
      };
    } else if (col.type === 'datetime') {
      const mode = datetimeIanaModeByKey[col.key] ?? 'browser';
      const parts = formatDatetimeCellDisplay(col, row as Record<string, unknown>, $uiLang, mode);
      if (isDatetimeIanaRecordMode(col, datetimeIanaModeByKey) && parts.iana) {
        return {
          type: 'datetime-with-iana',
          text: parts.text,
          iana: parts.iana
        };
      }
      return parts.text;
    }
    return formatListCellValue(col, value, $uiLang);
  }
</script>

<div class="flex h-full flex-col bg-background">
  {#snippet headerTitle()}
    {@const rowDeleted = isRowDeleted(row)}
    <div class="relative flex items-center">
      <div>{$t('entities.list.previewPanelTitle')}</div>
      {#if rowDeleted}
        <div class="absolute left-0 top-full -mt-[2px] text-destructive text-[10px] whitespace-nowrap">{$t('common.deletedRecord')}</div>
      {/if}
    </div>
  {/snippet}

  {#snippet headerActions()}
    <!-- Micro pagination absolutely centered in header -->
    <div class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1">
      <Button
        size="icon-sm"
        variant="secondary-outline"
        onclick={() => onNavigatePreview(-1)}
        disabled={previewRowIndex === 0 && currentPage === 1}
        aria-label="Previous record"
        class="pointer-events-auto hover:scale-105 transition-all"
      >
        <ChevronLeft class="w-4 h-4" />
      </Button>
      <span class="text-xs font-medium w-16 text-center">
        {(currentPage - 1) * pageSize + previewRowIndex + 1} / {totalRecords}
      </span>
      <Button
        size="icon-sm"
        variant="secondary-outline"
        onclick={() => onNavigatePreview(1)}
        disabled={previewRowIndex >= columns.length - 1 && currentPage >= Math.ceil(totalRecords / pageSize)}
        aria-label="Next record"
        class="pointer-events-auto hover:scale-105 transition-all"
      >
        <ChevronRight class="w-4 h-4" />
      </Button>
    </div>

    <!-- CTAs on right -->
    {#if !rowDeleted}
      <!-- Mode switch with icons only -->
      <div class="flex items-center gap-2">
        {#if !previewEditMode}
          <PencilOff class="w-4 h-4 text-muted-foreground" />
        {:else}
          <Pencil class="w-4 h-4 text-muted-foreground" />
        {/if}
        <Switch
          checked={previewEditMode}
          onCheckedChange={onPreviewEditModeChange}
          aria-label={$t('entities.list.editModeLabel')}
          disabled={rowDeleted}
        />
      </div>
    {/if}

    <!-- Kebab menu for row actions -->
    <DropdownMenu.Root bind:open={previewDropdownOpen} onOpenChange={onPreviewDropdownOpenChange}>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button 
            {...props}
            variant="ghost" 
            size="icon-sm" 
            aria-label={$t('common.more')} 
            class="mr-1"
          >
            <MoreVertical class="w-4 h-4" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content class="w-56" align="end">
        {#if entityRowActions?.edit !== false}
          <DropdownMenu.Item
            onclick={() => { if (rowDeleted) return; onEditRow(row); }}
            class={rowDeleted ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
          >
            <div class="flex items-center gap-2">
              <Pencil class="size-4 opacity-70" />
              <span>{$t('common.edit')}</span>
            </div>
          </DropdownMenu.Item>
        {/if}
        {#if entityRowActions?.duplicate !== false}
          <DropdownMenu.Item
            onclick={() => { if (rowDeleted) return; onDuplicateRow(row); }}
            class={rowDeleted ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
          >
            <div class="flex items-center gap-2">
              <Copy class="size-4 opacity-70" />
              <span>{$t('common.duplicate')}</span>
            </div>
          </DropdownMenu.Item>
        {/if}
        <DropdownMenu.Item
          onclick={() => onLoadVersionHistory(row)}
        >
          <div class="flex items-center gap-2">
            <FileClock class="size-4 opacity-70" />
            <span>{$t('common.versionHistory')}</span>
          </div>
        </DropdownMenu.Item>
        {#if entityRowActions?.delete !== false}
          {#if rowDeleted}
            <DropdownMenu.Separator />
            <DropdownMenu.Item onclick={() => onRestoreRow(row)} class="text-warning">
              <div class="flex items-center gap-2">
                <span class="relative flex items-center justify-center">
                  <Trash2 class="size-4 text-warning/70" />
                  <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                </span>
                <span>{$t('common.restore')}</span>
              </div>
            </DropdownMenu.Item>
          {:else}
            <DropdownMenu.Separator />
            <DropdownMenu.Item onclick={() => onDeleteRow(row)} class="text-destructive">
              <div class="flex items-center gap-2">
                <Trash2 class="size-4 text-destructive/70" />
                <span>{$t('common.delete')}</span>
              </div>
            </DropdownMenu.Item>
          {/if}
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <!-- Close button -->
    <Button
      onclick={onClosePreview}
      size="icon-sm"
      variant="ghost"
      aria-label={$t('common.close')}
    >
      <X class="w-4 h-4" />
    </Button>
  {/snippet}

  <SheetHeader title={headerTitle} actions={headerActions} />

  <!-- Scrollable content -->
  <div class="flex-1 overflow-y-auto">
    {#if previewEditMode}
      <div class="px-4 py-3 text-sm text-muted-foreground">
        Edit mode - coming soon
      </div>
    {:else}
      {#if stickyColumns && stickyColumns.length > 0}
        <div class="my-2 sticky top-0 z-10 bg-background">
          <div class="flex items-center gap-2">
            <div class="h-px flex-1 bg-muted-foreground/50"></div>
            <div class="text-xs font-medium text-muted-foreground">{$t('entities.list.stickyFields')}</div>
            <div class="h-px flex-1 bg-muted-foreground/50"></div>
          </div>
        </div>
        <div class="px-2 grid grid-cols-2 gap-2 min-w-0">
          {#each stickyColumns as col}
            {@const isIanaRecordMode = col.type === 'datetime' && col.datetimeIanaToggle && (datetimeIanaModeByKey[col.key] ?? 'browser') === 'record'}
            <div class="flex flex-col gap-1 rounded-md p-2 hover:bg-accent min-w-0 {isIanaRecordMode ? 'border border-amber-200/70 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950' : ''}">
              <span class="text-xs font-semibold text-primary break-words">{$t(col.labelKey)}</span>
              {@render renderPreviewCell(row, col, rowSelected, rowDeleted)}
            </div>
          {/each}
        </div>
      {/if}

      {#if dataColumns && dataColumns.length > 0}
        <div class="my-2 sticky top-0 z-10 bg-background">
          <div class="flex items-center gap-2">
            <div class="h-px flex-1 bg-muted-foreground/50"></div>
            <div class="text-xs font-medium text-muted-foreground">{$t('entities.list.dataFields')}</div>
            <div class="h-px flex-1 bg-muted-foreground/50"></div>
          </div>
        </div>
        <div class="px-2 grid grid-cols-2 gap-2 min-w-0">
          {#each dataColumns as col}
            {@const isIanaRecordMode = col.type === 'datetime' && col.datetimeIanaToggle && (datetimeIanaModeByKey[col.key] ?? 'browser') === 'record'}
            <div class="flex flex-col gap-1 rounded-md p-2 hover:bg-accent min-w-0 {isIanaRecordMode ? 'border border-amber-200/70 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950' : ''}">
              <span class="text-xs font-semibold text-primary break-words">{$t(col.labelKey)}</span>
              {@render renderPreviewCell(row, col, rowSelected, rowDeleted)}
            </div>
          {/each}
        </div>
      {/if}

      {#if auditingColumns && auditingColumns.length > 0}
        <div class="my-2 sticky top-0 z-10 bg-background">
          <div class="flex items-center gap-2">
            <div class="h-px flex-1 bg-muted-foreground/50"></div>
            <div class="text-xs font-medium text-muted-foreground">{$t('entities.list.auditingFields')}</div>
            <div class="h-px flex-1 bg-muted-foreground/50"></div>
          </div>
        </div>
        <div class="px-2 grid grid-cols-2 gap-2 min-w-0">
          {#each auditingColumns as col}
            {@const isIanaRecordMode = col.type === 'datetime' && col.datetimeIanaToggle && (datetimeIanaModeByKey[col.key] ?? 'browser') === 'record'}
            <div class="flex flex-col gap-1 rounded-md p-2 hover:bg-accent min-w-0 {isIanaRecordMode ? 'border border-amber-200/70 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950' : ''}">
              <span class="text-xs font-semibold text-primary break-words">{$t(col.labelKey)}</span>
              {@render renderPreviewCell(row, col, rowSelected, rowDeleted)}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

{#snippet renderPreviewCell(row: TRow, col: MetaColumn, rowSelected: boolean, rowDeleted: boolean)}
  {@const value = row[col.key]}
  {#if col.type === 'badge' && col.badge?.values && value}
    {@const badgeValue = value as string}
    {@const badgeColors = badgeClassesFromToken(col.badge.values[badgeValue]?.color ?? null)}
    <Badge
      class="shadow-none"
      style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
    >
      {col.badge.values[badgeValue]?.labelText || $t(col.badge.values[badgeValue]?.labelKey || `entities.customer.status.${badgeValue}`)}
    </Badge>
  {:else if col.type === 'datetime' && col.datetimeIanaToggle}
    {@const mode = datetimeIanaModeByKey[col.key] ?? 'browser'}
    {@const parts = formatDatetimeCellDisplay(col, row as Record<string, unknown>, $uiLang, mode)}
    {#if isDatetimeIanaRecordMode(col, datetimeIanaModeByKey) && parts.iana}
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-sm font-medium break-words">{parts.text}</span>
        <Badge
          variant="outline"
          class="w-fit max-w-fit border-amber-300/90 bg-amber-100 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-950 shadow-none dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          {parts.iana}
        </Badge>
      </div>
    {:else}
      <span class="text-sm font-medium break-words">{parts.text}</span>
    {/if}
  {:else if cell}
    {@render cell({ row, column: col })}
  {:else}
    <span class="text-sm font-medium break-words">{formatListCellValue(col, value, $uiLang)}</span>
  {/if}
{/snippet}
