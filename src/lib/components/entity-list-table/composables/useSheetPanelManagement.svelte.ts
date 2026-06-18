import { sheetState } from '$lib/shell/sheets/sheet-manager.svelte';

export interface SheetPanelManagementReturn {
  lastPanelId: { value: string | null };
}

export function useSheetPanelManagement(): SheetPanelManagementReturn {
  // Bridge the legacy `filtersOpen` boolean to the global SheetHost.
  let lastPanelId = $state<string | null>(null);
  $effect(() => {
    if (sheetState.panelId) lastPanelId = sheetState.panelId;
  });

  return {
    get lastPanelId() { return { value: lastPanelId }; }
  };
}
