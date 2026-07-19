<script lang="ts">
  /**
   * AnchorTabs.Trigger — a tab trigger that behaves differently per mode.
   *
   * - 'show-all' mode: renders an `<a href="#section-id">` anchor link.
   *   Clicking smooth-scrolls to the section. The `data-active` attribute
   *   is driven by the IntersectionObserver in the Content component.
   * - 'hide' mode: renders a `<button>` that sets the active tab value.
   *
   * The `value` prop is the tab identifier (e.g. "details", "permissions").
   */
  import { getContext } from "svelte";
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils.js";

  let {
    value,
    class: className,
    children,
  }: {
    value: string;
    class?: string;
    children: Snippet;
  } = $props();

  const ctx = getContext<{
    mode: "hide" | "show-all";
    active_value: string;
    registerTab: (v: string) => string;
    setActive: (v: string) => void;
    scrollToTab: (v: string) => void;
  }>("anchor-tabs");

  const section_id = ctx.registerTab(value);
  const is_active = $derived(ctx.active_value === value);

  function handleClick(e: MouseEvent) {
    if (ctx.mode === "show-all") {
      e.preventDefault();
      ctx.scrollToTab(value);
    } else {
      ctx.setActive(value);
    }
  }
</script>

{#if ctx.mode === "show-all"}
  <a
    href={`#${section_id}`}
    data-slot="anchor-tabs-trigger"
    data-active={is_active}
    onclick={handleClick}
    class={cn(
      "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center whitespace-nowrap rounded-md border border-transparent px-3 py-1.5 text-sm font-medium transition-all cursor-pointer",
      "text-foreground/60 hover:text-foreground",
      "data-[active=true]:text-foreground data-[active=true]:border-border data-[active=true]:bg-muted/40",
      "after:bg-foreground after:absolute after:opacity-0 after:transition-opacity after:inset-x-0 after:bottom-[-1px] after:h-0.5",
      "data-[active=true]:after:opacity-100",
      className
    )}
  >
    {@render children()}
  </a>
{:else}
  <button
    type="button"
    data-slot="anchor-tabs-trigger"
    data-active={is_active}
    onclick={handleClick}
    class={cn(
      "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center whitespace-nowrap rounded-md border border-transparent px-3 py-1.5 text-sm font-medium transition-all cursor-pointer",
      "text-foreground/60 hover:text-foreground",
      "data-[active=true]:text-foreground data-[active=true]:border-border data-[active=true]:bg-muted/40",
      "after:bg-foreground after:absolute after:opacity-0 after:transition-opacity after:inset-x-0 after:bottom-[-1px] after:h-0.5",
      "data-[active=true]:after:opacity-100",
      className
    )}
  >
    {@render children()}
  </button>
{/if}
