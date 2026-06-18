import type { AdvancedFilter, FilterOperator } from '$lib/entity-list/types';

export interface FilterOptions {
  initialValues?: Record<string, any>;
  onFilterValuesChange?: (values: Record<string, any>) => void;
}

export interface FilterReturn {
  filterValues: Record<string, any>;
  updateFilterValue: (key: string, value: any) => void;
  clearFilter: (key: string) => void;
  clearAllFilters: () => void;
  hasActiveFilters: boolean;
}

export function useFilters(options: FilterOptions = {}): FilterReturn {
  const { initialValues = {}, onFilterValuesChange } = options;

  let filterValues = $state<Record<string, any>>({ ...initialValues });

  function updateFilterValue(key: string, value: any) {
    filterValues = { ...filterValues, [key]: value };
    onFilterValuesChange?.(filterValues);
  }

  function clearFilter(key: string) {
    const newValues = { ...filterValues };
    delete newValues[key];
    filterValues = newValues;
    onFilterValuesChange?.(filterValues);
  }

  function clearAllFilters() {
    filterValues = {};
    onFilterValuesChange?.(filterValues);
  }

  const hasActiveFilters = $derived(Object.keys(filterValues).length > 0);

  return {
    get filterValues() { return filterValues; },
    updateFilterValue,
    clearFilter,
    clearAllFilters,
    get hasActiveFilters() { return hasActiveFilters; }
  };
}

export interface AdvancedFilterOptions {
  initialFilters?: AdvancedFilter[];
  onAdvancedFiltersChange?: (filters: AdvancedFilter[], connector: 'AND' | 'OR') => void;
}

export interface AdvancedFilterReturn {
  advancedFilters: AdvancedFilter[];
  globalConnector: 'AND' | 'OR';
  addFilter: (filter: AdvancedFilter) => void;
  removeFilter: (id: string) => void;
  updateFilter: (id: string, updates: Partial<AdvancedFilter>) => void;
  clearAdvancedFilters: () => void;
  hasAdvancedFilters: boolean;
}

export function useAdvancedFilters(
  options: AdvancedFilterOptions = {}
): AdvancedFilterReturn {
  const { initialFilters = [], onAdvancedFiltersChange } = options;

  let advancedFilters = $state<AdvancedFilter[]>([...initialFilters]);
  let globalConnector = $state<'AND' | 'OR'>('AND');

  function addFilter(filter: AdvancedFilter) {
    advancedFilters = [...advancedFilters, filter];
    onAdvancedFiltersChange?.(advancedFilters, globalConnector);
  }

  function removeFilter(id: string) {
    advancedFilters = advancedFilters.filter((f) => f.id !== id);
    onAdvancedFiltersChange?.(advancedFilters, globalConnector);
  }

  function updateFilter(id: string, updates: Partial<AdvancedFilter>) {
    advancedFilters = advancedFilters.map((f) => (f.id === id ? { ...f, ...updates } : f));
    onAdvancedFiltersChange?.(advancedFilters, globalConnector);
  }

  function clearAdvancedFilters() {
    advancedFilters = [];
    onAdvancedFiltersChange?.(advancedFilters, globalConnector);
  }

  const hasAdvancedFilters = $derived(advancedFilters.length > 0);

  return {
    get advancedFilters() { return advancedFilters; },
    get globalConnector() { return globalConnector; },
    addFilter,
    removeFilter,
    updateFilter,
    clearAdvancedFilters,
    get hasAdvancedFilters() { return hasAdvancedFilters; }
  };
}
