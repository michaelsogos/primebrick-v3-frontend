<script lang="ts">
  /**
   * AnchorTabs.Content — a tab content panel.
   *
   * - 'show-all' mode: always rendered (visible). Has an `id` for anchor
   *   scrolling and an IntersectionObserver that updates the active trigger
   *   when this section scrolls into view.
   * - 'hide' mode: only rendered when this tab is active.
   *
   * The `value` prop must match the corresponding Trigger's `value`.
   */
  import { getContext, onMount } from "svelte";
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils.js";
  import { browser } from "$app/environment";

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

  const section_id = `anchor-tab-${value}`;
  let section_el: HTMLElement | null = $state(null);
  const is_active = $derived(ctx.active_value === value);

  // IntersectionObserver: update active trigger when section is in view.
  // Only active in 'show-all' mode.
  onMount(() => {
    if (!browser || ctx.mode !== "show-all") return;
    if (!section_el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            ctx.setActive(value);
          }
        }
      },
      {
        // Trigger when the section's top is near the top of the viewport.
        rootMargin: "-80px 0px -70% 0px",
        threshold: 0,
      }
    );
    observer.observe(section_el);
    return () => observer.disconnect();
  });
</script>

{#if ctx.mode === "show-all"}
  <section
    bind:this={section_el}
    id={section_id}
    data-slot="anchor-tabs-content"
    class={cn("text-sm flex-1 outline-none scroll-mt-20", className)}
  >
    {@render children()}
  </section>
{:else if is_active}
  <div
    data-slot="anchor-tabs-content"
    class={cn("text-sm flex-1 outline-none", className)}
  >
    {@render children()}
  </div>
{/if}
