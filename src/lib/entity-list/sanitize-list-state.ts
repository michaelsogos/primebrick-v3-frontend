/**
 * sanitize-list-state — drop persisted list criteria that no longer resolve
 * under the served meta. Restored `filterValues`/`advancedFilters`/`searchInKeys`
 * land in state BEFORE bootstrap; a single stale key poisons every subsequent
 * list call into a 400 loop (the wire now fails closed on unknown fields).
 * Sanitizing once after meta load self-heals already-poisoned profiles —
 * silently for the user, with a dev-gated console.warn for diagnosis.
 */
import {
  getOperatorsForColumnType,
  isColumnFilterable,
  searchableTextColumns,
  type AdvancedFilter,
  type MetaColumn
} from './types';

export interface SanitizableListState {
  filterValues: Record<string, unknown> | null;
  advancedFilters: AdvancedFilter[] | null;
  searchInKeys: string[] | null;
}

export interface SanitizeListStateResult {
  /** Simple-filter field keys dropped. */
  droppedFilterFields: string[];
  /** Advanced-filter ids dropped (unknown field OR operator). */
  droppedAdvancedIds: string[];
  /** `search_in` scope keys dropped. */
  droppedSearchInKeys: string[];
}

export function sanitizeListState(
  columns: MetaColumn[],
  state: SanitizableListState
): SanitizeListStateResult {
  const filterable = new Set(
    columns.filter((c) => isColumnFilterable(c)).map((c) => c.key)
  );
  const searchable = new Set(searchableTextColumns(columns).map((c) => c.key));
  const typeByKey = new Map(columns.map((c) => [c.key, c.type]));

  const droppedFilterFields: string[] = [];
  const droppedAdvancedIds: string[] = [];
  const droppedSearchInKeys: string[] = [];

  if (state.filterValues) {
    for (const key of Object.keys(state.filterValues)) {
      if (!filterable.has(key)) {
        droppedFilterFields.push(key);
        delete state.filterValues[key];
      }
    }
  }

  if (state.advancedFilters) {
    state.advancedFilters = state.advancedFilters.filter((f) => {
      const type = typeByKey.get(f.field);
      const ok =
        type !== undefined &&
        filterable.has(f.field) &&
        getOperatorsForColumnType(type).includes(f.operator);
      if (!ok) droppedAdvancedIds.push(f.id);
      return ok;
    });
  }

  if (state.searchInKeys) {
    state.searchInKeys = state.searchInKeys.filter((k) => {
      const ok = searchable.has(k);
      if (!ok) droppedSearchInKeys.push(k);
      return ok;
    });
    if (!state.searchInKeys.length) state.searchInKeys = null;
  }

  return { droppedFilterFields, droppedAdvancedIds, droppedSearchInKeys };
}
