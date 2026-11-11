<script lang="ts">
  /**
   * EntityRecordSheetBody — the loaded record surface: the entity's FORM
   * rendered read-only, so the pencil toggle can later flip the same
   * widgets to edit mode.
   *
   * Field anatomy mirrors EntityFormPage: booleans render via
   * `SwitchField` (they never reach the dispatcher); every other column
   * resolves its form control through `FormFieldDispatcher` with
   * `readonly` — same widget the form uses, never a display-only cell.
   *
   * Layout: `page_props.form` placements (order + col/row/row_span grid)
   * when the entity declares a form-bearing route; else the fallback —
   * every served `meta.columns` in declared order, single column.
   */
  import { t } from '$lib/i18n';
  import { SwitchField } from '@primebrick/ui';
  import FormFieldDispatcher from '$lib/entity-form/FormFieldDispatcher.svelte';
  import type { MetaColumn, EntityMeta } from '$lib/entity-list/types';
  import type { FormFieldPlacement } from '@primebrick/ui';

  let {
    meta,
    record,
    formPlacements,
    formTwoCol,
  }: {
    meta: EntityMeta;
    record: Record<string, unknown>;
    /** Declared `page_props.form` layout resolved to served columns;
     *  empty → fallback (all served columns in order). */
    formPlacements: { col: MetaColumn; p: FormFieldPlacement }[];
    formTwoCol: boolean;
  } = $props();

  const columns = $derived((meta?.columns ?? []).filter((c) => !c.hidden));
  const columnsMap = $derived.by<ReadonlyMap<string, MetaColumn>>(() => {
    const m = new Map<string, MetaColumn>();
    for (const c of meta?.columns ?? []) m.set(c.key, c);
    return m;
  });

  function placementStyle(p: FormFieldPlacement): string {
    const parts: string[] = [];
    if (p.col) parts.push(`grid-column-start:${p.col}`);
    if (p.span) parts.push(`grid-column-end:span ${p.span}`);
    if (p.row) parts.push(`grid-row-start:${p.row}`);
    if (p.row_span) parts.push(`grid-row-end:span ${p.row_span}`);
    return parts.join(';');
  }
</script>

{#snippet field(col: MetaColumn, style?: string)}
  {#if col.type === 'boolean' || col.pg_type === 'boolean'}
    <!-- Same split as EntityFormPage: booleans never reach the
         dispatcher — SwitchField is the canonical anatomy. -->
    <div style={style}>
      <SwitchField label={$t(col.label_key)} checked={record?.[col.key] === true} disabled />
    </div>
  {:else}
    <div class="flex min-w-0 flex-col gap-1" style={style}>
      <span class="text-xs font-medium text-muted-foreground">{$t(col.label_key)}</span>
      <FormFieldDispatcher
        column={col}
        bind:value={() => record?.[col.key], () => {}}
        record={record ?? {}}
        columns={columnsMap}
        readonly
      />
    </div>
  {/if}
{/snippet}

{#if formPlacements.length}
  <div class="grid gap-4 {formTwoCol ? 'grid-cols-2' : 'grid-cols-1'}">
    {#each formPlacements as { col, p } (col.key)}
      {@render field(col, placementStyle(p))}
    {/each}
  </div>
{:else}
  <div class="grid grid-cols-1 gap-3">
    {#each columns as col (col.key)}
      {@render field(col)}
    {/each}
  </div>
{/if}
