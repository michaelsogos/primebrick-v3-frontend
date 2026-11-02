<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Standard in-app page BODY container: fills the main content region
   * (full width, no max-width), outer padding `p-2 sm:p-3`, vertical stack
   * with `min-h-0` so flex children can shrink, bordered content box.
   *
   * Header chrome is NOT this component's job — `PageHeader` is rendered
   * once by `AppShell` above every (app) page (mandatory anatomy, decl
   * opt-out only). Passing header props/snippets here is impossible by
   * typing — that is the enforcement.
   */
  let {
    children
  }: {
    children?: Snippet;
  } = $props();
</script>

<div class="h-full p-2 sm:p-3 contain-layout">
  <div class="flex h-full w-full flex-col gap-4 min-h-0 overflow-hidden">
    {#if children}
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
        {@render children()}
      </div>
    {/if}
  </div>
</div>
