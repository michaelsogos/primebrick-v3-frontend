<script lang="ts">
  /**
   * Toolbar — standard action strip (shadcn bits-ui chrome).
   *
   * Contract (MANDATORY ordering — see docs/ai/patterns.md "Toolbars"):
   *   [left]                                    [children] | [group] | refresh | [primary]
   *
   * - `left`: optional free-form zone pinned to the far left (search,
   *   counters, breadcrumb…). The whole CTA zone is pushed to the far
   *   right via `ml-auto` — always right-aligned, never spread.
   * - `groups`: islands (ButtonGroup, selects, toggles) — auto-separated by
   *   a divider when preceded by other content (never a leading divider).
   * - `refresh`: standardized refresh button (ghost sm, icon + label on
   *   lg) rendered right after the primary zone's divider.
   * - `primary`: CTA snippet — always rightmost, always divider-preceded.
   * - `card` (default true): bordered + muted chrome — the framed KPI-card
   *   look. `false` = bare strip (bg-muted, no border) — the embedded
   *   EntityListTable style.
   */
  import { Toolbar as ToolbarPrimitive } from 'bits-ui';
  import type { ToolbarRootProps } from 'bits-ui';
  import { cn, type WithElementRef } from '$lib/utils.js';
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import ToolbarDivider from './toolbar-divider.svelte';

  let {
    ref = $bindable(null),
    class: className,
    card = true,
    left,
    groups = [],
    refresh,
    primary,
    children,
    ...restProps
  }: WithElementRef<ToolbarRootProps> & {
    /** Card chrome (default). false = transparent bare strip. */
    card?: boolean;
    /** Optional left zone (search, counters) — CTAs stay far right. */
    left?: Snippet;
    /** Isolated control islands — a divider is auto-rendered before each. */
    groups?: Snippet[];
    /** Standard refresh button — placed right before the primary CTAs. */
    refresh?: { onclick: () => void; loading?: boolean; disabled?: boolean };
    /** Primary CTA(s) — always rendered last (rightmost). */
    primary?: Snippet;
  } = $props();
</script>

<ToolbarPrimitive.Root
  bind:ref
  data-slot="toolbar"
  class={cn(
    'flex min-w-0 flex-nowrap items-center gap-2 rounded-md',
    card ? 'border border-border/60 bg-muted/30 px-2.5 py-1' : 'bg-muted/30 px-3 py-1.5',
    className
  )}
  {...restProps}
>
  {#if left}
    <div class="flex min-w-0 flex-1 items-center gap-2">
      {@render left()}
    </div>
  {/if}

  <div class="ml-auto flex items-center gap-2">
    {@render children?.()}

    {#each groups as group, i (i)}
      {#if children || i > 0}
        <ToolbarDivider />
      {/if}
      {@render group()}
    {/each}

    {#if refresh}
      {#if children || groups.length > 0}
        <ToolbarDivider />
      {/if}
      <Button
        variant="ghost"
        size="sm"
        disabled={refresh.disabled || refresh.loading}
        onclick={refresh.onclick}
        aria-label={$t('system.entities.list.refresh')}
        title={$t('system.entities.list.refresh')}
      >
        <RotateCw class={refresh.loading ? 'size-4 animate-spin' : 'size-4'} />
        <span class="hidden lg:inline">{$t('system.entities.list.refresh')}</span>
      </Button>
    {/if}

    {#if primary}
      {#if children || groups.length > 0 || refresh}
        <ToolbarDivider />
      {/if}
      {@render primary()}
    {/if}
  </div>
</ToolbarPrimitive.Root>
