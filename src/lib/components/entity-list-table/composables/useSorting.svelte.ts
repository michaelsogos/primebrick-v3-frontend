import type { MetaColumn } from '$lib/entity-list/types';

export interface SortingOptions {
  columns: MetaColumn[];
  initialSort?: { key: string; direction: 'asc' | 'desc' };
  onSortChange?: (sort: { key: string; direction: 'asc' | 'desc' } | null) => void;
}

export interface SortingReturn {
  currentSort: { key: string; direction: 'asc' | 'desc' } | null;
  handleSort: (key: string) => void;
  getSortDirection: (key: string) => 'asc' | 'desc' | null;
  isSortable: (key: string) => boolean;
}

export function useSorting(options: SortingOptions): SortingReturn {
  const { columns, initialSort, onSortChange } = options;

  let currentSort = $state<{ key: string; direction: 'asc' | 'desc' } | null>(
    initialSort ?? null
  );

  function handleSort(key: string) {
    const column = columns.find((c) => c.key === key);
    if (!column || !column.sortable) return;

    if (currentSort?.key === key) {
      // Toggle direction
      if (currentSort.direction === 'asc') {
        currentSort = { key, direction: 'desc' };
      } else {
        currentSort = null; // Remove sort
      }
    } else {
      // New sort, default to asc
      currentSort = { key, direction: 'asc' };
    }

    onSortChange?.(currentSort);
  }

  function getSortDirection(key: string): 'asc' | 'desc' | null {
    if (currentSort?.key === key) {
      return currentSort.direction;
    }
    return null;
  }

  function isSortable(key: string): boolean {
    const column = columns.find((c) => c.key === key);
    return column?.sortable ?? false;
  }

  return {
    currentSort,
    handleSort,
    getSortDirection,
    isSortable
  };
}
