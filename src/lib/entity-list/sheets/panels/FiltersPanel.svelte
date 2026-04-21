<script lang="ts">
  import type { Snippet } from 'svelte';

  interface $$Props {
    content: Snippet;
  }

  let { content }: $$Props = $props();
</script>

<div class="h-full">
  {@render content?.()}
</div>

