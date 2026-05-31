<script lang="ts">
  import { t } from '$lib/i18n';
  import { cn } from '$lib/utils.js';
  import { Checkbox, checkboxInteractiveClass } from '$lib/components/ui/checkbox';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { Button } from '$lib/components/ui/button';
  import type { MetaColumn } from '$lib/entity-list/types';
  import { MoreVertical, Eye, EyeOff, Pencil, Trash2, ArrowUpFromLine, Copy, Download } from 'lucide-svelte';
  import CardField from './CardField.svelte';

  let {
    rows,
    columns,
    visibleKeys,
    selectedKeys,
    onSelectedKeysChange,
    uid,
    rowSelectionEnabled,
    rowActions,
    entityRowActions,
    datetimeIanaModeByKey,
    onRowClick,
    onPreviewRow,
    onEditRow,
    onDeleteRow,
    onRestoreRow,
    onDuplicateRow,
    onExportRow
  }: {
    rows: Record<string, unknown>[];
    columns: MetaColumn[];
    visibleKeys: string[];
    selectedKeys: string[];
    onSelectedKeysChange: (keys: string[]) => void;
    uid: string;
    rowSelectionEnabled: boolean;
    rowActions?: any;
    entityRowActions?: { duplicate?: boolean; delete?: boolean; edit?: boolean; preview?: boolean };
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    onRowClick?: (row: Record<string, unknown>) => void;
    onPreviewRow?: (row: Record<string, unknown>) => void;
    onEditRow?: (row: Record<string, unknown>) => void;
    onDeleteRow?: (row: Record<string, unknown>) => void;
    onRestoreRow?: (row: Record<string, unknown>) => void;
    onDuplicateRow?: (row: Record<string, unknown>) => void;
    onExportRow?: (row: Record<string, unknown>) => void;
  } = $props();

  const renderColumns = $derived(columns.filter((c) => visibleKeys.includes(c.key)));

  function rowKey(row: Record<string, unknown>): string {
    const v = row[uid as keyof typeof row] as unknown;
    return typeof v === 'string' ? v : String(v ?? '');
  }

  function isRowDeleted(row: Record<string, unknown>): boolean {
    return !!row['deleted_at'];
  }

  function toggleRowSelect(key: string) {
    if (selectedKeys.includes(key)) {
      onSelectedKeysChange(selectedKeys.filter((k) => k !== key));
    } else {
      onSelectedKeysChange([...selectedKeys, key]);
    }
  }
</script>

<div class="flex flex-col gap-3">
  {#each rows as r (rowKey(r))}
    {@const rk = rowKey(r)}
    {@const rowSelected = rowSelectionEnabled && selectedKeys.includes(rk)}
    {@const rowDeleted = isRowDeleted(r)}
    <button
      type="button"
      disabled={!rowSelectionEnabled}
      data-state={rowSelected ? 'selected' : undefined}
      class={cn(
        'group rounded-md border bg-background p-3 shadow-sm transition-colors flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:gap-4 text-left',
        rowSelectionEnabled
          ? rowSelected
            ? 'cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800'
            : 'cursor-pointer hover:bg-accent/40'
          : undefined,
        rowSelected
          ? 'bg-neutral-50 ring-1 ring-primary/40 dark:bg-neutral-700 dark:ring-primary/35'
          : undefined,
        rowDeleted ? 'opacity-60' : ''
      )}
      onclick={() => onRowClick?.(r)}
    >
      <div class="flex items-center gap-2">
        {#if rowSelectionEnabled}
          <Checkbox
            class={checkboxInteractiveClass}
            checked={selectedKeys.includes(rk)}
            onCheckedChange={() => toggleRowSelect(rk)}
            aria-label="select row"
          />
        {/if}
        <div class="flex flex-col gap-2 flex-1 min-w-0">
          {#each renderColumns as col (col.key)}
            <CardField row={r} column={col} {rowSelected} {rowDeleted} {datetimeIanaModeByKey} />
          {/each}
        </div>
      </div>

      {#if rowActions}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button variant="ghost" size="icon-sm" {...props}>
                <MoreVertical class="size-4" />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            {#if entityRowActions?.preview}
              <DropdownMenu.Item onclick={() => onPreviewRow?.(r)}>
                <div class="flex items-center gap-2">
                  <Eye class="size-4" />
                  <span>{$t('common.preview')}</span>
                </div>
              </DropdownMenu.Item>
            {/if}
            {#if entityRowActions?.edit}
              <DropdownMenu.Item onclick={() => onEditRow?.(r)}>
                <div class="flex items-center gap-2">
                  <Pencil class="size-4" />
                  <span>{$t('common.edit')}</span>
                </div>
              </DropdownMenu.Item>
            {/if}
            {#if entityRowActions?.duplicate}
              <DropdownMenu.Item onclick={() => onDuplicateRow?.(r)}>
                <div class="flex items-center gap-2">
                  <Copy class="size-4" />
                  <span>{$t('common.duplicate')}</span>
                </div>
              </DropdownMenu.Item>
            {/if}
            {#if entityRowActions?.delete}
              <DropdownMenu.Separator />
              {#if rowDeleted}
                <DropdownMenu.Item onclick={() => onRestoreRow?.(r)} class="text-warning">
                  <div class="flex items-center gap-2">
                    <span class="relative flex items-center justify-center">
                      <Trash2 class="size-4 text-warning/70" />
                      <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                    </span>
                    <span>{$t('common.restore')}</span>
                  </div>
                </DropdownMenu.Item>
              {:else}
                <DropdownMenu.Item onclick={() => onDeleteRow?.(r)} class="text-destructive">
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
    </button>
  {/each}
</div>
