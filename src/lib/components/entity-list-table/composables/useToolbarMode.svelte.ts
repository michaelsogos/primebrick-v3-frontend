import type { AdvancedFilter } from '$lib/entity-list/types';

export type ToolbarMode = 'filters' | 'bulk';

export function useToolbarMode(options: {
  selectedKeys: () => string[];
  filterValues: () => Record<string, any>;
  advancedFilters: () => AdvancedFilter[];
}) {
  const safeFilterValues = $derived.by(() => options.filterValues() ?? {});
  const safeAdvancedFilters = $derived.by(() => options.advancedFilters() ?? []);

  let toolbarMode = $state<ToolbarMode>('filters');

  let lastSelectionChange = $state(0);
  let lastFilterChange = $state(0);

  const hasAppliedFilters = $derived.by(() => {
    const filters = safeFilterValues;
    const advanced = safeAdvancedFilters;
    return (filters && Object.keys(filters).length > 0) || (advanced && advanced.length > 0);
  });

  $effect(() => {
    void options.selectedKeys();
    lastSelectionChange = Date.now();
  });

  $effect(() => {
    void options.filterValues();
    void options.advancedFilters();
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
    get toolbarMode() { return toolbarMode; },
    get hasAppliedFilters() { return hasAppliedFilters; },
    toggle: () => {
      toolbarMode = toolbarMode === 'filters' ? 'bulk' : 'filters';
    }
  };
}
