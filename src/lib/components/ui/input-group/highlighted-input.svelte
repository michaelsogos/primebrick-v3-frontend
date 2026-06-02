<script lang="ts">
  import { cn } from '$lib/utils.js';
  import SearchSyntaxHighlighter from '$lib/components/entity-list-table/search/SearchSyntaxHighlighter.svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  let {
    value = $bindable(''),
    class: className,
    type = 'text',
    placeholder,
    ...props
  }: HTMLInputAttributes & { type?: string } = $props();

  let inputRef: HTMLInputElement | null = $state(null);
  let overlayRef: HTMLDivElement | null = $state(null);

  // Sync horizontal scroll precisely
  function syncScroll() {
    if (inputRef && overlayRef) {
      overlayRef.scrollLeft = inputRef.scrollLeft;
    }
  }
</script>

<div class="relative flex-1 min-w-0 self-stretch flex items-center">
  <!-- UNDERLAY: Visual simulation container -->
  <div
    bind:this={overlayRef}
    class={cn(
      "absolute inset-0 flex items-center pointer-events-none overflow-hidden select-none whitespace-nowrap",
      "text-sm tracking-normal font-sans", // Must match native input 100%
      "[&_span]:inline-block [&_span]:leading-none" // Normalize span line height
    )}
    aria-hidden="true"
  >
    <!-- Mirror container inheriting exact padding from input -->
    <div class={cn("w-full truncate flex items-center bg-transparent py-1 px-3", className)}>
      {#if !value && placeholder}
        <!-- Clean placeholder handling, invisible on first character -->
        <span class="text-muted-foreground/70 text-xs block truncate select-none">
          {placeholder}
        </span>
      {:else}
        <!-- Pass disablePadding prop to avoid horizontal misalignment -->
        <SearchSyntaxHighlighter search={value} disablePadding={true} />
      {/if}
    </div>
  </div>

  <!-- OVERLAY: Interactive native input -->
  <input
    bind:this={inputRef}
    {type}
    bind:value
    {placeholder}
    oninput={syncScroll}
    onscroll={syncScroll}
    class={cn(
      "w-full h-full bg-transparent border-none outline-hidden",
      "text-transparent caret-foreground", // Hide native text, show only cursor
      "text-sm tracking-normal font-sans py-1 px-3", // Identical geometric styles to overlay
      "focus-visible:ring-0 focus-visible:ring-offset-0",
      className
    )}
    {...props}
  />
</div>
