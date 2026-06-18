import type { AdvancedFilter } from '$lib/entity-list/types';

export function useFilterPersistence(options: {
  uid: () => string;
  filterValuesStorageKey?: string;
  advancedFiltersStorageKey?: string;
  columnOrderStorageKey?: string;
}) {
  const filterValuesStorageKeyFull = $derived(
    options.filterValuesStorageKey || (options.columnOrderStorageKey ? `${options.columnOrderStorageKey}:filterValues` : `pb.entityList:${options.uid()}:filterValues`)
  );

  const advancedFiltersStorageKeyFull = $derived(
    options.advancedFiltersStorageKey || (options.columnOrderStorageKey ? `${options.columnOrderStorageKey}:advancedFilters` : `pb.entityList:${options.uid()}:advancedFilters`)
  );

  function readFilterValues(): Record<string, any> {
    if (!options.filterValuesStorageKey && !options.columnOrderStorageKey) return {};
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.sessionStorage.getItem(filterValuesStorageKeyFull);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed as Record<string, any>;
    } catch {
      return {};
    }
  }

  function writeFilterValues(next: Record<string, any>) {
    if (!options.filterValuesStorageKey && !options.columnOrderStorageKey) return;
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(filterValuesStorageKeyFull, JSON.stringify(next));
    } catch {
      // ignore quota / blocked storage
    }
  }

  function readAdvancedFilters(): AdvancedFilter[] {
    if (!options.advancedFiltersStorageKey && !options.columnOrderStorageKey) return [];
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.sessionStorage.getItem(advancedFiltersStorageKeyFull);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as AdvancedFilter[];
    } catch {
      return [];
    }
  }

  function writeAdvancedFilters(next: AdvancedFilter[]) {
    if (!options.advancedFiltersStorageKey && !options.columnOrderStorageKey) return;
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(advancedFiltersStorageKeyFull, JSON.stringify(next));
    } catch {
      // ignore quota / blocked storage
    }
  }

  return {
    get filterValuesStorageKeyFull() { return filterValuesStorageKeyFull; },
    get advancedFiltersStorageKeyFull() { return advancedFiltersStorageKeyFull; },
    readFilterValues,
    writeFilterValues,
    readAdvancedFilters,
    writeAdvancedFilters
  };
}
