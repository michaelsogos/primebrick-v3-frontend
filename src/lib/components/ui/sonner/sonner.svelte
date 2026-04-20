<script lang="ts">
  import { onMount } from 'svelte';
  import { Toaster as Sonner, type ToasterProps } from 'svelte-sonner';
  import { CircleAlert } from 'lucide-svelte';
  import { cn } from '$lib/utils.js';

  let { class: className, ...restProps }: ToasterProps = $props();

  /** Tracks `ThemeToggle` / `pb.theme` (`.dark` on `<html>`), not system preference alone. */
  let theme = $state<'light' | 'dark'>('light');

  onMount(() => {
    const sync = () => {
      theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  });
</script>

<!--
  Top stack + hover expand: Sonner sets expanded on pointer enter (see svelte-sonner Toaster).
  Matches shadcn-svelte Sonner docs: https://www.shadcn-svelte.com/docs/components/sonner
-->
<Sonner
  {theme}
  position="top-center"
  expand={false}
  richColors={true}
  duration={5000}
  visibleToasts={4}
  class={cn('toaster group', className)}
  style="--normal-bg: hsl(var(--popover) / 0.95); --normal-text: hsl(var(--popover-foreground)); --normal-border: hsl(var(--border));"
  {...restProps}
>
  {#snippet errorIcon()}
    <CircleAlert class="h-5 w-5 shrink-0" aria-hidden="true" strokeWidth={2} />
  {/snippet}
</Sonner>
