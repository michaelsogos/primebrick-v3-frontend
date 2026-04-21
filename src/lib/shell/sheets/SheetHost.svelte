<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import {
    closeSheet,
    sheetState,
    shouldSuppressSheetDialogClose,
    type SheetPanelId
  } from '$lib/shell/sheets/sheet-manager.svelte';

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

  /**
   * Controlled dialog: keep `open` in sync with `sheetState.open`.
   * Ignore a spurious `false` right after `openSheet()` (see `shouldSuppressSheetDialogClose`).
   */
  function onSheetOpenChange(next: boolean) {
    if (next) {
      sheetState.open = true;
      return;
    }
    if (shouldSuppressSheetDialogClose()) return;
    closeSheet();
  }
</script>

<Sheet.Root open={sheetState.open} onOpenChange={onSheetOpenChange}>
  <Sheet.Content showClose={false} side={sheetState.side} class={sheetState.contentClass}>
    {#if Panel}
      <Panel {...panelProps} />
    {/if}
  </Sheet.Content>
</Sheet.Root>

