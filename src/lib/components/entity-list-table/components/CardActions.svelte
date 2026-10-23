<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n';
  import { Checkbox, checkboxInteractiveClass } from '@primebrick/ui';
  import { Button } from '@primebrick/ui';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { cn } from '$lib/utils.js';
  import { MoreVertical } from '@primebrick/ui/vendor/lucide'
  import { Pencil } from '@primebrick/ui/vendor/lucide'
  import { Copy } from '@primebrick/ui/vendor/lucide'
  import { FileClock } from '@primebrick/ui/vendor/lucide'
  import { Eye } from '@primebrick/ui/vendor/lucide'
  import { Trash2 } from '@primebrick/ui/vendor/lucide'
  import { ArrowUpFromLine } from '@primebrick/ui/vendor/lucide';
  import { DynamicIcon } from '@primebrick/ui';

  let {
    row,
    rowKey,
    rowSelected,
    rowDeleted,
    rowSelectionEnabled,
    actionsEnabled,
    selectedKeys,
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
    selectedKeys: string[];
    rowActions?: Snippet<[{ row: TRow }]>;
    entityRowActions?: {
      edit?: boolean;
      duplicate?: boolean;
      preview?: boolean;
      delete?: boolean;
      restore?: boolean;
      versionHistory?: boolean;
      custom_actions?: Array<{
        action_name: string;
        translation_key: string;
        icon: string;
        text_color?: string;
        disabled_when_deleted?: boolean;
        required_permission?: string | string[];
      }>;
    };
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
    handleCustomAction?: (action: { action_name: string; translation_key: string }, row: TRow) => void;
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
      aria-label={$t('system.entities.list.selectRow')}
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
              aria-label={$t('system.entities.list.rowActions')} 
              title={$t('system.entities.list.rowActions')}
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
              onclick={(e) => { e.stopPropagation(); if (rowDeleted) return; onEditRow(row); }}
              class={rowDeleted ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
            >
              <div class="flex items-center gap-2">
                <Pencil class="size-4 opacity-70" />
                <span>{$t('app.common.edit')}</span>
              </div>
            </DropdownMenu.Item>
          {/if}
          {#if entityRowActions?.duplicate !== false}
            <DropdownMenu.Item
              onclick={(e) => { e.stopPropagation(); if (rowDeleted) return; onDuplicateRow(row); }}
              class={rowDeleted ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
            >
              <div class="flex items-center gap-2">
                <Copy class="size-4 opacity-70" />
                <span>{$t('app.common.duplicate')}</span>
              </div>
            </DropdownMenu.Item>
          {/if}
          {#if entityRowActions?.versionHistory !== false}
            <DropdownMenu.Item
              onclick={(e) => { e.stopPropagation(); onLoadVersionHistory(row); }}
            >
              <div class="flex items-center gap-2">
                <FileClock class="size-4 opacity-70" />
                <span>{$t('app.common.versionHistory')}</span>
              </div>
            </DropdownMenu.Item>
          {/if}
          {#if entityRowActions?.preview !== false}
            <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); onPreviewRow(row); }}>
              <div class="flex items-center gap-2">
                <Eye class="size-4 opacity-70" />
                <span>{$t('system.entities.list.preview')}</span>
              </div>
            </DropdownMenu.Item>
          {/if}
          {#if entityRowActions?.custom_actions && handleCustomAction}
            {#each entityRowActions.custom_actions as action}
              {@const isDisabled = action.disabled_when_deleted && rowDeleted}
              <DropdownMenu.Item
                onclick={(e) => { e.stopPropagation(); if (isDisabled) return; handleCustomAction(action, row); }}
                class={isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : (action.text_color ?? '')}
              >
                <div class="flex items-center gap-2">
                  <DynamicIcon name={action.icon} size={16} class="opacity-70" />
                  <span>{$t(action.translation_key)}</span>
                </div>
              </DropdownMenu.Item>
            {/each}
          {/if}
          {#if rowDeleted ? entityRowActions?.restore !== false : entityRowActions?.delete !== false}
            <DropdownMenu.Separator />
            {#if rowDeleted}
              <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); onRestoreRow(row); }} class="text-warning">
                <div class="flex items-center gap-2">
                  <span class="relative flex items-center justify-center">
                    <Trash2 class="size-4 text-warning/70" />
                    <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                  </span>
                  <span>{$t('app.common.restore')}</span>
                </div>
              </DropdownMenu.Item>
            {:else}
              <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); onDeleteRow(row); }} class="text-destructive">
                <div class="flex items-center gap-2">
                  <Trash2 class="size-4 text-destructive/70" />
                  <span>{$t('app.common.delete')}</span>
                </div>
              </DropdownMenu.Item>
            {/if}
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  </div>
{/if}
