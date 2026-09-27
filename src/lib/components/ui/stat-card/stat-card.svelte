<script lang="ts">
  /**
   * StatCard — standard KPI stat (more-shadcn "dashboard stats" pattern).
   *
   * - `card` (default true): bordered card shell. The icon lives in its own
   *   right-hand column spanning the card height — nothing renders below it.
   *   When false the metric is bare — icon moves to the left of the title
   *   and the block shrinks.
   * - Sizing is content-driven: `w-fit` + min/max bounds, so stats sit next
   *   to siblings in a flex row without forcing full-width fill. In dense
   *   dashboards the caller's grid/flex controls the layout instead.
   * - Color comes from the caller (`class` on the root) — icon and value
   *   inherit it, the title stays muted.
   */
  import { NumberTicker } from '$lib/components/ui/number-ticker';
  import { cn } from '$lib/utils.js';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    label,
    value = 0,
    decimals = 0,
    prefix = '',
    suffix = '',
    speed,
    card = true,
    sub,
    icon,
    class: className,
    ...rest
  }: {
    /** Metric label — muted, normal case, above the value. */
    label: string;
    value?: number;
    decimals?: number;
    prefix?: string;
    /** Unit of measure attached to the value (e.g. " GB/s"). */
    suffix?: string;
    /** Value-units per second forwarded to NumberTicker. */
    speed?: number;
    /** Bordered card shell; false = bare stat, icon left of the title. */
    card?: boolean;
    /** Optional line under the value (delta, hint, ...). */
    sub?: string;
    icon?: Snippet;
  } & HTMLAttributes<HTMLDivElement> = $props();
</script>

{#if card}
  <div
    class={cn(
      'w-fit min-w-[9rem] max-w-[13rem] rounded-lg border border-border/60 bg-card p-3',
      className
    )}
    {...rest}
  >
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <span class="block truncate text-xs font-medium text-muted-foreground">{label}</span>
        <NumberTicker {value} {decimals} {prefix} {suffix} {speed} class="mt-2.5 text-xl font-semibold" />
        {#if sub}
          <span class="mt-0.5 block truncate text-[11px] text-muted-foreground">{sub}</span>
        {/if}
      </div>
      <div class="flex w-4 shrink-0 justify-end">{@render icon?.()}</div>
    </div>
  </div>
{:else}
  <div class={cn('w-fit min-w-[5rem] max-w-[9rem]', className)} {...rest}>
    <div class="flex items-center gap-1.5">
      {@render icon?.()}
      <span class="truncate text-xs font-medium text-muted-foreground">{label}</span>
    </div>
    <NumberTicker {value} {decimals} {prefix} {suffix} {speed} class="mt-2.5 text-xl font-semibold" />
    {#if sub}
      <span class="mt-0.5 block truncate text-[11px] text-muted-foreground">{sub}</span>
    {/if}
  </div>
{/if}
