<script lang="ts">
  /**
   * AnchorTabs.ModeSwitch — a toggle switch + label that flips between
   * 'show-all' and 'hide' modes. Uses the `useTabsMode` composable so the
   * preference is persisted in localStorage and shared across all
   * AnchorTabs instances.
   */
  import { useTabsMode } from "$lib/composables/useTabsMode.svelte";
  import { Switch } from "$lib/components/ui/switch";
  import { cn } from "$lib/utils.js";

  let {
    class: className,
    label_show_all,
    label_hide,
  }: {
    class?: string;
    label_show_all?: string;
    label_hide?: string;
  } = $props();

  const tabsMode = useTabsMode();
  let checked = $state(tabsMode.mode === "show-all");

  // Sync external mode changes → switch state.
  $effect(() => {
    checked = tabsMode.mode === "show-all";
  });

  // Sync switch state → composable (fires when user toggles the switch).
  $effect(() => {
    const new_mode = checked ? "show-all" : "hide";
    if (tabsMode.mode !== new_mode) {
      tabsMode.setMode(new_mode);
    }
  });
</script>

<div class={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
  <span class={cn(!checked && "font-medium text-foreground")}>
    {label_hide ?? "Tabs"}
  </span>
  <Switch bind:checked />
  <span class={cn(checked && "font-medium text-foreground")}>
    {label_show_all ?? "Show all"}
  </span>
</div>
