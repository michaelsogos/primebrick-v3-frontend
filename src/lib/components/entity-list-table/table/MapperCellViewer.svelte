<script lang="ts">
  /**
   * MapperCellViewer — `format:"json"` cell on a mapper-widget column
   * (`widget:"payload_map"`, DST contract). Same `CellAffordance` anatomy
   * as the ref default-link cell: text opens the `entity.mapperViewer`
   * sheet (read-only prose rows mirroring the form builder); the trailing
   * ExternalLink navigates `_blank` to the record's `kind:"detail"`
   * census route — hidden when the entity declares none.
   */
  import { t } from '$lib/i18n';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { ExternalLink } from '@primebrick/ui/vendor/lucide';
  import CellAffordance from './CellAffordance.svelte';
  import type { MetaColumn } from '$lib/entity-list/types';

  let {
    value,
    column,
    row,
    detailHref,
  }: {
    /** The cell's parsed DST document. */
    value: unknown;
    /** The owning column — `label_key` is the sheet title. */
    column: MetaColumn;
    /** The owning wire row — `target_subject` resolves the callable schema. */
    row: Record<string, unknown>;
    /** Resolved `kind:"detail"` href for this row — absent → no trailing CTA. */
    detailHref?: string | null;
  } = $props();
</script>

<CellAffordance
  text={$t('app.widgets.mapper.view')}
  ontextclick={() =>
    openSheet('entity.mapperViewer', { value, row, title: $t(column.label_key) })}
  href={detailHref ?? undefined}
  icon_title={$t('app.common.open_in_new_tab')}
  test_id={`mapper-cell-${column.key}`}
>
  {#snippet icon()}
    <ExternalLink class="size-3.5" />
  {/snippet}
</CellAffordance>
