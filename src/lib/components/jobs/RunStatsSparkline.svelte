<script lang="ts">
  /**
   * RunStatsSparkline — Kestra-style per-row execution histogram.
   *
   * Renders stacked bars: succeeded (green) on bottom, failed (red),
   * skipped (amber) stacked on top. Y axis is free (auto-scaled to the
   * max bucket total); X bucket labels come from `bucket_unit` returned
   * by the job-run-stats action (hour|day|week|month).
   *
   * Fed from row.__run_stats injected by the jobs page after loading the
   * schedule list — the `run_stats` column is meta-virtual (no DB column).
   */

  export interface RunStatsBucket {
    bucket_start: string;
    succeeded: number;
    failed: number;
    skipped: number;
  }

  let {
    buckets,
    bucketUnit
  }: {
    buckets: RunStatsBucket[] | undefined;
    bucketUnit?: string;
  } = $props();

  const W = 120;
  const H = 28;
  const PAD = 1;
  const BAR_W = $derived(
    buckets && buckets.length > 0 ? Math.max(2, Math.floor((W - PAD * (buckets.length + 1)) / buckets.length)) : 3
  );
  const maxTotal = $derived(
    buckets ? Math.max(1, ...buckets.map((b) => b.succeeded + b.failed + b.skipped)) : 1
  );

  function barX(i: number): number {
    return PAD + i * (BAR_W + PAD);
  }
  function h(v: number): number {
    return Math.round((v / maxTotal) * (H - 4));
  }
  function bucketLabel(b: RunStatsBucket): string {
    const d = new Date(b.bucket_start);
    if (bucketUnit === 'hour') return d.toISOString().slice(5, 13).replace('T', ' ');
    if (bucketUnit === 'month') return d.toISOString().slice(0, 7);
    return d.toISOString().slice(5, 10);
  }
</script>

{#if buckets && buckets.length > 0}
  <svg
    viewBox="0 0 {W} {H}"
    class="block h-7 w-[120px]"
    role="img"
    aria-label="run statistics"
  >
    {#each buckets as b, i}
      {@const x = barX(i)}
      {@const hs = h(b.succeeded)}
      {@const hf = h(b.failed)}
      {@const hk = h(b.skipped)}
      {#if hk > 0}
        <rect {x} y={H - hk} width={BAR_W} height={hk} class="fill-amber-400" rx="0.5">
          <title>{bucketLabel(b)}: {b.skipped} skipped</title>
        </rect>
      {/if}
      {#if hf > 0}
        <rect {x} y={H - hk - hf} width={BAR_W} height={hf} class="fill-red-500" rx="0.5">
          <title>{bucketLabel(b)}: {b.failed} failed</title>
        </rect>
      {/if}
      {#if hs > 0}
        <rect {x} y={H - hk - hf - hs} width={BAR_W} height={hs} class="fill-emerald-500" rx="0.5">
          <title>{bucketLabel(b)}: {b.succeeded} succeeded</title>
        </rect>
      {/if}
    {/each}
  </svg>
{:else}
  <span class="text-muted-foreground text-xs">—</span>
{/if}
