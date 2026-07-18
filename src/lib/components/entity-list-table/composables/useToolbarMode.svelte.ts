import type { AdvancedFilter } from '$lib/entity-list/types';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export type ToolbarMode = 'filters' | 'bulk';

export function useToolbarMode(options: {
  selectedKeys: () => string[];
  filterValues: () => Record<string, any>;
  advancedFilters: () => AdvancedFilter[];
}) {
  const safeFilterValues = $derived.by(() => options.filterValues() ?? {});
  const safeAdvancedFilters = $derived.by(() => options.advancedFilters() ?? []);

  const _state = $state({
    toolbarMode: 'filters' as ToolbarMode,
    lastSelectionChange: 0,
    lastFilterChange: 0,
  });

  const hasAppliedFilters = $derived.by(() => {
    const filters = safeFilterValues;
    const advanced = safeAdvancedFilters;
    return (filters && Object.keys(filters).length > 0) || (advanced && advanced.length > 0);
  });

  $effect(() => {
    void options.selectedKeys();
    _state.lastSelectionChange = Date.now();
  });

  $effect(() => {
    void options.filterValues();
    void options.advancedFilters();
    _state.lastFilterChange = Date.now();
  });

  $effect(() => {
    void _state.lastSelectionChange;
    void _state.lastFilterChange;
    void hasAppliedFilters;

    if (_state.lastSelectionChange > _state.lastFilterChange) {
      _state.toolbarMode = 'bulk';
    } else if (hasAppliedFilters) {
      _state.toolbarMode = 'filters';
    } else {
      _state.toolbarMode = 'bulk';
    }
  });

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    get hasAppliedFilters() { return hasAppliedFilters; },
    toggle: () => {
      _state.toolbarMode = _state.toolbarMode === 'filters' ? 'bulk' : 'filters';
    },
    setMode: (mode: ToolbarMode) => {
      _state.toolbarMode = mode;
    }
  };
}
