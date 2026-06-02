import type { AdvancedFilter } from '$lib/entity-list/types';

export type ToolbarMode = 'filters' | 'bulk';

export function useToolbarMode(
  selectedKeys: string[],
  filterValues: Record<string, any>,
  advancedFilters: AdvancedFilter[]
) {
  const safeFilterValues = $derived(filterValues ?? {});
  const safeAdvancedFilters = $derived(advancedFilters ?? []);

  let toolbarMode = $state<ToolbarMode>('filters');

  let lastSelectionChange = $state(0);
  let lastFilterChange = $state(0);

  const hasAppliedFilters = $derived(
    (safeFilterValues && Object.keys(safeFilterValues).length > 0) ||
    (safeAdvancedFilters && safeAdvancedFilters.length > 0)
  );

  $effect(() => {
    void selectedKeys;
    lastSelectionChange = Date.now();
  });

  $effect(() => {
    void filterValues;
    void advancedFilters;
    lastFilterChange = Date.now();
  });

  $effect(() => {
    void lastSelectionChange;
    void lastFilterChange;
    void hasAppliedFilters;

    if (lastSelectionChange > lastFilterChange) {
      toolbarMode = 'bulk';
    } else if (hasAppliedFilters) {
      toolbarMode = 'filters';
    } else {
      toolbarMode = 'bulk';
    }
  });

  return {
    toolbarMode,
    hasAppliedFilters,
    toggle: () => {
      toolbarMode = toolbarMode === 'filters' ? 'bulk' : 'filters';
    }
  };
}
