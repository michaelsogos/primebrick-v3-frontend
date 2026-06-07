<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { TableCell } from '../table';
  import type { MetaColumn } from '$lib/entity-list/types';
  import type { CellArgs } from '../types';

  type CellRendererArgs = CellArgs<TRow>;

  let {
    row,
    column,
    cell,
    datetimeIanaModeByKey,
    datetimeIanaRenderTick
  }: {
    row: TRow;
    column: MetaColumn;
    cell?: Snippet<[CellRendererArgs]>;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick: number;
  } = $props();
</script>

{#if cell}
  {@render cell({ row, column })}
{:else}
  <TableCell row={row} column={column} datetimeIanaModeByKey={datetimeIanaModeByKey} datetimeIanaRenderTick={datetimeIanaRenderTick} />
{/if}
