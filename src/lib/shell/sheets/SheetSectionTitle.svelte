<script lang="ts">
  /**
   * SheetSectionTitle — the ONE canonical style for section headers inside
   * a sheet panel's CONTENT region. Never invent per-panel section titles.
   *
   *   <SheetSectionTitle>Filtri</SheetSectionTitle>
   *   <SheetSectionTitle class="flex items-center justify-between">
   *     <span>Case</span><span>{date}</span>
   *   </SheetSectionTitle>
   */
  import { cn } from '$lib/utils';
  import type { Snippet } from 'svelte';

  let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<div class={cn('px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}>
  {@render children()}
</div>
