<script lang="ts">
  /**
   * CerebellumRecommendationBadge — small colored chip for a cerebellum
   * `recommendation` value ('RECOMMENDED' | 'NOT_RECOMMENDED').
   *
   * Purely cosmetic: hints which tuning presets are advised for an
   * assistant. Renders nothing for null/undefined — callers don't need
   * an {#if} guard.
   */
  import { t } from '$lib/i18n';

  let {
    recommendation,
  }: {
    recommendation?: 'RECOMMENDED' | 'NOT_RECOMMENDED' | null;
  } = $props();
</script>

{#if recommendation === 'RECOMMENDED'}
  <span class="inline-flex shrink-0 items-center rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
    {$t('app.smart.ai.cerebellum.recommended')}
  </span>
{:else if recommendation === 'NOT_RECOMMENDED'}
  <span class="inline-flex shrink-0 items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
    {$t('app.smart.ai.cerebellum.not_recommended')}
  </span>
{/if}
