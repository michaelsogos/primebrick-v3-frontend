<script lang="ts">
  /**
   * MapperViewerPanel — read-only prose view of a DST mapper document
   * (VIEWER archetype). Opened by the mapper cell's "View map" CTA via
   * `openSheet('entity.mapperViewer', { value, entity, row, column_key,
   * title })`. Rows mirror the form builder's anatomy without inputs —
   * rendering lives in `PayloadMapViewer` (@primebrick/ui); the DST
   * contract (`PayloadMapEntry` vocabulary in @primebrick/core) is the
   * reuse axis for every mapper adopting it.
   *
   * The panel self-resolves the target callable's `payload_schema` from
   * the census (`row.target_subject`) so required markers, type icons
   * and the unmapped-fields accordion match the builder exactly.
   */
  import { SheetPanelLayout, PayloadMapViewer } from '@primebrick/ui';
  import { Waypoints } from '@primebrick/ui/vendor/lucide';
  import { t } from '$lib/i18n';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { useCensusSubjectOptions } from '$lib/entity-form/use-census-subject-options.svelte';
  import { toDisplayString } from '@primebrick/ui';

  let {
    value,
    row,
    title,
  }: {
    /** The cell's parsed DST document (string JSON — the editor contract). */
    value: unknown;
    /** The owning wire row — `target_subject` resolves the callable. */
    row?: Record<string, unknown>;
    /** Resolved sheet title — the cell passes the column's label. */
    title?: string;
  } = $props();

  const census = useCensusSubjectOptions(() => shellNav.modules);

  const targetCallable = $derived(
    row?.target_subject
      ? census.callableDecls.find((c) => c.subject === row.target_subject)
      : undefined,
  );

  /** Viewer prop contract is the raw JSON text (same bind the editor owns). */
  const mapText = $derived(
    typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2),
  );
</script>

<SheetPanelLayout>
  {#snippet icon()}
    <Waypoints class="size-4" />
  {/snippet}
  {#snippet title()}
    {title ?? $t('app.widgets.mapper.title')}
  {/snippet}

  <div class="h-full overflow-auto p-3">
    <PayloadMapViewer value={mapText} target_schema={targetCallable?.payload_schema} />
  </div>
</SheetPanelLayout>
