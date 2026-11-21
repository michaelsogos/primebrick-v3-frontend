<script lang="ts">
  /**
   * BulkEditRowsPanel — the stacked drill-down of `entity.bulkEditor`.
   *
   * Lists the rows sharing one field value (distribution chip) or the full
   * selection (mixed read-only fields). Each row renders its uid glyph +
   * a short business-column summary; clicking a row opens the record
   * sheet — the same `entity.record` surface every drill-down uses.
   */
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { SheetPanelLayout, formatListCellValue } from '@primebrick/ui';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { Rows3 } from '@primebrick/ui/vendor/lucide';
  import type { MetaColumn } from '$lib/entity-list/types';

  let {
    entity,
    uid = 'uuid',
    title,
    rows,
    columns,
  }: {
    entity: string;
    uid?: string;
    title: string;
    rows: Record<string, unknown>[];
    columns: MetaColumn[];
  } = $props();

  function openRecord(row: Record<string, unknown>) {
    openSheet(
      'entity.record',
      { entity, value: row[uid] },
      { stack: true },
    );
  }

  function cellValue(col: MetaColumn, row: Record<string, unknown>): string {
    const v = row[col.key];
    if (v === null || v === undefined || v === '') return '—';
    return formatListCellValue(col, v, $uiLang);
  }
</script>

<SheetPanelLayout contentClass="p-4">
  {#snippet icon()}
    <Rows3 class="size-4" />
  {/snippet}
  {#snippet title()}
    {title}
  {/snippet}

  <ul class="divide-y divide-border" data-testid="bulk-edit-rows">
    {#each rows as row (row[uid])}
      <li>
        <button
          type="button"
          class="w-full px-1 py-2 text-left hover:bg-muted/40 rounded"
          onclick={() => openRecord(row)}
          data-testid="bulk-edit-row"
        >
          <span class="block truncate font-mono text-xs text-muted-foreground">{String(row[uid])}</span>
          <span class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {#each columns as col (col.key)}
              <span class="truncate">
                <span class="text-muted-foreground">{$t(col.label_key)}:</span>
                {cellValue(col, row)}
              </span>
            {/each}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</SheetPanelLayout>
