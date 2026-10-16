<script lang="ts">
  /**
   * SheetSectionTitle — the ONE canonical style for section headers inside
   * a sheet panel's CONTENT region. Never invent per-panel section titles.
   *
   *   <SheetSectionTitle>Filtri</SheetSectionTitle>
   *   <SheetSectionTitle class="flex items-center justify-between">
   *     <span>Case</span><span>{date}</span>
   *   </SheetSectionTitle>
   *
   * Sticky is ON by default: the title pins to the top of the CONTENT
   * scroll region and releases when the next section's title arrives.
   * Contract: wrap each section (title + rows) in its own block so the
   * sticky header is contained by that section — no JS needed.
   * Pass `sticky={false}` only for non-scrolling mini-sections.
   */
  import { cn } from '$lib/utils';
  import type { Snippet } from 'svelte';

  let { class: className, sticky = true, children }: { class?: string; sticky?: boolean; children: Snippet } = $props();
</script>

<div class={cn(
  'px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
  sticky && 'sticky top-0 z-10 bg-background',
  className
)}>
  {@render children()}
</div>
