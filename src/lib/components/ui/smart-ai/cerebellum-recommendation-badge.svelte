<script lang="ts">
  /**
   * CerebellumRecommendationBadge — small colored chip for a cerebellum
   * `recommendation` value ('RECOMMENDED' | 'NOT_RECOMMENDED').
   *
   * Purely cosmetic: hints which tuning presets are advised for an
   * assistant. Renders nothing for null/undefined — callers don't need
   * an {#if} guard.
   *
   * When `names` is provided (aggregated view, e.g. model defaults), the
   * chip becomes a popover trigger listing the cerebellums that carry
   * this recommendation.
   */
  import * as Popover from '$lib/components/ui/popover/index.js';
  import { t } from '$lib/i18n';
  import CircuitBoard from '@lucide/svelte/icons/circuit-board';
  import ThumbsUp from '@lucide/svelte/icons/thumbs-up';
  import ThumbsDown from '@lucide/svelte/icons/thumbs-down';

  let {
    recommendation,
    names,
    size = 'sm',
  }: {
    recommendation?: 'RECOMMENDED' | 'NOT_RECOMMENDED' | null;
    /** Cerebellum display names carrying this recommendation — shows a popover list. */
    names?: string[];
    /** 'sm' = compact chip (dropdowns/popovers), 'md' = same size as the default-model Badge. */
    size?: 'sm' | 'md';
  } = $props();

  let label = $derived(
    recommendation === 'RECOMMENDED'
      ? $t('app.smart.ai.cerebellum.recommended')
      : $t('app.smart.ai.cerebellum.not_recommended'),
  );

  let chipClass = $derived(
    size === 'md'
      ? 'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold'
      : 'inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium',
  );
  let toneClass = $derived(
    recommendation === 'RECOMMENDED'
      ? size === 'md'
        ? 'border-emerald-400/60 bg-gradient-to-r from-emerald-400/15 to-teal-500/15 text-emerald-700 dark:text-emerald-300'
        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
      : size === 'md'
        ? 'border-amber-400/60 bg-gradient-to-r from-amber-400/15 to-orange-500/15 text-amber-700 dark:text-amber-300'
        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  );
</script>

{#if recommendation}
  {#if names && names.length > 0}
    <Popover.Root>
      <Popover.Trigger
        class="{chipClass} {toneClass} cursor-pointer hover:brightness-110 transition"
        title={label}
      >
        {#if size === 'md'}
          {#if recommendation === 'RECOMMENDED'}
            <ThumbsUp class="size-3" />
          {:else}
            <ThumbsDown class="size-3" />
          {/if}
        {/if}
        {label}
      </Popover.Trigger>
      <Popover.Content align="start" class="w-52 p-2">
        <ul class="space-y-1">
          {#each names as name (name)}
            <li class="flex items-center gap-1.5 text-[11px]">
              <CircuitBoard class="size-3 shrink-0 text-foreground/60" />
              <span class="truncate">{$t(name)}</span>
            </li>
          {/each}
        </ul>
      </Popover.Content>
    </Popover.Root>
  {:else}
    <span class="{chipClass} {toneClass}">
      {#if size === 'md'}
        {#if recommendation === 'RECOMMENDED'}
          <ThumbsUp class="size-3" />
        {:else}
          <ThumbsDown class="size-3" />
        {/if}
      {/if}
      {label}
    </span>
  {/if}
{/if}
