<script lang="ts">
  /**
   * EntityRecordSheetBody — the loaded record surface: the entity's FORM
   * rendered read-only, so the pencil toggle can later flip the same
   * widgets to edit mode.
   *
   * The per-field anatomy is `EntityFormField` — the SAME component
   * `EntityFormPage` mounts inside its FormField/FormControl wrappers.
   * No widget switch is re-implemented here: boolean → SwitchField,
   * `type:"color"` → ColorSelector, `type:"ref"` → entity combo, etc.
   * all resolve through the shared dispatcher.
   *
   * Layout: `page_props.form` placements (order + col/row/row_span grid)
   * when the entity declares a form-bearing route; else the fallback —
   * every served `meta.columns` in declared order, single column.
   */
  import EntityFormField from '$lib/entity-form/EntityFormField.svelte';
  import { useCensusSubjectOptions } from '$lib/entity-form/use-census-subject-options.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
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

  /** Same census vocabulary the form page feeds the dispatcher —
   *  `census.emits`/`census.callables` columns get their options here
   *  too, never a second mapping. */
  const census = useCensusSubjectOptions(() => shellNav.modules);
  const columnsMap = $derived.by<ReadonlyMap<string, MetaColumn>>(() => {
    const m = new Map<string, MetaColumn>();
    for (const c of meta?.columns ?? []) m.set(c.key, c);
    return m;
  });

  /** Readonly sheet — fields never write back; the dispatcher still
   *  needs bindable value/record refs for its internal prop passing. */
  let draft = $state<Record<string, unknown>>({});
  $effect(() => {
    draft = { ...record };
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

{#snippet field(col: MetaColumn, p?: FormFieldPlacement)}
  <div class="space-y-2" style={p ? placementStyle(p) : undefined}>
    <EntityFormField
      column={col}
      placement={p}
      columns={columnsMap}
      controlProps={{ id: `record-sheet-field-${col.key}` }}
      emitsOptions={census.emitsOptions}
      callablesOptions={census.callablesOptions}
      readonly
      bind:value={draft[col.key]}
      record={draft}
    />
  </div>
{/snippet}

{#if formPlacements.length}
  <div class="grid gap-4 {formTwoCol ? 'grid-cols-2' : 'grid-cols-1'}">
    {#each formPlacements as { col, p } (col.key)}
      {@render field(col, p)}
    {/each}
  </div>
{:else}
  <div class="grid grid-cols-1 gap-3">
    {#each columns as col (col.key)}
      {@render field(col)}
    {/each}
  </div>
{/if}
