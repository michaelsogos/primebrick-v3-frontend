<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Standard in-app page shell: fills the main content region (full width, no max-width),
   * outer padding `p-2 sm:p-3`, vertical stack with `gap-4` and `min-h-0` so flex children can shrink.
   * Use `{#snippet header()}` for breadcrumb + title row (and optional toolbar); default slot = main body.
   */
  let {
    header,
    children
  }: {
    header?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<div class="h-full p-2 sm:p-3">
  <div class="flex h-full w-full flex-col gap-4 min-h-0">
    {#if header}
      <header class="shrink-0">{@render header()}</header>
    {/if}
    {#if children}
      <div class="flex min-h-0 flex-1 flex-col">
        {@render children()}
      </div>
    {/if}
  </div>
</div>
