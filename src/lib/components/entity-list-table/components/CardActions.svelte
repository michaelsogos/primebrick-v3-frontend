<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n';
  import { Checkbox, checkboxInteractiveClass } from '@primebrick/ui';
  import { Button } from '@primebrick/ui';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import type { RowCustomAction } from '$lib/entity-list/types';
  import type { EntityRowActions } from '../types';
  import { isCustomActionVisible } from '$lib/entity-list';
  import { cn } from '$lib/utils.js';
  import { MoreVertical } from '@primebrick/ui/vendor/lucide'
  import { Pencil } from '@primebrick/ui/vendor/lucide'
  import { Copy } from '@primebrick/ui/vendor/lucide'
  import { FileClock } from '@primebrick/ui/vendor/lucide'
  import { Eye } from '@primebrick/ui/vendor/lucide'
  import { Trash2 } from '@primebrick/ui/vendor/lucide'
  import { ArrowUpFromLine } from '@primebrick/ui/vendor/lucide';
  import { DynamicIcon, actionColorClass } from '@primebrick/ui';

  let {
    row,
    rowKey,
    rowSelected,
    rowDeleted,
    rowSelectionEnabled,
    actionsEnabled,
    rowActions,
    entityRowActions,
    dropdownMenuRow,
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
    isListMode
  }: {
    row: TRow;
    rowKey: string;
    rowSelected: boolean;
    rowDeleted: boolean;
    rowSelectionEnabled: boolean;
    actionsEnabled: boolean;
    rowActions?: Snippet<[{ row: TRow }]>;
    entityRowActions?: EntityRowActions;
    dropdownMenuRow: TRow | null;
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
    isListMode: boolean;
  } = $props();
</script>

{#if rowSelectionEnabled}
  <div
    class={cn('shrink-0', isListMode && rowSelectionEnabled ? 'ml-auto sm:ml-0' : isListMode ? 'ml-auto' : '')}
    data-pb-card-cta
    role="button"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
    }}
  >
    <Checkbox
      id={`card-select-${rowKey}`}
      value={rowKey}
      class={checkboxInteractiveClass}
      checked={rowSelected}
      onCheckedChange={() => onToggleRowSelect(rowKey)}
      aria-label={$t('system.entities.list.select_row')}
    />
  </div>
{/if}

{#if actionsEnabled}
  <div
    class={cn('shrink-0', rowSelectionEnabled ? 'ml-auto sm:ml-0' : 'ml-auto')}
    data-pb-card-cta
    role="button"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
    }}
  >
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
              aria-label={$t('system.entities.list.row_actions')} 
              title={$t('system.entities.list.row_actions')}
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
            {@const editChrome = entityRowActions?.edit_chrome}
            <DropdownMenu.Item
              onclick={(e) => { e.stopPropagation(); if (rowDeleted) return; onEditRow(row); }}
              class={rowDeleted ? 'opacity-50 cursor-not-allowed pointer-events-none' : actionColorClass(editChrome?.color)}
            >
              <div class="flex items-center gap-2">
                {#if editChrome?.icon}
                  <DynamicIcon name={editChrome.icon} class="size-4" />
                {:else}
                  <Pencil class="size-4" />
                {/if}
                <span>{$t(editChrome?.label_key ?? 'app.common.edit')}</span>
              </div>
            </DropdownMenu.Item>
          {/if}
          {#if entityRowActions?.duplicate !== false}
            <DropdownMenu.Item
              onclick={(e) => { e.stopPropagation(); if (rowDeleted) return; onDuplicateRow(row); }}
              class={rowDeleted ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
            >
              <div class="flex items-center gap-2">
                <Copy class="size-4" />
                <span>{$t('app.common.duplicate')}</span>
              </div>
            </DropdownMenu.Item>
          {/if}
          {#if entityRowActions?.custom_actions && handleCustomAction}
            {#each entityRowActions.custom_actions.filter((a) => isCustomActionVisible(a, row)) as action (action.action_name)}
              {@const isDisabled = action.disabled_when_deleted && rowDeleted}
              <DropdownMenu.Item
                onclick={(e) => { e.stopPropagation(); if (isDisabled) return; handleCustomAction(action, row); }}
                class={isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : actionColorClass(action.color)}
              >
                <div class="flex items-center gap-2">
                  {#if action.icon}<DynamicIcon name={action.icon} size={16} />{/if}
                  <span>{$t(action.translation_key)}</span>
                </div>
              </DropdownMenu.Item>
            {/each}
          {/if}
          {#if rowDeleted ? entityRowActions?.restore !== false : entityRowActions?.delete !== false}
            {#if rowDeleted}
              {@const chrome = entityRowActions?.restore_chrome}
              <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); onRestoreRow(row); }} class={actionColorClass(chrome?.color) || 'text-warning'}>
                <div class="flex items-center gap-2">
                  {#if chrome?.icon}
                    <DynamicIcon name={chrome.icon} class="size-4" />
                  {:else}
                    <span class="relative flex items-center justify-center">
                      <Trash2 class="size-4" />
                      <ArrowUpFromLine class="absolute -bottom-[1px] size-3" />
                    </span>
                  {/if}
                  <span>{$t(chrome?.label_key ?? 'app.common.restore')}</span>
                </div>
              </DropdownMenu.Item>
            {:else}
              {@const chrome = entityRowActions?.delete_chrome}
              <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); onDeleteRow(row); }} class={actionColorClass(chrome?.color) || 'text-destructive'}>
                <div class="flex items-center gap-2">
                  {#if chrome?.icon}
                    <DynamicIcon name={chrome.icon} class="size-4" />
                  {:else}
                    <Trash2 class="size-4" />
                  {/if}
                  <span>{$t(chrome?.label_key ?? 'app.common.delete')}</span>
                </div>
              </DropdownMenu.Item>
            {/if}
          {/if}
          {#if entityRowActions?.versionHistory !== false || entityRowActions?.preview !== false}
            <DropdownMenu.Separator />
            {#if entityRowActions?.versionHistory !== false}
              <DropdownMenu.Item
                onclick={(e) => { e.stopPropagation(); onLoadVersionHistory(row); }}
              >
                <div class="flex items-center gap-2">
                  <FileClock class="size-4" />
                  <span>{$t('app.common.version_history')}</span>
                </div>
              </DropdownMenu.Item>
            {/if}
            {#if entityRowActions?.preview !== false}
              <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); onPreviewRow(row); }}>
                <div class="flex items-center gap-2">
                  <Eye class="size-4" />
                  <span>{$t('system.entities.list.preview')}</span>
                </div>
              </DropdownMenu.Item>
            {/if}
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  </div>
{/if}
