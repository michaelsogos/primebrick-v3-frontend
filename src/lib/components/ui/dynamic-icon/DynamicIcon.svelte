<script lang="ts" module>
  // Pre-register all lucide icon modules at build time so Vite can resolve them.
  // `import.meta.glob` produces a map of path → lazy import function that Vite
  // can statically analyze, unlike the previous dynamic `import()` with template
  // literals which Vite could not resolve.
  // Vite 8 requires glob patterns to start with '/' or './' — bare package
  // specifiers are not allowed. The leading '/' resolves from the project root.
  const iconModules = import.meta.glob('/node_modules/@lucide/svelte/dist/icons/*.svelte');

  // Cache already-resolved icon components so repeated renders of the same
  // icon name don't re-trigger the dynamic import.
  const iconCache = new Map<string, Promise<any>>();

  async function loadIcon(name: string): Promise<any> {
    let mod = iconCache.get(name);
    if (!mod) {
      const key = `/node_modules/@lucide/svelte/dist/icons/${name}.svelte`;
      const loader = iconModules[key];
      if (!loader) {
        console.warn(`[DynamicIcon] Icon "${name}" not found in @lucide/svelte/dist/icons/`);
        return null;
      }
      mod = loader().then((m: any) => m.default);
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
