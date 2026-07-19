<script lang="ts">
  /**
   * AnchorTabs.Root — context provider for the anchor-tabs family.
   *
   * Two modes:
   *   - 'show-all' (default): all tab contents are stacked in the DOM. Triggers
   *     are anchor links (`<a href="#tab-id">`) with smooth-scroll. The active
   *     trigger follows scroll position via IntersectionObserver.
   *   - 'hide': standard tabs behavior — only the selected tab's content is
   *     visible. Triggers switch content via state.
   *
   * The mode is controlled by the `useTabsMode` composable (global singleton,
   * persisted in localStorage). The Root reads the mode from the composable
   * and sets context so all children (List, Trigger, Content, ModeSwitch) react.
   */
  import { setContext } from "svelte";
  import type { Snippet } from "svelte";
  import { useTabsMode, type TabsMode } from "$lib/composables/useTabsMode.svelte";
  import { cn } from "$lib/utils.js";

  let {
    value = $bindable(""),
    class: className,
    children,
  }: {
    value?: string;
    class?: string;
    children: Snippet;
  } = $props();

  const tabsMode = useTabsMode();

  // In 'hide' mode, `value` is the active tab. In 'show-all' mode, `value`
  // tracks which section is currently in view (driven by IntersectionObserver).
  const _state = $state({
    active_value: value,
  });

  // Sync external value → internal state.
  $effect(() => {
    _state.active_value = value;
  });

  // Sync internal state → external bindable.
  $effect(() => {
    value = _state.active_value;
  });

  // Map of tab value → section element id (for anchor scrolling).
  const tab_ids = $state(new Map<string, string>());

  function registerTab(tabValue: string): string {
    const id = `anchor-tab-${tabValue}`;
    tab_ids.set(tabValue, id);
    return id;
  }

  function setActive(tabValue: string): void {
    _state.active_value = tabValue;
  }

  function scrollToTab(tabValue: string): void {
    const id = tab_ids.get(tabValue);
    if (id) {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  // Reactive mode — re-reads the singleton state.
  const current_mode = $derived(tabsMode.mode);

  setContext("anchor-tabs", {
    get mode(): TabsMode {
      return current_mode;
    },
    get active_value(): string {
      return _state.active_value;
    },
    registerTab,
    setActive,
    scrollToTab,
  });
</script>

<div
  data-slot="anchor-tabs"
  data-mode={current_mode}
  class={cn("flex flex-col gap-2", className)}
>
  {@render children()}
</div>
