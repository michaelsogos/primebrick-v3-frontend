<script lang="ts">
  /**
   * RankMeter — compact score indicator for AI model rows.
   *
   * Shows the numeric score (1 decimal) above a thick horizontal bar
   * filled proportionally to score/5, colored by a continuous
   * red→green interpolation (see rankColor in ai-model-test-scores).
   * All metrics (rank, speed, quality, power) share the 0-5 scale.
   *
   * `label` renders a tiny metric tag before the score.
   * `score_below` puts the score under the bar — used when two meters
   * are stacked so the bars sit adjacent in the middle.
   */
  import { rankColor } from '$lib/ai/ai-model-test-scores';

  let {
    rank,
    label,
    score_below = false,
  }: {
    rank: number | null | undefined;
    label?: string;
    score_below?: boolean;
  } = $props();

  const pct = $derived(rank != null && rank > 0 ? Math.min(100, (rank / 5) * 100) : 0);
</script>

<div class="flex shrink-0 flex-col gap-[3px] {label ? 'w-16' : 'w-12'}" data-testid="rank-meter">
  {#if !score_below}
    {@render score_row()}
  {/if}
  <div class="h-[3px] w-full rounded-full bg-muted-foreground/20">
    <div
      class="h-full rounded-full transition-all"
      style="width: {pct}%; background: {rankColor(rank)};"
    ></div>
  </div>
  {#if score_below}
    {@render score_row()}
  {/if}
</div>

{#snippet score_row()}
  <div class="flex items-baseline gap-1 leading-none">
    {#if label}
      <span class="truncate text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</span>
    {/if}
    <span class="ml-auto text-[10px] font-medium tabular-nums text-foreground/80">
      {rank != null && rank > 0 ? rank.toFixed(1) : '—'}
    </span>
  </div>
{/snippet}
