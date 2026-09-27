<script lang="ts">
  /**
   * NumberTicker — animated count-up for KPI values (more-shadcn pattern,
   * Svelte port). Duration is proportional to the travelled distance via
   * `speed` (value-units per second), so small numbers don't flash and
   * large numbers get a visible count-up. `prefix`/`suffix` (UoM) stay
   * attached to the number.
   */
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { cn } from '$lib/utils.js';
  import type { HTMLAttributes } from 'svelte/elements';

  const MIN_DURATION_MS = 800;

  let {
    value = 0,
    decimals = 0,
    prefix = '',
    suffix = '',
    /** Value-units per second — duration = distance / speed (min 800ms). */
    speed = 100,
    class: className,
    ...rest
  }: {
    value?: number;
    decimals?: number;
    /** Static text before the number (e.g. "≥"). */
    prefix?: string;
    /** Unit of measure attached to the number (e.g. " GB/s"). */
    suffix?: string;
    /** Value-units per second — duration = distance / speed (min 800ms). */
    speed?: number;
  } & HTMLAttributes<HTMLSpanElement> = $props();

  const displayed = new Tween(0, {
    easing: cubicOut,
    duration: (from, to) =>
      Math.max(MIN_DURATION_MS, (Math.abs(to - from) / Math.max(speed, 1e-6)) * 1000),
  });

  $effect(() => {
    displayed.set(value ?? 0);
  });
</script>

<span class={cn('tabular-nums', className)} {...rest}>
  {prefix}{displayed.current.toFixed(decimals)}{suffix}
</span>
