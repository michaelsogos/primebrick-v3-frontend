import { sheetState } from '$lib/shell/sheets/sheet-manager.svelte';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useSheetPanelManagement() {
  const _state = $state({
    lastPanelId: null as string | null,
  });

  $effect(() => {
    if (sheetState.panelId) _state.lastPanelId = sheetState.panelId;
  });

  return {
    get state(): DeepReadonly<typeof _state> { return _state; },
  };
}
