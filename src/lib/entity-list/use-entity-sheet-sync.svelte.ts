/**
 * useEntitySheetSync — the shared contract for the `entity.*` sheet panels.
 *
 * `openSheet` snapshots props at open time; while a sheet is open this
 * composable re-assigns `sheetState.props` from the declared factory on
 * every reactive change, so checkboxes/modes inside panels stay live.
 *
 * Consumers declare a `panelId → props factory` map — the map IS the
 * dispatch (no per-panel branching). The same factory feeds the open-time
 * payload, so the mounted props can never drift from the resynced ones.
 *
 * `filtersOpen` is DERIVED from the sheet lifecycle (pressed == "the
 * entity.filters sheet is open", however it was opened) — there is no
 * parallel boolean to drift; `toggleFiltersSheet` is the funnel CTA
 * handler (open/close toggle semantics, non-modal sheet).
 */
import { closeSheet, openSheet, sheetState } from '$lib/shell/sheets/sheet-manager.svelte';
import type { SheetPanelPropsMap } from '$lib/shell/sheets/sheet-manager.svelte';

export type EntitySheetPanelId =
	| 'entity.searchIn'
	| 'entity.columns'
	| 'entity.filters'
	| 'entity.datetimeIana';

export interface UseEntitySheetSyncOptions {
	/** panelId → live props factory. Declare only the panels the host can open. */
	panels: Partial<{ [K in EntitySheetPanelId]: () => SheetPanelPropsMap[K] }>;
}

export function useEntitySheetSync(options: UseEntitySheetSyncOptions) {
	const _state = $state({
		lastPanelId: null as string | null
	});

	$effect(() => {
		if (sheetState.panelId) _state.lastPanelId = sheetState.panelId;
	});

	$effect(() => {
		void sheetState.open;
		const panelId = sheetState.panelId;
		if (!sheetState.open || !panelId) return;
		const factory = options.panels[panelId as EntitySheetPanelId];
		if (factory) sheetState.props = factory();
	});

	const filtersOpen = $derived(sheetState.open === true && sheetState.panelId === 'entity.filters');

	function toggleFiltersSheet() {
		if (filtersOpen) {
			closeSheet();
			return;
		}
		const factory = options.panels['entity.filters'];
		if (factory) openSheet('entity.filters', factory(), { modal: false });
	}

	return {
		get lastPanelId() {
			return _state.lastPanelId;
		},
		get filtersOpen() {
			return filtersOpen;
		},
		toggleFiltersSheet
	};
}
