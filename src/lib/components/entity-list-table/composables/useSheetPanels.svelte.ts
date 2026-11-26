import { SvelteSet } from 'svelte/reactivity';
import { useEntitySheetSync, nextSearchScopeKeys, defaultVisibleColumnKeys } from '$lib/entity-list';
import type { MetaColumn, ViewName, AdvancedFilter } from '$lib/entity-list/types';
import type { DeepReadonly } from '@primebrick/ui';

export interface UseSheetPanelsOptions {
  columnOrder: {
    applyColumnVisibility: (group: 'sticky' | 'data' | 'auditing', keys: string[]) => void;
  };
  /** The composed full reset (visibility + column order + sort) — REQUIRED
   *  for the columns sheet: the sync effect re-assigns `sheetState.props`
   *  from this factory on every reactive tick, so any open-time payload is
   *  overwritten and the factory is the only wiring that survives. Wiring
   *  the raw visibility-only reset here silently drops the order/sort part
   *  (user report 2026-11-26: sheet reset left the dragged order in place). */
  onResetColumnsAndSorting: () => () => void;
  columns: () => MetaColumn[];
  visibleKeys: () => string[];
  searchInKeys: () => string[] | null;
  onSearchInKeysChange: () => (keys: string[] | null) => void;
  onVisibleKeysChange: () => (keys: string[]) => void;
  entity: () => string;
  /** Owning service — REQUIRED for builtin entities (they mount on every
   *  service, so the census map is last-wins ambiguous). Same contract as
   *  the ELT root prop; threaded into the `entity.filters` sheet so
   *  audit-actor vocabularies read the owning schema. */
  service?: () => string | undefined;
  filterableColumns: () => MetaColumn[];
  searchableColumns: () => MetaColumn[];
  nonAuditingColumns: () => MetaColumn[];
  auditingColumnsGroup: () => MetaColumn[];
  stickyColumnsGroup: () => MetaColumn[];
  filterValues: () => Record<string, unknown> | null;
  onFilterValuesChange?: () => ((values: Record<string, unknown>) => void) | undefined;
  onResetFilters?: () => (() => void) | undefined;
  advancedFilters: () => AdvancedFilter[] | null;
  onAdvancedFiltersChange?: () => ((filters: AdvancedFilter[], connector: 'AND' | 'OR') => void) | undefined;
  /** Optional IANA contract — present only when the host owns
   *  `datetime_iana_toggle` columns (ELT today; dict has none). */
  datetimeIanaToggleColumns?: () => MetaColumn[];
  datetimeIanaModeByKey?: () => Record<string, 'browser' | 'record'>;
  toggleDatetimeIana?: () => (col: MetaColumn) => void;
  datetimeIanaDisabled?: () => boolean;
}

/** ELT's sheet-panel surface — declares the four `entity.*` factories on
 *  top of the shared sync contract (props stay live while a sheet is
 *  open; `filtersOpen`/`toggleFiltersSheet` are the funnel CTA pair). */
export function useSheetPanels(options: UseSheetPanelsOptions) {
  function toggleSearchKey(key: string) {
    const cb = options.onSearchInKeysChange();
    cb(nextSearchScopeKeys(options.searchInKeys(), key));
  }

  function toggleColumnKey(key: string) {
    const col = options.columns().find((c) => c.key === key);
    if (col?.hideable === false) return;

    const visible = options.visibleKeys();
    const cb = options.onVisibleKeysChange();
    if (visible.includes(key)) {
      const next = visible.filter((k) => k !== key);
      if (next.length > 0) cb(next);
      return;
    }
    cb([...visible, key]);
  }

  const sync = useEntitySheetSync({
    panels: {
      'entity.columns': () => {
        const stickyColumnsGroup = options.stickyColumnsGroup();
        const nonAuditingColumns = options.nonAuditingColumns();
        const auditingColumnsGroup = options.auditingColumnsGroup();
        return {
          stickyColumns: stickyColumnsGroup,
          nonAuditingColumns,
          auditingColumns: auditingColumnsGroup,
          visibleKeys: options.visibleKeys(),
          toggleColumnKey,
          onReorderKeys: (group: 'sticky' | 'data' | 'auditing', keys: string[]) => {
            const allowed = new SvelteSet(
              (group === 'sticky'
                ? stickyColumnsGroup
                : group === 'data'
                  ? nonAuditingColumns
                  : auditingColumnsGroup
              ).map((c) => c.key)
            );
            const dedup: string[] = [];
            const seen = new SvelteSet<string>();
            for (const k of keys) {
              if (!allowed.has(k)) continue;
              if (seen.has(k)) continue;
              seen.add(k);
              dedup.push(k);
            }
            options.columnOrder.applyColumnVisibility(group, dedup);
          },
          onResetColumnVisibility: () => options.onResetColumnsAndSorting()(),
          onSelectAll: () =>
            options.onVisibleKeysChange()(
              [...stickyColumnsGroup, ...nonAuditingColumns, ...auditingColumnsGroup].map((c) => c.key)
            ),
          // Deselect restores declared default visibility — the header
          // eraser stays the "full reset" gesture (visibility + order + sort).
          onDeselectAll: () => options.onVisibleKeysChange()(defaultVisibleColumnKeys(options.columns()))
        };
      },
      'entity.searchIn': () => ({
        searchInKeys: options.searchInKeys(),
        searchableColumns: options.searchableColumns(),
        onSearchInKeysChange: options.onSearchInKeysChange(),
        toggleSearchKey
      }),
      'entity.filters': () => ({
        entity: options.entity(),
        service: options.service?.(),
        filterableColumns: options.filterableColumns(),
        filterValues: options.filterValues() ?? {},
        onFilterValuesChange: options.onFilterValuesChange?.(),
        onResetFilters: options.onResetFilters?.(),
        advancedFilters: options.advancedFilters() ?? [],
        onAdvancedFiltersChange: options.onAdvancedFiltersChange?.()
      }),
      ...(options.datetimeIanaToggleColumns && options.toggleDatetimeIana
        ? {
            'entity.datetimeIana': () => ({
              datetimeIanaColumns: options.datetimeIanaToggleColumns!(),
              modeByKey: options.datetimeIanaModeByKey?.() ?? {},
              onToggle: options.toggleDatetimeIana!(),
              disabled: options.datetimeIanaDisabled?.() ?? false
            })
          }
        : {})
    }
  });

  return {
    get state(): DeepReadonly<{ lastPanelId: string | null }> {
      return { lastPanelId: sync.lastPanelId };
    },
    get filtersOpen() {
      return sync.filtersOpen;
    },
    toggleFiltersSheet: sync.toggleFiltersSheet,
    toggleSearchKey,
    toggleColumnKey,
  };
}
