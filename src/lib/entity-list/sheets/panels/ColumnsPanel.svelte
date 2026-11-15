<script lang="ts">
  import { Checkbox, checkboxVisualOnlyClass, DynamicIcon } from '@primebrick/ui';
  import * as Sortable from '$lib/components/ui/sortable';

  import { SheetPanelLayout } from '@primebrick/ui';
  import SheetHeaderAction from '$lib/shell/sheets/SheetHeaderAction.svelte';
  import SheetSectionTitle from '$lib/shell/sheets/SheetSectionTitle.svelte';
  import { t } from '$lib/i18n';
  import { Columns3 } from '@primebrick/ui/vendor/lucide';
  import { Eraser } from '@primebrick/ui/vendor/lucide';

  type ColumnLike = { key: string; label_key: string; hideable?: boolean; icon?: string };

  interface Props {
    stickyColumns: ColumnLike[];
    nonAuditingColumns: ColumnLike[];
    auditingColumns: ColumnLike[];
    visibleKeys: string[];
    toggleColumnKey: (key: string) => void;
    onReorderKeys?: (group: 'sticky' | 'data' | 'auditing', keys: string[]) => void;
    onResetColumnVisibility: () => void;
    /** Show every rendered column (always-on stay visible by construction). */
    onSelectAll: () => void;
    /** Restore the declared default visibility (NOT "hide everything"). */
    onDeselectAll: () => void;
  }

  let {
    stickyColumns,
    nonAuditingColumns,
    auditingColumns,
    visibleKeys,
    toggleColumnKey,
    onReorderKeys,
    onResetColumnVisibility,
    onSelectAll,
    onDeselectAll
  }: Props = $props();

  const renderedColumns = $derived([...stickyColumns, ...nonAuditingColumns, ...auditingColumns]);
  const selectedCount = $derived(renderedColumns.filter((c) => visibleKeys.includes(c.key)).length);
  const allSelected = $derived(renderedColumns.length > 0 && selectedCount === renderedColumns.length);
  const someSelected = $derived(selectedCount > 0 && !allSelected);
</script>

{#snippet columnRows(columns: ColumnLike[], group: 'sticky' | 'data' | 'auditing')}
  <Sortable.Root
    items={columns.map((c) => ({ id: c.key, col: c }))}
    onSort={(items) => onReorderKeys?.(group, items.map((i) => i.id))}
  >
    <div role="list" class="flex flex-col">
      {#each columns as col (col.key)}
        <Sortable.Item id={col.key}>
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
                  data-testid="columns-toggle-{col.key}"
                >
                  <span class="pointer-events-none shrink-0" aria-hidden="true">
                    <Checkbox
                      checked={visibleKeys.includes(col.key)}
                      disabled={col.hideable === false}
                      class={checkboxVisualOnlyClass}
                    />
                  </span>
                  <span class="inline-flex size-3.5 shrink-0 items-center justify-center" aria-hidden="true">
                    {#if col.icon}<DynamicIcon name={col.icon} size={14} class="opacity-70" />{/if}
                  </span>
                  <span class="min-w-0 flex-1 truncate">{$t(col.label_key)}</span>
                </button>
          </div>
        </Sortable.Item>
      {/each}
    </div>
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
  {/snippet}
  {#snippet toolbar()}
    <div class="flex items-center gap-2">
      <Checkbox
        checked={allSelected}
        indeterminate={someSelected}
        onCheckedChange={() => (allSelected ? onDeselectAll() : onSelectAll())}
        aria-label={$t('system.entities.list.select_all')}
        data-testid="columns-select-all"
      />
      <button
        type="button"
        class="text-xs font-medium text-muted-foreground select-none"
        onclick={() => (allSelected ? onDeselectAll() : onSelectAll())}
        data-testid="columns-select-all-label"
      >
        {allSelected ? $t('system.entities.list.deselect_all') : $t('system.entities.list.select_all')}
      </button>
      <span class="ml-auto text-xs text-muted-foreground" data-testid="columns-visible-count">
        {selectedCount}/{renderedColumns.length}
      </span>
    </div>
  {/snippet}

  {#if stickyColumns.length > 0}
    <div>
      <SheetSectionTitle>{$t('system.entities.list.sticky_fields')}</SheetSectionTitle>
      {@render columnRows(stickyColumns, 'sticky')}
    </div>
  {/if}

  {#if nonAuditingColumns.length > 0}
    <div>
      <SheetSectionTitle>{$t('system.entities.list.data_fields')}</SheetSectionTitle>
      {@render columnRows(nonAuditingColumns, 'data')}
    </div>
  {/if}

  {#if auditingColumns.length > 0}
    <div>
      <SheetSectionTitle>{$t('system.entities.list.auditing_fields')}</SheetSectionTitle>
      {@render columnRows(auditingColumns, 'auditing')}
    </div>
  {/if}
</SheetPanelLayout>
