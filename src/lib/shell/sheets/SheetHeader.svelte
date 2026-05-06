<script lang="ts">
  import type { Snippet } from 'svelte';

  interface $$Props {
    title: Snippet;
    actions?: Snippet;
  }

  let { title, actions }: $$Props = $props();
</script>

<div class="flex items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar-accent px-2 py-2 text-sidebar-accent-foreground">
  <div class="text-sm font-medium">
    {@render title?.()}
  </div>
  {#if actions}
    <div class="flex items-center gap-1">
      {@render actions?.()}
    </div>
  {/if}
</div>

