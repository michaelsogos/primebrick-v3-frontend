<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as Sheet from '$lib/components/ui/sheet';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import XIcon from '@lucide/svelte/icons/x';
  import { RotateCcw } from 'lucide-svelte';

  type ColumnLike = { key: string; labelKey: string; hideable?: boolean };

  interface $$Props {
    stickyColumns: ColumnLike[];
    nonAuditingColumns: ColumnLike[];
    auditingColumns: ColumnLike[];
    visibleKeys: string[];
    toggleColumnKey: (key: string) => void;
    onResetColumnVisibility: () => void;
    sheetMenuCheckboxClass: string;
    t: (key: string) => string;
  }

  let {
    stickyColumns,
    nonAuditingColumns,
    auditingColumns,
    visibleKeys,
    toggleColumnKey,
    onResetColumnVisibility,
    sheetMenuCheckboxClass,
    t
  }: $$Props = $props();
</script>

{#snippet headerTitle()}
  {t('entities.list.columns')}
{/snippet}

{#snippet headerActions()}
  <Button
    variant="ghost"
    size="icon-sm"
    class="text-muted-foreground opacity-70 hover:bg-accent hover:text-accent-foreground hover:opacity-100"
    onclick={() => onResetColumnVisibility()}
    title={t('common.reset')}
  >
    <RotateCcw class="size-4" />
  </Button>
  <Sheet.Close
    class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    title={t('common.done')}
    onclick={() => closeSheet()}
  >
    <XIcon class="size-4" />
  </Sheet.Close>
{/snippet}

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <div class="min-h-0 flex-1 overflow-auto px-2 py-2">
    {#if stickyColumns.length > 0}
      <div class="my-2 px-2">
        <div class="flex items-center gap-2">
          <div class="h-px flex-1 bg-border"></div>
          <div class="text-xs font-medium text-muted-foreground">{t('entities.list.stickyFields')}</div>
          <div class="h-px flex-1 bg-border"></div>
        </div>
      </div>

      {#each stickyColumns as col (col.key)}
        <button
          type="button"
          disabled={col.hideable === false}
          class={col.hideable === false
            ? 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm opacity-60 hover:bg-accent disabled:cursor-not-allowed'
            : 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent'}
          onclick={() => toggleColumnKey(col.key)}
        >
          <span class="pointer-events-none shrink-0" aria-hidden="true">
            <Checkbox
              checked={visibleKeys.includes(col.key)}
              disabled={col.hideable === false}
              class={sheetMenuCheckboxClass}
            />
          </span>
          <span class="min-w-0 flex-1 truncate">{t(col.labelKey)}</span>
        </button>
      {/each}
    {/if}

    {#if nonAuditingColumns.length > 0}
      <div class="my-2 px-2">
        <div class="flex items-center gap-2">
          <div class="h-px flex-1 bg-border"></div>
          <div class="text-xs font-medium text-muted-foreground">{t('entities.list.dataFields')}</div>
          <div class="h-px flex-1 bg-border"></div>
        </div>
      </div>

      {#each nonAuditingColumns as col (col.key)}
        <button
          type="button"
          disabled={col.hideable === false}
          class={col.hideable === false
            ? 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm opacity-60 hover:bg-accent disabled:cursor-not-allowed'
            : 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent'}
          onclick={() => toggleColumnKey(col.key)}
        >
          <span class="pointer-events-none shrink-0" aria-hidden="true">
            <Checkbox
              checked={visibleKeys.includes(col.key)}
              disabled={col.hideable === false}
              class={sheetMenuCheckboxClass}
            />
          </span>
          <span class="min-w-0 flex-1 truncate">{t(col.labelKey)}</span>
        </button>
      {/each}
    {/if}

    {#if auditingColumns.length > 0}
      <div class="my-2 px-2">
        <div class="flex items-center gap-2">
          <div class="h-px flex-1 bg-border"></div>
          <div class="text-xs font-medium text-muted-foreground">{t('entities.list.auditingFields')}</div>
          <div class="h-px flex-1 bg-border"></div>
        </div>
      </div>

      {#each auditingColumns as col (col.key)}
        <button
          type="button"
          disabled={col.hideable === false}
          class={col.hideable === false
            ? 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm opacity-60 hover:bg-accent disabled:cursor-not-allowed'
            : 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent'}
          onclick={() => toggleColumnKey(col.key)}
        >
          <span class="pointer-events-none shrink-0" aria-hidden="true">
            <Checkbox
              checked={visibleKeys.includes(col.key)}
              disabled={col.hideable === false}
              class={sheetMenuCheckboxClass}
            />
          </span>
          <span class="min-w-0 flex-1 truncate">{t(col.labelKey)}</span>
        </button>
      {/each}
    {/if}
  </div>
</div>

