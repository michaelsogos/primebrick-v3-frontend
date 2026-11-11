<script lang="ts">
  /**
   * EntityRecordSheetBody — the loaded record surface. Lives in its own
   * component so the TableCell-facing contexts (`meta.uid`, `entities_ns`,
   * audit columns) are set at init — `setContext` cannot run after the
   * async meta fetch inside the parent.
   */
  import { t } from '$lib/i18n';
  import TableCell from '$lib/components/entity-list-table/table/TableCell.svelte';
  import {
    setAuditColumnsContext,
    setEntitiesNsContext,
    setMetaUidContext,
  } from '$lib/components/entity-list-table/context';
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

  // Contexts must be set at init (setContext cannot run later); the body
  // mounts only after meta+record loaded, so these prop reads are
  // genuinely static — the snapshot is the contract.
  // svelte-ignore state_referenced_locally
  setMetaUidContext(meta.uid ?? 'uuid');
  // svelte-ignore state_referenced_locally
  setEntitiesNsContext(meta.entities_ns ?? 'system');
  // svelte-ignore state_referenced_locally
  setAuditColumnsContext(meta.columns.filter((c) => c.audited));

  const columns = $derived((meta?.columns ?? []).filter((c) => !c.hidden));

  function placementStyle(p: FormFieldPlacement): string {
    const parts: string[] = [];
    if (p.col) parts.push(`grid-column-start:${p.col}`);
    if (p.span) parts.push(`grid-column-end:span ${p.span}`);
    if (p.row) parts.push(`grid-row-start:${p.row}`);
    if (p.row_span) parts.push(`grid-row-end:span ${p.row_span}`);
    return parts.join(';');
  }
</script>

{#if formPlacements.length}
  <div class="grid gap-4 {formTwoCol ? 'grid-cols-2' : 'grid-cols-1'}">
    {#each formPlacements as { col, p } (col.key)}
      <div class="flex min-w-0 flex-col gap-1" style={placementStyle(p)}>
        <span class="text-xs font-medium text-muted-foreground">{$t(col.label_key)}</span>
        <TableCell row={record} column={col} datetimeIanaModeByKey={{}} />
      </div>
    {/each}
  </div>
{:else}
  <div class="grid grid-cols-1 gap-3">
    {#each columns as col (col.key)}
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-xs font-medium text-muted-foreground">{$t(col.label_key)}</span>
        <TableCell row={record} column={col} datetimeIanaModeByKey={{}} />
      </div>
    {/each}
  </div>
{/if}
