<script lang="ts">
  /**
   * AnchorTabs.ModeSwitch — a toggle switch + label that flips between
   * 'show-all' and 'hide' modes. Uses the `useTabsMode` composable so the
   * preference is persisted in localStorage and shared across all
   * AnchorTabs instances.
   */
  import { useTabsMode } from "$lib/composables/useTabsMode.svelte";
  import { Switch } from '@primebrick/ui';
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
  // Single source of truth is the composable's `mode` — `checked` is a
  // read-only projection; writes go through `setMode` via the switch change
  // handler (a bidirectional $state+$effect pair would desync on external
  // mode changes anyway).
  let checked = $derived(tabsMode.mode === "show-all");

  function onCheckedChange(v: boolean) {
    const new_mode = v ? "show-all" : "hide";
    if (tabsMode.mode !== new_mode) {
      tabsMode.setMode(new_mode);
    }
  }
</script>

<div class={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
  <span class={cn(!checked && "font-medium text-foreground")}>
    {label_hide ?? "Tabs"}
  </span>
  <Switch checked={checked} {onCheckedChange} />
  <span class={cn(checked && "font-medium text-foreground")}>
    {label_show_all ?? "Show all"}
  </span>
</div>
