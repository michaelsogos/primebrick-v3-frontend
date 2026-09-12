<script lang="ts">
  /**
   * SelectableToolbar — select-all checkbox + bulk action area.
   *
   * Position-agnostic: NO `position: sticky` baked in. The consumer's layout
   * determines whether the toolbar is pinned (flex sibling outside scroll
   * container, like /security) or inline (inside scroll container, like /ai).
   *
   * Matches ConfigList toolbar pattern (lines 270-331) but without the
   * sticky/border-b wrapper classes — those are applied by the consumer.
   */
  import { t } from '$lib/i18n';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import type { Snippet } from 'svelte';

  let {
    all_selected,
    some_selected,
    selected_count,
    on_toggle_select_all,
    children,
    class: klass = '',
    test_id = 'selectable-toolbar',
  }: {
    all_selected: boolean;
    some_selected: boolean;
    selected_count: number;
    on_toggle_select_all: (checked: boolean) => void;
    children?: Snippet;
    class?: string;
    test_id?: string;
  } = $props();
</script>

<div class="flex flex-wrap items-center gap-2 {klass}" data-testid={test_id}>
  <Checkbox
    checked={all_selected}
    indeterminate={some_selected}
    onCheckedChange={() => on_toggle_select_all(!all_selected)}
    data-testid="{test_id}-select-all"
  />
  <span class="text-sm text-muted-foreground select-none mr-1">
    {#if all_selected}
      {$t('app.common.deselectAll')}
    {:else}
      {$t('app.common.selectAll')}
    {/if}
  </span>
  {#if selected_count > 0}
    <div class="h-5 w-px bg-border mx-1" aria-hidden="true"></div>
    {@render children?.()}
  {/if}
</div>
