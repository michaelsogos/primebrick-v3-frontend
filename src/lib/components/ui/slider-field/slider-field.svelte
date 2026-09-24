<script lang="ts">
  /**
   * SliderField — nullable range input: slider + reactive value label.
   *
   * Single component for bounded numeric params that may be NULL ("inherit").
   * - value === null → the label shows `defaultValue` (muted/italic = inherited);
   *   the slider sits on that default — one-way: the real value stays null.
   * - Dragging writes whatever value the slider lands on.
   * - The ghost X button clears back to null (inherit).
   * - No text input — the label is the readout and always shows the EFFECTIVE
   *   value, never the word "inherit".
   */
  import Slider, { type SliderTone } from '$lib/components/ui/slider/slider.svelte';
  import { cn } from '$lib/utils.js';
  import { t } from '$lib/i18n';
  import X from '@lucide/svelte/icons/x';

  let {
    value = $bindable<number | null>(null),
    defaultValue,
    min = 0,
    max = 100,
    step = 1,
    /**
     * Discrete value ladder (ascending). When set, the slider moves over
     * indices 0..steps.length-1 and `value` holds the ladder value — for
     * wide/non-linear ranges (e.g. max_tokens 256→32768) where a linear
     * slider is unusable. `min`/`max`/`step` are ignored.
     */
    steps,
    decimals = 0,
    disabled = false,
    tone = 'primary',
    label,
    size = 'default',
    id,
    class: className,
    'data-testid': dataTestId,
  }: {
    value?: number | null;
    /** Effective value shown (and slider position) when `value` is null = inherit. */
    defaultValue?: number;
    min?: number;
    max?: number;
    step?: number;
    steps?: number[];
    /** Decimals shown in the value label. */
    decimals?: number;
    disabled?: boolean;
    /** Semantic gradient of the filled range (same tones as Button). */
    tone?: SliderTone;
    /** Field label rendered above the slider row (component-owned, standard weight). */
    label?: string;
    /**
     * Label density — layout only, never affects colors/gradients:
     * - 'default' (form pages): text-sm font-medium
     * - 'sm' (dense sheets/panels): text-xs font-medium text-muted-foreground
     */
    size?: 'default' | 'sm';
    /** Forwarded to the slider root so external <label for> works. */
    id?: string;
    class?: string;
    'data-testid'?: string;
  } = $props();

  // Effective value: explicit value, else the inherited default, else min
  // (or the first step when a ladder is used).
  let effective = $derived(value ?? defaultValue ?? (steps ? steps[0] : min));
  let inheriting = $derived(value === null);

  // Ladder mode: slider position = index of the closest step.
  let ladderIndex = $derived(
    steps
      ? steps.reduce((best, s, i) => (Math.abs(s - effective) < Math.abs(steps[best] - effective) ? i : best), 0)
      : 0,
  );
  let sliderPos = $derived(steps ? ladderIndex : effective);
  let sliderMin = $derived(steps ? 0 : min);
  let sliderMax = $derived(steps ? steps.length - 1 : max);
  let sliderStep = $derived(steps ? 1 : step);
</script>

<div class={cn(label && 'space-y-1.5')} data-testid={dataTestId}>
  {#if label}
    <label
      for={id}
      class={cn('font-medium', size === 'sm' ? 'text-xs text-muted-foreground' : 'text-sm')}
    >
      {label}
    </label>
  {/if}
  <div class={cn('flex items-center gap-1', className)}>
  <Slider
    value={sliderPos}
    min={sliderMin}
    max={sliderMax}
    step={sliderStep}
    {disabled}
    {tone}
    {id}
    class="flex-1"
    onValueChange={(v: number) => (value = steps ? steps[v] : v)}
    data-testid={dataTestId ? `${dataTestId}-slider` : undefined}
  />
  <span
    class={cn(
      'w-10 shrink-0 text-center font-mono text-xs font-medium',
      inheriting && 'italic text-muted-foreground',
    )}
    title={inheriting ? $t('app.common.inherit') : undefined}
  >
    {effective.toFixed(decimals)}
  </span>
  {#if !inheriting}
    <button
      type="button"
      class="rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      title={$t('app.common.inherit')}
      aria-label={$t('app.common.inherit')}
      onclick={() => (value = null)}
      data-testid={dataTestId ? `${dataTestId}-reset` : undefined}
    >
      <X class="size-3" />
    </button>
  {:else}
    <!-- keep the row width stable when the clear CTA is hidden -->
    <span class="w-3 shrink-0"></span>
  {/if}
  </div>
</div>
