<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Standard in-app page shell: fills the main content region (full width, no max-width),
   * outer padding `p-2 sm:p-3`, vertical stack with `gap-4` and `min-h-0` so flex children can shrink.
   *
   * Props:
   * - `title`: Optional page title string (rendered as h1). If provided, the header snippet should not contain an h1.
   * - `headerExtras`: Optional snippet for header content after the title (badges, toolbar, etc.).
   * - `header`: Legacy full header snippet (breadcrumb + h1 + extras). Kept for backward compatibility.
   * - `children`: Main body content.
   */
  let {
    title,
    headerExtras,
    header,
    children
  }: {
    title?: string;
    headerExtras?: Snippet;
    header?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<div class="h-full p-2 sm:p-3">
  <div class="flex h-full w-full flex-col gap-4 min-h-0">
    {#if header}
      <header class="shrink-0">{@render header()}</header>
    {:else if title || headerExtras}
      <header class="shrink-0">
        {#if title}
          <h1 class="truncate text-xl font-semibold leading-tight">{title}</h1>
        {/if}
        {#if headerExtras}
          {@render headerExtras()}
        {/if}
      </header>
    {/if}
    {#if children}
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
        {@render children()}
      </div>
    {/if}
  </div>
</div>
