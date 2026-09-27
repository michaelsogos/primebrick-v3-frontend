<script lang="ts">
  /**
   * RangeSlider — dual-thumb range input on bits-ui `Slider` type="multiple".
   *
   * Same anatomy/tones as `Slider`, but `value` is `[min, max]` — used for
   * inclusive filters (e.g. rank range 1–5 in the AI model import sheet).
   */
  import { Slider as SliderPrimitive } from 'bits-ui';
  import { cn } from '$lib/utils.js';
  import type { SliderTone } from './slider.svelte';

  const toneRange: Record<SliderTone, string> = {
    primary: 'bg-range-primary-gradient',
    destructive: 'bg-range-destructive-gradient',
    warning: 'bg-range-warning-gradient',
    info: 'bg-range-info-gradient',
    success: 'bg-range-success-gradient',
  };
  const toneTrack: Record<SliderTone, string> = {
    primary: 'bg-primary/20',
    destructive: 'bg-destructive/20',
    warning: 'bg-warning/20',
    info: 'bg-info/20',
    success: 'bg-success/20',
  };
  const toneThumb: Record<SliderTone, string> = {
    primary: 'border-primary/50',
    destructive: 'border-destructive/50',
    warning: 'border-warning/50',
    info: 'border-info/50',
    success: 'border-success/50',
  };

  let {
    value = $bindable<[number, number]>([0, 100]),
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    tone = 'primary',
    class: className,
    ...restProps
  }: {
    value?: [number, number];
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    tone?: SliderTone;
    class?: string;
    [key: string]: unknown;
  } = $props();
</script>

<SliderPrimitive.Root
  type="multiple"
  bind:value
  {min}
  {max}
  {step}
  {disabled}
  class={cn(
    'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50',
    className,
  )}
  {...restProps}
>
  {#snippet children({ thumbs })}
    <span class={cn('relative h-1.5 w-full grow overflow-hidden rounded-full', toneTrack[tone])}>
      <SliderPrimitive.Range class={cn('absolute h-full', toneRange[tone])} />
    </span>
    {#each thumbs as thumb, i (i)}
      <SliderPrimitive.Thumb
        index={i}
        class={cn(
          'block size-4 shrink-0 rounded-full border bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          toneThumb[tone],
        )}
      />
    {/each}
  {/snippet}
</SliderPrimitive.Root>
