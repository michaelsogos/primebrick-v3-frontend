<script lang="ts">
  import { Checkbox, checkboxVisualOnlyClass } from '$lib/components/ui/checkbox';
  import * as Sortable from '$lib/components/ui/sortable';
  import * as Sheet from '$lib/components/ui/sheet';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';
  import SheetHeaderAction from '$lib/shell/sheets/SheetHeaderAction.svelte';
  import SheetSectionTitle from '$lib/shell/sheets/SheetSectionTitle.svelte';
  import { t } from '$lib/i18n';
  import Columns3 from '@lucide/svelte/icons/columns-3';
  import XIcon from '@lucide/svelte/icons/x';
  import Eraser from '@lucide/svelte/icons/eraser';

  type ColumnLike = { key: string; label_key: string; hideable?: boolean };

  interface Props {
    stickyColumns: ColumnLike[];
    nonAuditingColumns: ColumnLike[];
    auditingColumns: ColumnLike[];
    visibleKeys: string[];
    toggleColumnKey: (key: string) => void;
    onReorderKeys?: (group: 'sticky' | 'data' | 'auditing', keys: string[]) => void;
    onResetColumnVisibility: () => void;
  }

  let {
    stickyColumns,
    nonAuditingColumns,
    auditingColumns,
    visibleKeys,
    toggleColumnKey,
    onReorderKeys,
    onResetColumnVisibility
  }: Props = $props();
</script>

{#snippet columnRows(columns: ColumnLike[], group: 'sticky' | 'data' | 'auditing')}
  <Sortable.Root
    items={columns.map((c) => ({ id: c.key, col: c }))}
    onSort={(items) => onReorderKeys?.(group, items.map((i) => i.id))}
  >
    {#snippet children()}
      <div role="list" class="flex flex-col">
        {#each columns as col (col.key)}
          <Sortable.Item id={col.key}>
            {#snippet children()}
              <div
                class={col.hideable === false
                  ? 'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm opacity-60 hover:bg-accent'
                  : 'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent'}
              >
                <Sortable.Handle />
                <button
                  type="button"
                  disabled={col.hideable === false}
                  class="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
                  onclick={() => toggleColumnKey(col.key)}
                >
                  <span class="pointer-events-none shrink-0" aria-hidden="true">
                    <Checkbox
                      checked={visibleKeys.includes(col.key)}
                      disabled={col.hideable === false}
                      class={checkboxVisualOnlyClass}
                    />
                  </span>
                  <span class="min-w-0 flex-1 truncate">{$t(col.label_key)}</span>
                </button>
              </div>
            {/snippet}
          </Sortable.Item>
        {/each}
      </div>
    {/snippet}
  </Sortable.Root>
{/snippet}

<SheetPanelLayout contentClass="p-0">
  {#snippet icon()}
    <Columns3 class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('system.entities.list.columns')}
  {/snippet}
  {#snippet actions()}
    <SheetHeaderAction title={$t('app.common.reset')} onclick={() => onResetColumnVisibility()}>
      <Eraser class="size-4" />
    </SheetHeaderAction>
    <Sheet.Close
      class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
      title={$t('app.common.done')}
      onclick={() => closeSheet()}
    >
      <XIcon class="size-4" />
    </Sheet.Close>
  {/snippet}

  {#if stickyColumns.length > 0}
    <div>
      <SheetSectionTitle>{$t('system.entities.list.stickyFields')}</SheetSectionTitle>
      {@render columnRows(stickyColumns, 'sticky')}
    </div>
  {/if}

  {#if nonAuditingColumns.length > 0}
    <div>
      <SheetSectionTitle>{$t('system.entities.list.dataFields')}</SheetSectionTitle>
      {@render columnRows(nonAuditingColumns, 'data')}
    </div>
  {/if}

  {#if auditingColumns.length > 0}
    <div>
      <SheetSectionTitle>{$t('system.entities.list.auditingFields')}</SheetSectionTitle>
      {@render columnRows(auditingColumns, 'auditing')}
    </div>
  {/if}
</SheetPanelLayout>
