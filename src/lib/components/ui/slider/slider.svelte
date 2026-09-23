<script lang="ts">
  /**
   * Slider — single-value range input on bits-ui `Slider`.
   *
   * shadcn-svelte™ anatomy: Root > track (Range fill) + Thumb.
   * `value` is a bindable number; use for bounded numeric ranges
   * (e.g. temperature 0–2 step 0.1).
   */
  import { Slider as SliderPrimitive } from 'bits-ui';
  import { cn } from '$lib/utils.js';

  let {
    value = $bindable(0),
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    class: className,
    ...restProps
  }: {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    class?: string;
    [key: string]: unknown;
  } = $props();
</script>

<SliderPrimitive.Root
  type="single"
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
    <span class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
      <SliderPrimitive.Range class="absolute h-full bg-primary" />
    </span>
    {#each thumbs as thumb, i (i)}
      <SliderPrimitive.Thumb
        index={i}
        class="block size-4 shrink-0 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      />
    {/each}
  {/snippet}
</SliderPrimitive.Root>
