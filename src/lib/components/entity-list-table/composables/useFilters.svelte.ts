import type { AdvancedFilter, FilterOperator } from '$lib/entity-list/types';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useFilters(options: {
  initialValues?: Record<string, any>;
  onFilterValuesChange?: (values: Record<string, any>) => void;
} = {}) {
  const { initialValues = {}, onFilterValuesChange } = options;

  const _state = $state({
    filterValues: { ...initialValues } as Record<string, any>,
  });

  function updateFilterValue(key: string, value: any) {
    _state.filterValues = { ..._state.filterValues, [key]: value };
    onFilterValuesChange?.(_state.filterValues);
  }

  function clearFilter(key: string) {
    const newValues = { ..._state.filterValues };
    delete newValues[key];
    _state.filterValues = newValues;
    onFilterValuesChange?.(_state.filterValues);
  }

  function clearAllFilters() {
    _state.filterValues = {};
    onFilterValuesChange?.(_state.filterValues);
  }

  const hasActiveFilters = $derived(Object.keys(_state.filterValues).length > 0);

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    updateFilterValue,
    clearFilter,
    clearAllFilters,
    get hasActiveFilters() { return hasActiveFilters; }
  };
}

export function useAdvancedFilters(
  options: {
    initialFilters?: AdvancedFilter[];
    onAdvancedFiltersChange?: (filters: AdvancedFilter[], connector: 'AND' | 'OR') => void;
  } = {}
) {
  const { initialFilters = [], onAdvancedFiltersChange } = options;

  const _state = $state({
    advancedFilters: [...initialFilters] as AdvancedFilter[],
    globalConnector: 'AND' as 'AND' | 'OR',
  });

  function addFilter(filter: AdvancedFilter) {
    _state.advancedFilters = [..._state.advancedFilters, filter];
    onAdvancedFiltersChange?.(_state.advancedFilters, _state.globalConnector);
  }

  function removeFilter(id: string) {
    _state.advancedFilters = _state.advancedFilters.filter((f) => f.id !== id);
    onAdvancedFiltersChange?.(_state.advancedFilters, _state.globalConnector);
  }

  function updateFilter(id: string, updates: Partial<AdvancedFilter>) {
    _state.advancedFilters = _state.advancedFilters.map((f) => (f.id === id ? { ...f, ...updates } : f));
    onAdvancedFiltersChange?.(_state.advancedFilters, _state.globalConnector);
  }

  function clearAdvancedFilters() {
    _state.advancedFilters = [];
    onAdvancedFiltersChange?.(_state.advancedFilters, _state.globalConnector);
  }

  const hasAdvancedFilters = $derived(_state.advancedFilters.length > 0);

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    addFilter,
    removeFilter,
    updateFilter,
    clearAdvancedFilters,
    get hasAdvancedFilters() { return hasAdvancedFilters; }
  };
}
