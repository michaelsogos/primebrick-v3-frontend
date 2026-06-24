import type { MetaColumn } from '$lib/entity-list/types';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useSorting(options: {
  columns: MetaColumn[];
  initialSort?: { key: string; direction: 'asc' | 'desc' };
  onSortChange?: (sort: { key: string; direction: 'asc' | 'desc' } | null) => void;
}) {
  const { columns, initialSort, onSortChange } = options;

  const _state = $state({
    currentSort: (initialSort ?? null) as { key: string; direction: 'asc' | 'desc' } | null,
  });

  function handleSort(key: string) {
    const column = columns.find((c) => c.key === key);
    if (!column || !column.sortable) return;

    if (_state.currentSort?.key === key) {
      // Toggle direction
      if (_state.currentSort.direction === 'asc') {
        _state.currentSort = { key, direction: 'desc' };
      } else {
        _state.currentSort = null; // Remove sort
      }
    } else {
      // New sort, default to asc
      _state.currentSort = { key, direction: 'asc' };
    }

    onSortChange?.(_state.currentSort);
  }

  function getSortDirection(key: string): 'asc' | 'desc' | null {
    if (_state.currentSort?.key === key) {
      return _state.currentSort.direction;
    }
    return null;
  }

  function isSortable(key: string): boolean {
    const column = columns.find((c) => c.key === key);
    return column?.sortable ?? false;
  }

  function syncWithExternal(sort: { key: string; direction: 'asc' | 'desc' } | null) {
    if (JSON.stringify(_state.currentSort) !== JSON.stringify(sort)) {
      _state.currentSort = sort;
    }
  }

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    handleSort,
    getSortDirection,
    isSortable,
    syncWithExternal
  };
}
