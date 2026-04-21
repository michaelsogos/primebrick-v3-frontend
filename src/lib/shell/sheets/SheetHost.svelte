<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import { closeSheet, sheetState, type SheetPanelId } from '$lib/shell/sheets/sheet-manager.svelte';

  import ErrorsPanel from '$lib/shell/sheets/panels/ErrorsPanel.svelte';
  import VersionsPanel from '$lib/shell/sheets/panels/VersionsPanel.svelte';
  import SearchInPanel from '$lib/entity-list/sheets/panels/SearchInPanel.svelte';
  import ColumnsPanel from '$lib/entity-list/sheets/panels/ColumnsPanel.svelte';
  import FiltersPanel from '$lib/entity-list/sheets/panels/FiltersPanel.svelte';

  const registry: Record<SheetPanelId, any> = {
    'shell.errors': ErrorsPanel,
    'shell.versions': VersionsPanel,
    'entity.searchIn': SearchInPanel,
    'entity.columns': ColumnsPanel,
    'entity.filters': FiltersPanel
  };

  const panelId = $derived(sheetState.panelId);
  const Panel = $derived(panelId ? registry[panelId] : null);
  const panelProps = $derived((sheetState.props ?? {}) as Record<string, unknown>);

  function setOpen(v: boolean) {
    if (v) sheetState.open = true;
    else closeSheet();
  }
</script>

<Sheet.Root bind:open={() => sheetState.open, setOpen}>
  <Sheet.Content showClose={false} side={sheetState.side} class={sheetState.contentClass}>
    {#if Panel}
      <Panel {...panelProps} />
    {/if}
  </Sheet.Content>
</Sheet.Root>

