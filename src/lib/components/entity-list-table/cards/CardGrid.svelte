<script lang="ts">
  import { t } from '$lib/i18n';
  import { cn } from '$lib/utils.js';
  import { Checkbox, checkboxInteractiveClass } from '$lib/components/ui/checkbox';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import type { MetaColumn } from '$lib/entity-list/types';
  import { MoreVertical, Eye, Pencil, Trash2, ArrowUpFromLine, Copy, FileClock } from 'lucide-svelte';
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
    datetimeIanaRenderTick,
    viewMode,
    onRowClick,
    onPreviewRow,
    onEditRow,
    onDeleteRow,
    onRestoreRow,
    onDuplicateRow,
    onVersionHistory,
    rowFocusedIndex,
    cell,
    isRowDeleted
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
    datetimeIanaRenderTick?: number;
    viewMode: 'cards_grid' | 'cards_list';
    onRowClick?: (row: Record<string, unknown>, key: string, e: MouseEvent) => void;
    onPreviewRow?: (row: Record<string, unknown>) => void;
    onEditRow?: (row: Record<string, unknown>) => void;
    onDeleteRow?: (row: Record<string, unknown>) => void;
    onRestoreRow?: (row: Record<string, unknown>) => void;
    onDuplicateRow?: (row: Record<string, unknown>) => void;
    onVersionHistory?: (row: Record<string, unknown>) => void;
    rowFocusedIndex?: number | null;
    cell?: any;
    isRowDeleted?: (row: Record<string, unknown>) => boolean;
  } = $props();

  const renderColumns = $derived(columns.filter((c) => visibleKeys.includes(c.key)));

  function rowKey(row: Record<string, unknown>): string {
    const v = row[uid as keyof typeof row] as unknown;
    return typeof v === 'string' ? v : String(v ?? '');
  }

  function toggleRowSelect(key: string) {
    if (selectedKeys.includes(key)) {
      onSelectedKeysChange(selectedKeys.filter((k) => k !== key));
    } else {
      onSelectedKeysChange([...selectedKeys, key]);
    }
  }
</script>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {#each rows as r, i (rowKey(r))}
    {@const rk = rowKey(r)}
    {@const rowSelected = rowSelectionEnabled && selectedKeys.includes(rk)}
    {@const rowDeleted = isRowDeleted?.(r) ?? false}
    {@const rowFocused = rowFocusedIndex !== null && rowFocusedIndex === i}
    <div
      role="button"
      tabindex={rowSelectionEnabled ? 0 : -1}
      aria-disabled={!rowSelectionEnabled}
      data-state={rowSelected ? 'selected' : undefined}
      class={cn(
        'group rounded-md border bg-background p-3 shadow-sm transition-colors',
        rowSelectionEnabled
          ? rowSelected
            ? 'cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800'
            : 'cursor-pointer hover:bg-accent/40'
          : undefined,
        rowSelected
          ? 'bg-neutral-50 ring-1 ring-primary/40 dark:bg-neutral-700 dark:ring-primary/35'
          : undefined,
        rowDeleted ? 'opacity-60' : '',
        rowFocused ? 'border-2 border-primary ring-2 ring-primary/20' : ''
      )}
      onclick={(e) => onRowClick?.(r, rk, e)}
      onkeydown={
        (e) => {
          if (!rowSelectionEnabled) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          toggleRowSelect(rk);
        }
      }
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2">
          {#if rowSelectionEnabled}
            <div
              class="shrink-0"
              data-pb-card-cta
              role="button"
              tabindex="-1"
              onclick={(e) => e.stopPropagation()}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
              }}
            >
              <Checkbox
                class={checkboxInteractiveClass}
                checked={selectedKeys.includes(rk)}
                onCheckedChange={() => toggleRowSelect(rk)}
                aria-label={$t('entities.list.selectRow')}
              />
            </div>
          {/if}
          <div class="flex flex-col gap-2 flex-1 min-w-0">
            {#each renderColumns as col (col.key)}
              <CardField 
                row={r} 
                column={col} 
                {rowSelected} 
                {rowDeleted} 
                {datetimeIanaModeByKey}
                {viewMode}
                {cell}
                datetimeIanaRenderTick={datetimeIanaRenderTick ?? 0}
              />
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
              {#if onVersionHistory}
                <DropdownMenu.Item onclick={() => onVersionHistory(r)}>
                  <div class="flex items-center gap-2">
                    <FileClock class="size-4" />
                    <span>{$t('common.versionHistory')}</span>
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
      </div>
    </div>
  {/each}
</div>