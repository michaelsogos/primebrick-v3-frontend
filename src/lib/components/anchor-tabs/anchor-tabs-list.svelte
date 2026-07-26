<script lang="ts">
  /**
   * AnchorTabs.List — container for tab triggers.
   *
   * Renders a horizontal list of triggers. Styling mirrors the existing
   * `tabs-list.svelte` (variant=line) for visual consistency.
   */
  import { cn } from "$lib/utils.js";
  import type { Snippet } from "svelte";

  let {
    class: className,
    children,
  }: {
    class?: string;
    children: Snippet;
  } = $props();
</script>

<div
  data-slot="anchor-tabs-list"
  class={cn(
    "inline-flex w-fit items-center justify-center gap-1 rounded-none bg-transparent",
    "border-b border-border",
    className
  )}
>
  {@render children()}
</div>
