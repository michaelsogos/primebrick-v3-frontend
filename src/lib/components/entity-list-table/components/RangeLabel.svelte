<script lang="ts">
  /** RangeLabel — the `start-end / total` readout (0 for an empty set). */
  let {
    start,
    end,
    total,
    test_id
  }: {
    start: number;
    end: number;
    total: number;
    test_id?: string;
  } = $props();
</script>

<div class="text-muted-foreground" data-testid={test_id}>
  {#if total === 0}
    0
  {:else}
    {start}-{end} / {total}
  {/if}
</div>
