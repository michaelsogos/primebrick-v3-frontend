<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { TableCell } from '../table';
  import type { MetaColumn } from '$lib/entity-list/types';

  type CellArgs = { row: TRow; column: MetaColumn };

  let {
    row,
    column,
    cell,
    datetimeIanaModeByKey,
    datetimeIanaRenderTick
  }: {
    row: TRow;
    column: MetaColumn;
    cell?: Snippet<[CellArgs]>;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick: number;
  } = $props();
</script>

{#if cell}
  {@render cell({ row, column })}
{:else}
  <TableCell row={row} column={column} datetimeIanaModeByKey={datetimeIanaModeByKey} datetimeIanaRenderTick={datetimeIanaRenderTick} />
{/if}
