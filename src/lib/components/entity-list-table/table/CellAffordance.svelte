<script lang="ts">
  /**
   * CellAffordance — the shared two-affordance cell anatomy.
   *
   * - TEXT: `font-medium` at rest, `underline` on hover only — opens the
   *   cell's sheet (ref record / json viewer / any single-click surface).
   * - TRAILING ICON: rightmost cell edge, `opacity-0` →
   *   `group-hover:opacity-100` (always in layout → no reflow). It carries
   *   the SECOND action — ref cells: filtered `/list` in `_blank`;
   *   pure sheet-openers pass no `href`/`oniconclick` and the icon itself
   *   opens the same sheet (single affordance).
   */
  import { resolve } from '$app/paths';
  import type { Snippet } from 'svelte';

  let {
    text,
    ontextclick,
    href,
    icon,
    icon_title,
    oniconclick,
  }: {
    /** The cell's display string (already resolved — `*_name` wins upstream). */
    text: string;
    /** Text-click → the cell's canonical sheet. */
    ontextclick: () => void;
    /** Trailing CTA as navigation — `_blank` canonical URL (ref cells only). */
    href?: string;
    /** Trailing CTA icon — rendered inside the hit area. */
    icon: Snippet;
    /** i18n-resolved tooltip for the trailing CTA. */
    icon_title?: string;
    /** Trailing CTA as action — sheet-openers ride this (json viewer). */
    oniconclick?: () => void;
  } = $props();
</script>

<span class="inline-flex max-w-full items-center gap-1">
  <button
    type="button"
    class="min-w-0 cursor-pointer truncate text-left font-medium text-foreground hover:underline"
    onclick={ontextclick}
  >
    {text}
  </button>
  {#if href}
    <a
      href={resolve(href as '/')}
      target="_blank"
      rel="noopener noreferrer"
      title={icon_title}
      aria-label={icon_title}
      class="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      onclick={(e) => e.stopPropagation()}
    >
      {@render icon()}
    </a>
  {:else if oniconclick}
    <button
      type="button"
      title={icon_title}
      aria-label={icon_title}
      class="shrink-0 cursor-pointer text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      onclick={(e) => { e.stopPropagation(); oniconclick(); }}
    >
      {@render icon()}
    </button>
  {/if}
</span>
