<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import {
    closeSheet,
    sheetState,
    shouldSuppressSheetDialogClose,
    type SheetPanelId
  } from '$lib/shell/sheets/sheet-manager.svelte';
  import { cn } from '$lib/utils';

  import ErrorsPanel from '$lib/shell/sheets/panels/ErrorsPanel.svelte';
  import VersionsPanel from '$lib/shell/sheets/panels/VersionsPanel.svelte';
  import AiChatPanel from '$lib/shell/sheets/panels/AiChatPanel.svelte';
  import SearchInPanel from '$lib/entity-list/sheets/panels/SearchInPanel.svelte';
  import ColumnsPanel from '$lib/entity-list/sheets/panels/ColumnsPanel.svelte';
  import FiltersPanel from '$lib/entity-list/sheets/panels/FiltersPanel.svelte';
  import VersionHistoryPanel from '$lib/entity-list/sheets/panels/VersionHistoryPanel.svelte';
  import CurrencySelectPanel from '$lib/shell/sheets/panels/CurrencySelectPanel.svelte';

  const registry: Record<SheetPanelId, any> = {
    'shell.errors': ErrorsPanel,
    'shell.versions': VersionsPanel,
    'shell.aiChat': AiChatPanel,
    'entity.searchIn': SearchInPanel,
    'entity.columns': ColumnsPanel,
    'entity.filters': FiltersPanel,
    'entity.versionHistory': VersionHistoryPanel,
    'config.currencySelect': CurrencySelectPanel
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
  <Sheet.Content showClose={false} side={sheetState.side} class={cn(sheetState.contentClass, "shadow-[4px_0_24px_-4px_rgba(0,0,0,0.3)]")} modal={sheetState.modal}>
    {#if Panel}
      <Panel {...panelProps} modal={sheetState.modal} />
    {/if}
  </Sheet.Content>
</Sheet.Root>

