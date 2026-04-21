<script lang="ts">
  import type { Snippet } from 'svelte';

  interface $$Props {
    title: Snippet;
    actions?: Snippet;
  }

  let { title, actions }: $$Props = $props();
</script>

<div class="flex items-center justify-between gap-2 border-b px-4 py-3">
  <div class="text-sm font-medium">
    {@render title?.()}
  </div>
  {#if actions}
    <div class="flex items-center gap-1">
      {@render actions?.()}
    </div>
  {/if}
</div>

