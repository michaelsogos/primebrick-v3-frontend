import { sheetState, closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
import { useSheetPanelManagement } from './useSheetPanelManagement.svelte';
import type { MetaColumn, ViewName, AdvancedFilter } from '$lib/entity-list/types';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export interface UseSheetPanelsOptions {
  columnOrder: {
    applyColumnVisibility: (group: 'sticky' | 'data' | 'auditing', keys: string[]) => void;
  };
  columns: () => MetaColumn[];
  visibleKeys: () => string[];
  searchInKeys: () => string[] | null;
  onSearchInKeysChange: (keys: string[] | null) => void;
  onVisibleKeysChange: (keys: string[]) => void;
  onResetColumnVisibility: (view: ViewName) => void;
  filterableColumns: () => MetaColumn[];
  searchableColumns: () => MetaColumn[];
  nonAuditingColumns: () => MetaColumn[];
  auditingColumnsGroup: () => MetaColumn[];
  stickyColumnsGroup: () => MetaColumn[];
  filterValues: () => Record<string, any> | null;
  onFilterValuesChange?: (values: Record<string, any>) => void;
  onResetFilters?: () => void;
  advancedFilters: () => AdvancedFilter[] | null;
  onAdvancedFiltersChange?: (filters: AdvancedFilter[], connector: 'AND' | 'OR') => void;
  filtersOpen: () => boolean;
  setFiltersOpen: (open: boolean) => void;
  checkboxVisualOnlyClass: string;
}

export function useSheetPanels(options: UseSheetPanelsOptions) {
  const sheetPanelManagement = useSheetPanelManagement();

  function toggleSearchKey(key: string) {
    const current = options.searchInKeys();
    if (!current || current.length === 0) {
      options.onSearchInKeysChange([key]);
      return;
    }
    if (current.includes(key)) {
      const next = current.filter((k) => k !== key);
      options.onSearchInKeysChange(next.length ? next : null);
      return;
    }
    options.onSearchInKeysChange([...current, key]);
  }

  function toggleColumnKey(key: string) {
    const col = options.columns().find((c) => c.key === key);
    if (col?.hideable === false) return;

    const visible = options.visibleKeys();
    if (visible.includes(key)) {
      const next = visible.filter((k) => k !== key);
      if (next.length > 0) options.onVisibleKeysChange(next);
      return;
    }
    options.onVisibleKeysChange([...visible, key]);
  }

  // Do not `$effect`-open from `filtersOpen`: while the sheet is closing, `filtersOpen` can
  // still be true for a tick and `openSheet` runs again (infinite reopen loop).

  /** Parent can set `bind:filtersOpen={false}` to dismiss the filters sheet. */
  $effect(() => {
    void options.filtersOpen();
    void sheetState.open;
    void sheetState.panelId;
    if (!options.filtersOpen() && sheetState.open && sheetState.panelId === 'entity.filters') closeSheet();
  });

  // Keep sheet panel props reactive while open (SheetHost stores a snapshot at `openSheet()` time).
  // Without this, checkboxes in `entity.columns` / `entity.searchIn` don't visually toggle even though
  // the underlying selection changes.
  $effect(() => {
    void sheetState.open;
    void sheetState.panelId;
    void options.visibleKeys();
    void options.searchInKeys();
    void options.searchableColumns();
    void options.filterableColumns();
    void options.nonAuditingColumns();
    void options.auditingColumnsGroup();
    void options.stickyColumnsGroup();

    if (!sheetState.open) return;
    if (sheetState.panelId === 'entity.columns') {
      const stickyColumnsGroup = options.stickyColumnsGroup();
      const nonAuditingColumns = options.nonAuditingColumns();
      const auditingColumnsGroup = options.auditingColumnsGroup();
      sheetState.props = {
        stickyColumns: stickyColumnsGroup,
        nonAuditingColumns,
        auditingColumns: auditingColumnsGroup,
        visibleKeys: options.visibleKeys(),
        toggleColumnKey,
        onReorderKeys: (group: 'sticky' | 'data' | 'auditing', keys: string[]) => {
          const allowed = new Set(
            (group === 'sticky'
              ? stickyColumnsGroup
              : group === 'data'
                ? nonAuditingColumns
                : auditingColumnsGroup
            ).map((c) => c.key)
          );
          const dedup: string[] = [];
          const seen = new Set<string>();
          for (const k of keys) {
            if (!allowed.has(k)) continue;
            if (seen.has(k)) continue;
            seen.add(k);
            dedup.push(k);
          }
          options.columnOrder.applyColumnVisibility(group, dedup);
        },
        onResetColumnVisibility: () => options.onResetColumnVisibility('table'),
        sheetMenuCheckboxClass: options.checkboxVisualOnlyClass
      } as any;
      return;
    }
    if (sheetState.panelId === 'entity.searchIn') {
      sheetState.props = {
        searchInKeys: options.searchInKeys(),
        searchableColumns: options.searchableColumns(),
        onSearchInKeysChange: options.onSearchInKeysChange,
        toggleSearchKey,
        sheetMenuCheckboxClass: options.checkboxVisualOnlyClass
      } as any;
    }
    if (sheetState.panelId === 'entity.filters') {
      sheetState.props = {
        filterableColumns: options.filterableColumns(),
        filterValues: options.filterValues() ?? {},
        onFilterValuesChange: options.onFilterValuesChange,
        onResetFilters: options.onResetFilters,
        advancedFilters: options.advancedFilters() ?? [],
        onAdvancedFiltersChange: options.onAdvancedFiltersChange
      } as any;
    }
  });

  /** When the global sheet closes after showing filters, mirror that to the bindable prop. */
  $effect(() => {
    void sheetState.open;
    void sheetPanelManagement.state.lastPanelId;
    if (!sheetState.open && sheetPanelManagement.state.lastPanelId === 'entity.filters') options.setFiltersOpen(false);
  });

  return {
    get state(): DeepReadonly<{ lastPanelId: string | null }> { return sheetPanelManagement.state; },
    toggleSearchKey,
    toggleColumnKey,
  };
}
