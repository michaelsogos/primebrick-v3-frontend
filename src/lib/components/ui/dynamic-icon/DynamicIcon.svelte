<script lang="ts" module>
  // Cache already-resolved icon components so repeated renders of the same
  // icon name don't re-trigger the dynamic import.
  const iconCache = new Map<string, Promise<any>>();

  async function loadIcon(name: string): Promise<any> {
    let mod = iconCache.get(name);
    if (!mod) {
      mod = import(`@lucide/svelte/icons/${name}`).then((m) => m.default);
      iconCache.set(name, mod);
    }
    return mod;
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils.js';

  let {
    name,
    size = 16,
    class: className,
  }: {
    name: string;
    size?: number;
    class?: string;
  } = $props();

  let IconComp = $state<any>(null);

  // Load the icon component whenever the name changes.
  $effect(() => {
    let cancelled = false;
    loadIcon(name).then((comp) => {
      if (!cancelled) IconComp = comp;
    });
    return () => { cancelled = true; };
  });
</script>

{#if IconComp}
  <IconComp {size} class={cn(className)} />
{:else}
  <!-- Placeholder while the icon chunk loads — keeps layout stable -->
  <span style="display:inline-block;width:{size}px;height:{size}px" class={cn(className)}></span>
{/if}
