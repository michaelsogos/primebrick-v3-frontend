<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '$lib/components/ui/input-group';
  import { Badge } from '$lib/components/ui/badge';
  import { Checkbox, checkboxVisualOnlyClass, checkboxInteractiveClass } from '$lib/components/ui/checkbox';
  import { LoadingBar } from '$lib/components/ui/loading-bar';
  import { Switch } from '$lib/components/ui/switch';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Table from '$lib/components/ui/table';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Dialog as DialogPrimitive } from 'bits-ui';
  import { scale, fade, fly } from 'svelte/transition';
  import { cn } from '$lib/utils.js';
  import { apiFetch } from '$lib/api';
  import { pushImpactError, pushRFC7807Error } from '$lib/errors/app-errors';
  import type { RFC7807Error } from '$lib/errors/rfc7807';
  import { closeSheet, openSheet, sheetState } from '$lib/shell/sheets/sheet-manager.svelte';
  import FiltersPanel from '$lib/entity-list/sheets/panels/FiltersPanel.svelte';
  import type { MetaColumn, SortDir, ListMetaViewVisibility, ViewName, AdvancedFilter } from '$lib/entity-list/types';
  import { defaultVisibleColumnKeys, formatDatetimeCellDisplay } from '$lib/entity-list';
  import { formatListCellValue } from '$lib/i18n/date-format';
  import XIcon from '@lucide/svelte/icons/x';
  import {
    SlidersHorizontal,
    Columns3,
    LayoutGrid,
    LayoutList,
    Table2,
    Search,
    ArrowUpDown,
    ArrowUpNarrowWide,
    ArrowDownWideNarrow,
    ArrowUp,
    ArrowDown,
    TriangleAlert,
    Hourglass,
    CircleX,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ChevronUp,
    RotateCw,
    RotateCcw,
    MoreVertical,
    Ban,
    Globe,
    MapPin,
    Eye,
    EyeOff,
    ListCheck,
    ListX,
    TextAlignJustify,
    FilterX,
    Pencil,
    Trash2,
    Copy,
    Download,
    Funnel
  } from 'lucide-svelte';
  import BsFiletypeXlsx from '~icons/bi/filetype-xlsx';
  import BsFiletypeCsv from '~icons/bi/filetype-csv';
  import BsFiletypeHtml from '~icons/bi/filetype-html';
  import BsFiletypePdf from '~icons/bi/filetype-pdf';
  import BsEnvelopeAt from '~icons/bi/envelope-at';
  import Choicebox from '$lib/components/ui/choicebox/choicebox.svelte';
  import ChoiceboxItem from '$lib/components/ui/choicebox/choicebox-item.svelte';
  import ChoiceboxTitle from '$lib/components/ui/choicebox/choicebox-title.svelte';
  import ChoiceboxDescription from '$lib/components/ui/choicebox/choicebox-description.svelte';
  import ChoiceboxIndicator from '$lib/components/ui/choicebox/choicebox-indicator.svelte';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import * as Dock from '$lib/components/ui/dock';
  import * as Resizable from '$lib/components/ui/resizable';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Window } from '$lib/components/ui/window';

  type CellArgs = { row: TRow; column: MetaColumn };

  let {
    uid,
    entity = 'customer',
    columns,
    stickyColumns,
    dataColumns,
    auditingColumns,
    viewVisibility,
    columnOrderStorageKey,
    defaultSort,
    pageSizeOptions: pageSizeOptionsProp,
    searchPlaceholderKey,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    rows,
    total,
    metaLoading,
    rowsLoading,
    error,
    page,
    pageSize,
    onPageChange,
    onPageSizeChange,
    search,
    onSearchInput,
    searchInKeys,
    onSearchInKeysChange,
    sortKey,
    sortDir,
    onSortChange,
    visibleKeys,
    onVisibleKeysChange,
    onResetColumnVisibility,
    selectedKeys,
    onSelectedKeysChange,
    rowSelectionEnabled = true,
    rowDensity = 'default',
    onRefresh,
    refreshDisabled = false,
    rowActionsEnabled = false,
    rowActions,
    entityRowActions,
    filtersOpen = $bindable(false),
    filterValues = {},
    onFilterValuesChange,
    onResetFilters,
    advancedFilters = [],
    onAdvancedFiltersChange,
    filterValuesStorageKey,
    advancedFiltersStorageKey,
    deletionFilterMode: deletionFilterModeProp = $bindable('non_deleted'),
    onDeletionFilterModeChange,
    datetimeIanaModeByKey = $bindable<Record<string, 'browser' | 'record'>>({}),
    datetimeIanaRenderTick = $bindable(0),
    cell,
    metaLoadingView,
    rowsLoadingView,
    emptyView,
    errorView,
    loadingMessage,
    noRecordsMessage
  }: {
    /** Meta column key whose values uniquely identify a row in the list (uuid, id, …). */
    uid: string;
    /** Entity type for API calls (e.g., 'customer', 'product') */
    entity?: string;
    /**
     * Columns to render/select in the UI.
     * - New shape (preferred): provide `stickyColumns` + `dataColumns` + `auditingColumns`
     * - Back-compat: provide `columns` only
     */
    columns: MetaColumn[];
    stickyColumns?: MetaColumn[];
    dataColumns?: MetaColumn[];
    auditingColumns?: MetaColumn[];
    viewVisibility?: ListMetaViewVisibility;
    /** Session-scoped (sessionStorage) storage key for per-group column ordering. */
    columnOrderStorageKey?: string;
    /** Session-scoped (sessionStorage) storage key for filter values. */
    filterValuesStorageKey?: string;
    /** Session-scoped (sessionStorage) storage key for advanced filters. */
    advancedFiltersStorageKey?: string;
    defaultSort?: { key: string; dir: SortDir };
    pageSizeOptions?: number[];
    searchPlaceholderKey?: string;
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;
    rows: TRow[];
    total: number;
    metaLoading: boolean;
    rowsLoading: boolean;
    error: string | null;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    search: string;
    onSearchInput: (value: string) => void;
    searchInKeys: string[] | null;
    onSearchInKeysChange: (keys: string[] | null) => void;
    sortKey: string | null;
    sortDir: SortDir;
    onSortChange: (key: string | null, dir: SortDir) => void;
    visibleKeys: string[];
    onVisibleKeysChange: (keys: string[]) => void;
    onResetColumnVisibility: (view: ViewName) => void;
    selectedKeys: string[];
    onSelectedKeysChange: (keys: string[]) => void;
    rowSelectionEnabled?: boolean;
    rowDensity?: 'default' | 'compact';
    onRefresh: () => void;
    refreshDisabled?: boolean;
    rowActionsEnabled?: boolean;
    rowActions?: Snippet<[ { row: TRow } ]>;
    entityRowActions?: {
      duplicate?: boolean;
      delete?: boolean;
      edit?: boolean;
    };
    filtersOpen?: boolean;
    filterValues?: Record<string, any>;
    onFilterValuesChange?: (values: Record<string, any>) => void;
    onResetFilters?: () => void;
    advancedFilters?: AdvancedFilter[];
    onAdvancedFiltersChange?: (filters: AdvancedFilter[], connector: 'AND' | 'OR') => void;
    deletionFilterMode?: 'non_deleted' | 'deleted' | 'all';
    onDeletionFilterModeChange?: (mode: 'non_deleted' | 'deleted' | 'all') => void;
    /** Two-way with parent when the route uses `{#snippet cell}` and must mirror IANA datetime formatting. */
    datetimeIanaModeByKey?: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick?: number;
    cell?: Snippet<[CellArgs]>;
    metaLoadingView?: Snippet;
    rowsLoadingView?: Snippet;
    emptyView?: Snippet;
    errorView?: Snippet;
    loadingMessage?: string;
    noRecordsMessage?: string;
  } = $props();

  type ColumnOrderState = {
    sticky?: string[];
    data?: string[];
    auditing?: string[];
  };

  const orderState = $state<ColumnOrderState>({});

  type ViewMode = 'table' | 'cards' | 'cards_list';
  const viewModeStorageKey = $derived(
    columnOrderStorageKey ? `${columnOrderStorageKey}:viewMode` : `pb.entityList:${uid}:viewMode`
  );
  let viewMode = $state<ViewMode>('table');

  type ToolbarMode = 'filters' | 'bulk';
  let toolbarMode = $state<ToolbarMode>('filters');

  function readViewMode(): ViewMode | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(viewModeStorageKey);
      if (raw === 'table' || raw === 'cards' || raw === 'cards_list') return raw;
      return null;
    } catch {
      return null;
    }
  }

  function writeViewMode(next: ViewMode) {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(viewModeStorageKey, next);
    } catch {
      // ignore quota / blocked storage
    }
  }

  type DeletionFilterMode = 'non_deleted' | 'deleted' | 'all';
  const deletionFilterStorageKey = $derived(
    columnOrderStorageKey ? `${columnOrderStorageKey}:deletionFilter` : `pb.entityList:${uid}:deletionFilter`
  );
  let deletionFilterMode = $state<DeletionFilterMode>(deletionFilterModeProp ?? 'non_deleted');

  function readDeletionFilter(): DeletionFilterMode | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(deletionFilterStorageKey);
      if (raw === 'non_deleted' || raw === 'deleted' || raw === 'all') return raw;
      return null;
    } catch {
      return null;
    }
  }

  function writeDeletionFilter(next: DeletionFilterMode) {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(deletionFilterStorageKey, next);
    } catch {
      // ignore quota / blocked storage
    }
  }

  function readOrderState(): ColumnOrderState {
    if (!columnOrderStorageKey) return {};
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.sessionStorage.getItem(columnOrderStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      const obj = parsed as any;
      return {
        sticky: Array.isArray(obj.sticky)
          ? obj.sticky.filter((k: unknown) => typeof k === 'string')
          : undefined,
        data: Array.isArray(obj.data) ? obj.data.filter((k: unknown) => typeof k === 'string') : undefined,
        auditing: Array.isArray(obj.auditing)
          ? obj.auditing.filter((k: unknown) => typeof k === 'string')
          : undefined
      };
    } catch {
      return {};
    }
  }

  function writeOrderState(next: ColumnOrderState) {
    if (!columnOrderStorageKey) return;
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(columnOrderStorageKey, JSON.stringify(next));
    } catch {
      // ignore quota / blocked storage
    }
  }

  const filterValuesStorageKeyFull = $derived(
    filterValuesStorageKey || (columnOrderStorageKey ? `${columnOrderStorageKey}:filterValues` : `pb.entityList:${uid}:filterValues`)
  );

  function readFilterValues(): Record<string, any> {
    if (!filterValuesStorageKey && !columnOrderStorageKey) return {};
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
    if (!filterValuesStorageKey && !columnOrderStorageKey) return;
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(filterValuesStorageKeyFull, JSON.stringify(next));
    } catch {
      // ignore quota / blocked storage
    }
  }

  const advancedFiltersStorageKeyFull = $derived(
    advancedFiltersStorageKey || (columnOrderStorageKey ? `${columnOrderStorageKey}:advancedFilters` : `pb.entityList:${uid}:advancedFilters`)
  );

  function readAdvancedFilters(): AdvancedFilter[] {
    if (!advancedFiltersStorageKey && !columnOrderStorageKey) return [];
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
    if (!advancedFiltersStorageKey && !columnOrderStorageKey) return;
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(advancedFiltersStorageKeyFull, JSON.stringify(next));
    } catch {
      // ignore quota / blocked storage
    }
  }

  function resetColumnsAndSorting() {
    onResetColumnVisibility('table');
    // Reset column visual order (sticky/data/auditing) to default meta order.
    orderState.sticky = undefined;
    orderState.data = undefined;
    orderState.auditing = undefined;
    writeOrderState({});
    // Reset sorting to default
    if (defaultSort?.key) onSortChange(defaultSort.key, defaultSort.dir ?? defaultSortDir);
    else onSortChange(null, defaultSortDir);
  }

  function resetFilters() {
    onFilterValuesChange?.({});
    onAdvancedFiltersChange?.([], 'AND');
    onResetFilters?.();
    writeFilterValues({});
    writeAdvancedFilters([]);
  }

  function applyKeyOrder(cols: MetaColumn[], keys: string[] | undefined): MetaColumn[] {
    if (!keys || keys.length === 0) return cols;
    const byKey = new Map(cols.map((c) => [c.key, c] as const));
    const out: MetaColumn[] = [];
    const used = new Set<string>();
    for (const k of keys) {
      const c = byKey.get(k);
      if (!c) continue;
      out.push(c);
      used.add(k);
    }
    for (const c of cols) {
      if (used.has(c.key)) continue;
      out.push(c);
    }
    return out;
  }

  function moveKeyWithin(keys: string[], fromKey: string, toKey: string): string[] {
    if (fromKey === toKey) return keys;
    const fromIdx = keys.indexOf(fromKey);
    const toIdx = keys.indexOf(toKey);
    if (fromIdx < 0 || toIdx < 0) return keys;
    const next = keys.slice();
    next.splice(fromIdx, 1);
    const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
    next.splice(insertAt, 0, fromKey);
    return next;
  }

  function reorderGroup(group: 'data' | 'auditing', fromKey: string, toKey: string) {
    const base =
      group === 'data'
        ? (dataColumns ?? nonAuditingColumns).map((c) => c.key)
        : (auditingColumnsGroup ?? []).map((c) => c.key);
    const cur = group === 'data' ? (orderState.data ?? base) : (orderState.auditing ?? base);
    const nextKeys = moveKeyWithin(cur, fromKey, toKey);
    const nextState: ColumnOrderState =
      group === 'data' ? { ...orderState, data: nextKeys } : { ...orderState, auditing: nextKeys };
    orderState.data = nextState.data;
    orderState.auditing = nextState.auditing;
    writeOrderState(nextState);
  }

  onMount(() => {
    const loaded = readOrderState();
    orderState.sticky = loaded.sticky;
    orderState.data = loaded.data;
    orderState.auditing = loaded.auditing;

    const storedMode = readViewMode();
    if (storedMode) viewMode = storedMode;

    const storedDeletionFilter = readDeletionFilter();
    if (storedDeletionFilter) deletionFilterMode = storedDeletionFilter;

    // Initialize filters from sessionStorage. Only fire the callback when the stored
    // values actually differ from the current prop, to avoid an unnecessary refresh
    // when the parent already holds the same values (e.g. after a page refresh where
    // bootstrap already loaded rows with the restored filters).
    const storedFilterValues = readFilterValues();
    if (
      Object.keys(storedFilterValues).length > 0 &&
      JSON.stringify(storedFilterValues) !== JSON.stringify(filterValues ?? {})
    ) {
      onFilterValuesChange?.(storedFilterValues);
    }

    const storedAdvancedFilters = readAdvancedFilters();
    if (
      storedAdvancedFilters.length > 0 &&
      JSON.stringify(storedAdvancedFilters) !== JSON.stringify(advancedFilters ?? [])
    ) {
      onAdvancedFiltersChange?.(storedAdvancedFilters, 'AND');
    }
  });

  $effect(() => {
    void viewMode;
    writeViewMode(viewMode);
  });

  let lastDeletionFilterMode: typeof deletionFilterMode | null = null;
  $effect(() => {
    void deletionFilterMode;
    writeDeletionFilter(deletionFilterMode);
    // Skip the initial firing so we don't trigger an extra refresh on mount when the
    // value didn't actually change (the parent already holds the same value).
    if (lastDeletionFilterMode !== null && lastDeletionFilterMode !== deletionFilterMode) {
      onDeletionFilterModeChange?.(deletionFilterMode);
    }
    lastDeletionFilterMode = deletionFilterMode;
  });

  $effect(() => {
    void filterValues;
    writeFilterValues(filterValues ?? {});
  });

  $effect(() => {
    void advancedFilters;
    writeAdvancedFilters(advancedFilters ?? []);
  });

  // Automatic toolbar mode switching based on filters and selection
  let lastSelectionChange = $state(0);
  let lastFilterChange = $state(0);

  $effect(() => {
    void selectedKeys;
    lastSelectionChange = Date.now();
  });

  $effect(() => {
    void filterValues;
    void advancedFilters;
    lastFilterChange = Date.now();
  });

  $effect(() => {
    void lastSelectionChange;
    void lastFilterChange;
    void hasAppliedFilters;

    // If selection changed more recently than filters, show bulk
    if (lastSelectionChange > lastFilterChange) {
      toolbarMode = 'bulk';
    } else if (hasAppliedFilters) {
      toolbarMode = 'filters';
    } else {
      toolbarMode = 'bulk';
    }
  });

  // Bridge the legacy `filtersOpen` boolean to the global SheetHost.
  let lastPanelId = $state<string | null>(null);
  $effect(() => {
    if (sheetState.panelId) lastPanelId = sheetState.panelId;
  });

  // Do not `$effect`-open from `filtersOpen`: while the sheet is closing, `filtersOpen` can
  // still be true for a tick and `openSheet` runs again (infinite reopen loop).

  /** Parent can set `bind:filtersOpen={false}` to dismiss the filters sheet. */
  $effect(() => {
    void filtersOpen;
    void sheetState.open;
    void sheetState.panelId;
    if (!filtersOpen && sheetState.open && sheetState.panelId === 'entity.filters') closeSheet();
  });

  // Keep sheet panel props reactive while open (SheetHost stores a snapshot at `openSheet()` time).
  // Without this, checkboxes in `entity.columns` / `entity.searchIn` don't visually toggle even though
  // the underlying selection changes.
  $effect(() => {
    void sheetState.open;
    void sheetState.panelId;
    void visibleKeys;
    void searchInKeys;
    void searchableColumns;
    void filterableColumns;
    void nonAuditingColumns;
    void auditingColumnsGroup;
    void stickyColumnsGroup;

    if (!sheetState.open) return;
    if (sheetState.panelId === 'entity.columns') {
      sheetState.props = {
        stickyColumns: stickyColumnsGroup,
        nonAuditingColumns,
        auditingColumns: auditingColumnsGroup,
        visibleKeys,
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
          const nextState: ColumnOrderState =
            group === 'sticky'
              ? { ...orderState, sticky: dedup }
              : group === 'data'
                ? { ...orderState, data: dedup }
                : { ...orderState, auditing: dedup };
          orderState.data = nextState.data;
          orderState.auditing = nextState.auditing;
          orderState.sticky = nextState.sticky;
          writeOrderState(nextState);
        },
        onResetColumnVisibility: () => onResetColumnVisibility('table'),
        sheetMenuCheckboxClass: checkboxVisualOnlyClass,
        t: $t
      } as any;
      return;
    }
    if (sheetState.panelId === 'entity.searchIn') {
      sheetState.props = {
        searchInKeys,
        searchableColumns,
        onSearchInKeysChange,
        toggleSearchKey,
        sheetMenuCheckboxClass: checkboxVisualOnlyClass
      } as any;
    }
    if (sheetState.panelId === 'entity.filters') {
      sheetState.props = {
        filterableColumns,
        filterValues: filterValues ?? {},
        onFilterValuesChange,
        onResetFilters,
        advancedFilters: advancedFilters ?? [],
        onAdvancedFiltersChange
      } as any;
    }
  });

  /** When the global sheet closes after showing filters, mirror that to the bindable prop. */
  $effect(() => {
    void sheetState.open;
    void lastPanelId;
    if (!sheetState.open && lastPanelId === 'entity.filters') filtersOpen = false;
  });

  const compactRows = $derived(rowDensity === 'compact');
  const rowChromeH = $derived(compactRows ? 'h-6' : 'h-10');
  /** Use `thead th` / `tbody td` selectors — attribute-based [&_[data-slot=…]] variants are unreliable in Tailwind. */
  const tableDensityClass = $derived(
    compactRows
      ? '[&_th]:h-6! [&_th]:py-1 [&_th]:text-xs [&_tbody_td]:py-1.5! [&_tbody_td]:text-sm'
      : ''
  );

  // Panels are mounted via global SheetHost; keep local boolean state only for the optional `filters` slot.

  function toggleDatetimeIana(col: MetaColumn) {
    const cur = datetimeIanaModeByKey[col.key] ?? 'browser';
    const next: 'browser' | 'record' = cur === 'browser' ? 'record' : 'browser';
    datetimeIanaModeByKey = { ...datetimeIanaModeByKey, [col.key]: next };
    datetimeIanaRenderTick++;
  }

  function isBlankish(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (typeof value === 'number') return false;
    if (typeof value === 'boolean') return false;
    return false;
  }

  /**
   * Card view empty-state detection.
   *
   * Note: when a route provides `{#snippet cell}`, we cannot reliably infer rendered emptiness;
   * in that case we only apply this heuristic for scalar-ish values on the row key.
   */
  function isCardFieldEmpty(row: TRow, col: MetaColumn): boolean {
    const r = row as Record<string, unknown>;
    const raw = r[col.key];

    if (col.type === 'datetime' && col.datetimeIanaToggle) {
      const mode = datetimeIanaModeByKey[col.key] ?? 'browser';
      const parts = formatDatetimeCellDisplay(col, r, $uiLang, mode);
      const textEmpty = parts.text.trim().length === 0;
      // In record mode we may show an IANA badge even if the datetime text is empty; treat as non-empty.
      if (isDatetimeIanaRecordMode(col) && parts.iana && parts.iana.trim().length > 0) return false;
      return textEmpty;
    }

    if (cell) {
      return isBlankish(raw);
    }

    if (isBlankish(raw)) return true;

    const formatted = formatListCellValue(col, raw, $uiLang).trim();
    return formatted.length === 0;
  }

  /** Top-align cells that stack datetime value + IANA badge. */
  function entityListDataCellValignClass(col: MetaColumn): string | undefined {
    return col.datetimeIanaToggle ? 'align-top' : undefined;
  }

  /** Amber tint only when showing the record’s stored IANA timezone; browser/local mode uses default neutral like other columns. */
  function isDatetimeIanaRecordMode(col: MetaColumn): boolean {
    if (col.type !== 'datetime' || !col.datetimeIanaToggle) return false;
    return (datetimeIanaModeByKey[col.key] ?? 'browser') === 'record';
  }

  /**
   * Datetime columns with IANA toggle: light header band above body (`amber-100` vs cell `amber-50`).
   * Dark: same **Tailwind amber** ramp as body (`amber-950`).
   * `Table.Row` applies `[&>th]:[…]:hover:bg-muted`; repeat the same bg on `hover:` with `!` so the
   * header does not grey out on row hover (hover tint stays on body cells only).
   */
  function datetimeIanaHeadHighlightClass(col: MetaColumn): string | undefined {
    if (!isDatetimeIanaRecordMode(col)) return undefined;
    return 'bg-amber-100! hover:bg-amber-100! dark:bg-amber-950! dark:hover:bg-amber-950!';
  }

  /**
   * Datetime IANA body cells: amber palette only in record (stored timezone) mode. Browser mode: no classes here
   * (standard neutral interaction applies). Light: 50→100 hover, 200→300 when row selected.
   * Dark (Tailwind amber): base `950` → hover `900` → selected `800` → selected+hover `700`.
   */
  function datetimeIanaCellHighlightClass(col: MetaColumn, rowSelected: boolean): string | undefined {
    if (!isDatetimeIanaRecordMode(col)) return undefined;
    if (rowSelected) {
      return 'bg-amber-200/95! dark:bg-amber-800! transition-colors group-hover/entity-row:bg-amber-300/95! dark:group-hover/entity-row:bg-amber-700!';
    }
    return 'bg-amber-50! dark:bg-amber-950! transition-colors group-hover/entity-row:bg-amber-100/95! dark:group-hover/entity-row:bg-amber-900!';
  }

  /** Card view: highlight datetime+IANA fields when record (IANA locale) mode is active. */
  function datetimeIanaCardFieldHighlightClass(col: MetaColumn, rowSelected: boolean): string | undefined {
    if (!isDatetimeIanaRecordMode(col)) return undefined;
    if (rowSelected) {
      return 'rounded-md border border-amber-300/70 bg-amber-200/70 p-2 transition-colors group-hover:bg-amber-300/75 dark:border-amber-700 dark:bg-amber-800 dark:group-hover:bg-amber-700';
    }
    return 'rounded-md border border-amber-200/70 bg-amber-50/70 p-2 transition-colors group-hover:bg-amber-100/80 dark:border-amber-900 dark:bg-amber-950 dark:group-hover:bg-amber-900';
  }

  /**
   * Checkbox / actions (dark): base `900`, hover `800`, selected `700`, selected+hover `600` — same ramp as sticky uuid/code body.
   */
  function entityListGrayChromeCellClass(rowSelected: boolean): string {
    return rowSelected
      ? 'bg-neutral-300! dark:bg-neutral-700! transition-colors group-hover/entity-row:bg-neutral-400! dark:group-hover/entity-row:bg-neutral-600!'
      : 'bg-neutral-100 dark:bg-neutral-900 transition-colors group-hover/entity-row:bg-neutral-200 dark:group-hover/entity-row:bg-neutral-800';
  }

  /**
   * Destructive background for deleted rows (light red): base `100`, hover `200`, selected `300`, selected+hover `400`.
   * Dark: base `900`, hover `800`, selected `700`, selected+hover `600`.
   */
  function entityListDestructiveChromeCellClass(rowSelected: boolean): string {
    return rowSelected
      ? 'bg-rose-300! dark:bg-rose-700! transition-colors group-hover/entity-row:bg-rose-400! dark:group-hover/entity-row:bg-rose-600!'
      : 'bg-rose-100! dark:bg-rose-900! transition-colors group-hover/entity-row:bg-rose-200! dark:group-hover/entity-row:bg-rose-800!';
  }

  /**
   * Sticky uuid/code body overlay (dark, not IANA): base from `stickyCellClass`; hover `800`; selected `700` / `600`.
   */
  function entityListGrayBandStickyInteractionClass(rowSelected: boolean): string {
    return rowSelected
      ? 'bg-neutral-300! dark:bg-neutral-700! transition-colors group-hover/entity-row:bg-neutral-400! dark:group-hover/entity-row:bg-neutral-600!'
      : 'transition-colors group-hover/entity-row:bg-neutral-200 dark:group-hover/entity-row:bg-neutral-800';
  }

  /**
   * Destructive sticky uuid/code body overlay for deleted rows: base `200`, hover `300`, selected `400` / `500` (slightly darker than chrome).
   * Dark: base `800`, hover `700`, selected `600` / `500`.
   */
  function entityListDestructiveBandStickyInteractionClass(rowSelected: boolean): string {
    return rowSelected
      ? 'bg-rose-400! dark:bg-rose-600! transition-colors group-hover/entity-row:bg-rose-500! dark:group-hover/entity-row:bg-rose-500!'
      : 'bg-rose-200! dark:bg-rose-800! transition-colors group-hover/entity-row:bg-rose-300! dark:group-hover/entity-row:bg-rose-700!';
  }

  /**
   * Normal (non-sticky) scroll cells — **not** IANA record (IANA uses its own ramp). Light unchanged.
   * Dark: rest `950`, hover `900`, selected `900`, selected+hover `800` (sticky selected resta `700`/`600`).
   */
  function entityListDefaultScrollInteractionClass(rowSelected: boolean): string | undefined {
    if (rowSelected) {
      return 'transition-colors bg-neutral-100! dark:bg-neutral-900! group-hover/entity-row:bg-neutral-200! dark:group-hover/entity-row:bg-neutral-800!';
    }
    return 'dark:bg-neutral-950! transition-colors group-hover/entity-row:bg-neutral-50! dark:group-hover/entity-row:bg-neutral-900!';
  }

  /**
   * Destructive scroll cells for deleted rows: base `100`, hover `200`, selected `300`, selected+hover `400`.
   * Dark: base `900`, hover `800`, selected `700`, selected+hover `600`.
   */
  function entityListDestructiveScrollInteractionClass(rowSelected: boolean): string | undefined {
    if (rowSelected) {
      return 'transition-colors bg-rose-300! dark:bg-rose-700! group-hover/entity-row:bg-rose-400! dark:group-hover/entity-row:bg-rose-600!';
    }
    return 'bg-rose-100! dark:bg-rose-900! transition-colors group-hover/entity-row:bg-rose-200! dark:group-hover/entity-row:bg-rose-800!';
  }

  function isRowDeleted(row: TRow): boolean {
    return 'deleted_at' in row && row.deleted_at !== null && row.deleted_at !== undefined;
  }

  let rowRangeMouseDown = $state(false);
  let rangeAnchorIndex = $state<number | null>(null);
  let rangeDragActive = $state(false);
  let lastRangeEndIndex = $state<number | null>(null);
  /** Selection at mousedown; current drag applies symmetric diff with the active range vs this snapshot. */
  let selectionSnapshotAtMouseDown: Set<string> | null = null;
  /** After a range brush drag, suppress the following `click` on the row (same gesture as mouseup). */
  let skipNextRowClickSelectToggle = false;
  /** Row dropdown menu state: which row has the menu open */
  let dropdownMenuRow = $state<TRow | null>(null);

  /** Delete confirmation dialog state */
  let deleteConfirmDialogOpen = $state(false);
  let rowToDelete: TRow | null = null;
  let isDeleting = $state(false);

  /** Bulk delete confirmation dialog state */
  let bulkDeleteConfirmDialogOpen = $state(false);
  let isBulkDeleting = $state(false);

  /** Export confirmation dialog state */
  let exportConfirmDialogOpen = $state(false);
  let exportFileType = $state<'xlsx' | 'csv' | null>(null);
  let isExporting = $state(false);
  let exportScope = $state<'selected' | 'all'>('selected');

  /** HTML export confirmation dialog state */
  let htmlExportConfirmDialogOpen = $state(false);
  let isHtmlExporting = $state(false);
  let htmlExportScope = $state<'selected' | 'all'>('selected');

  /** HTML preview dialog state */
  let htmlPreviewDialogOpen = $state(false);
  let htmlPreviewContent = $state('');
  let previewMode = $state<'html' | 'pdf' | 'email'>('html');
  let pdfBlobUrl = $state<string | null>(null);
  let emailHtmlContent = $state('');
  let isEmailPreparing = $state(false);
  let emailCopied = $state(false);

  /** Duplicate confirmation dialog state */
  let duplicateConfirmDialogOpen = $state(false);
  let isDuplicating = $state(false);
  let duplicateScope = $state<'selected' | 'single'>('selected');
  let singleRowToDuplicate: TRow | null = null;

  /** Open dropdown menu for a specific row */
  function openRowDropdown(row: TRow) {
    dropdownMenuRow = row;
  }

  /** Close dropdown menu */
  function closeRowDropdown() {
    dropdownMenuRow = null;
  }

  /** Handle edit action for a row */
  function handleEditRow(row: TRow) {
    // TODO: Implement edit action - will be connected to BE later
    console.log('Edit row:', rowKey(row));
    closeRowDropdown();
  }

  /** Handle delete action for a row */
  function handleDeleteRow(row: TRow) {
    // Open confirmation dialog instead of deleting directly
    rowToDelete = row;
    deleteConfirmDialogOpen = true;
    closeRowDropdown();
  }

  /** Confirm delete action after dialog confirmation */
  async function confirmDeleteRow() {
    if (!rowToDelete) return;
    try {
      const uuidValue = rowToDelete[uid] as string;
      await apiFetch(`/api/v1/entities/${entity}/${uuidValue}`, {
        method: 'DELETE'
      });
      deleteConfirmDialogOpen = false;
      rowToDelete = null;
      // Refresh the list after successful deletion
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Delete failed:', error);
      // Keep dialog open on error
    }
  }

  /** Cancel delete action */
  function cancelDeleteRow() {
    deleteConfirmDialogOpen = false;
    rowToDelete = null;
  }

  /** Bulk action handlers */
  function handleBulkDelete() {
    // Open confirmation dialog instead of deleting directly
    bulkDeleteConfirmDialogOpen = true;
  }

  /** Confirm bulk delete action after dialog confirmation */
  async function confirmBulkDelete() {
    if (selectedKeys.length === 0) return;
    try {
      isBulkDeleting = true;
      const res = await apiFetch(`/api/v1/entities/${entity}/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uuids: selectedKeys })
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({ title: 'Unknown error', status: res.status, detail: 'Unknown error' })) as {
          title?: string;
          status?: number;
          detail?: string;
          instance?: string;
          internal_code?: string;
        };
        
        const toneForImpact = 'danger'; // HIGH impact uses danger
        throw {
          title: data.title || 'Bulk delete failed',
          status: data.status,
          detail: data.detail,
          instance: data.instance,
          internal_code: data.internal_code,
          toneForImpact
        };
      }
      
      // Clear selection after successful deletion
      selectedKeys = [];
      // Switch back to filters mode
      toolbarMode = 'filters';
      // Refresh the list after successful deletion
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Bulk delete failed:', error);
      
      // Show error notification using shell's error handling with RFC 7807 format
      if (error && typeof error === 'object' && 'title' in error) {
        const err = error as RFC7807Error;
        pushRFC7807Error(err, { showToast: true });
      } else {
        pushImpactError({
          impact: 'MEDIUM',
          messageKey: 'entities.list.bulkDeleteFailed',
          scope: $t('errors.scope.bulkDeleteApi'),
          detail: error instanceof Error ? error.message : String(error),
          toast: true,
        });
      }
    } finally {
      isBulkDeleting = false;
      // Close dialog regardless of success or error
      bulkDeleteConfirmDialogOpen = false;
    }
  }

  /** Cancel bulk delete action */
  function cancelBulkDelete() {
    bulkDeleteConfirmDialogOpen = false;
  }

  /** Confirm export action after dialog confirmation */
  async function confirmExportRow() {
    if (!exportFileType) return;
    try {
      isExporting = true;
      
      // Build query parameters from current filters, search, sort
      const params = new URLSearchParams();
      params.append('file_type', exportFileType);
      
      if (search) params.append('search', search);
      if (searchInKeys) params.append('search_in', searchInKeys.join(','));
      if (sortKey) params.append('sort_key', sortKey);
      if (sortDir) params.append('sort_dir', sortDir);
      
      // Build filters array (same format as loadRows)
      let filterIdx = 0;
      
      // Add regular filter values
      if (filterValues && Object.keys(filterValues).length > 0) {
        for (const [field, value] of Object.entries(filterValues)) {
          if (value !== undefined && value !== null && value !== '') {
            const col = columns.find(c => c.key === field);
            const op = col?.type === 'text' ? 'ILIKE' : '=';
            
            // Handle multi-select (array) values for badge fields
            if (col?.type === 'badge' && Array.isArray(value)) {
              for (let i = 0; i < value.length; i++) {
                params.set(`filters[${filterIdx}][field]`, field);
                params.set(`filters[${filterIdx}][op]`, op);
                params.set(`filters[${filterIdx}][value]`, String(value[i]));
                const connector = i < value.length - 1 ? 'OR' : 'AND';
                params.set(`filters[${filterIdx}][connector]`, connector);
                filterIdx++;
              }
            } else {
              params.set(`filters[${filterIdx}][field]`, field);
              params.set(`filters[${filterIdx}][op]`, op);
              params.set(`filters[${filterIdx}][value]`, String(value));
              params.set(`filters[${filterIdx}][connector]`, 'AND');
              filterIdx++;
            }
          }
        }
      }
      
      // Add advanced filters
      if (advancedFilters && advancedFilters.length > 0) {
        for (const filter of advancedFilters) {
          if (filter.field && filter.value !== undefined && filter.value !== null && filter.value !== '') {
            params.set(`filters[${filterIdx}][field]`, filter.field);
            
            let operator: string = filter.operator;
            let value = filter.value;
            
            // Handle BETWEEN operator with start/end values
            if (operator === 'BETWEEN' && typeof value === 'object' && 'start' in value && 'end' in value) {
              params.set(`filters[${filterIdx}][op]`, operator);
              params.set(`filters[${filterIdx}][value][start]`, String(value.start));
              params.set(`filters[${filterIdx}][value][end]`, String(value.end));
              filterIdx++;
              continue;
            }
            
            // Map frontend operators to backend-supported operators
            if (Array.isArray(value)) {
              operator = operator === '!=' ? 'NOT IN' : 'IN';
            } else if (operator === 'startsWith') {
              operator = 'ILIKE';
              value = `${value}%`;
            } else if (operator === 'endsWith') {
              operator = 'ILIKE';
              value = `%${value}`;
            } else if (operator === 'contains') {
              operator = 'ILIKE';
              value = `%${value}%`;
            }
            
            params.set(`filters[${filterIdx}][op]`, operator);
            
            // Handle array values for badge fields
            if (Array.isArray(value)) {
              for (const val of value) {
                params.append(`filters[${filterIdx}][value][]`, String(val));
              }
            } else {
              params.set(`filters[${filterIdx}][value]`, String(value));
            }
            
            filterIdx++;
          }
        }
      }
      
      // Add UID filter if exporting selected only
      if (exportScope === 'selected' && selectedKeys.length > 0) {
        params.set(`filters[${filterIdx}][field]`, uid);
        params.set(`filters[${filterIdx}][op]`, 'IN');
        for (const key of selectedKeys) {
          params.append(`filters[${filterIdx}][value][]`, key);
        }
        params.set(`filters[${filterIdx}][connector]`, 'AND');
      }
      
      // Add locale and timezone
      params.append('locale', $uiLang);
      params.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
      
      // Trigger file download
      const response = await apiFetch(`/api/v1/entities/${entity}/export?${params.toString()}`);
      
      if (!response.ok) {
        // Read RFC 7807 compliant error response
        const errorData = await response.json();
        throw errorData;
      }
      
      // Get the blob and create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${entity}-export-${new Date().toISOString().replace(/[:.]/g, '-')}.${exportFileType}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      exportConfirmDialogOpen = false;
      exportFileType = null;
    } catch (error) {
      console.error('Export failed:', error);
      // Handle RFC 7807 compliant error response
      const errorData = error as RFC7807Error;
      pushRFC7807Error(errorData, { showToast: true });
    } finally {
      isExporting = false;
      // Close dialog regardless of success or error
      exportConfirmDialogOpen = false;
    }
  }

  /** Cancel export action */
  function cancelExportRow() {
    exportConfirmDialogOpen = false;
    exportFileType = null;
  }

  function handleBulkDuplicate() {
    if (selectedKeys.length > 50) {
      pushImpactError({
        impact: 'MEDIUM',
        messageKey: 'entities.list.duplicateMaxLimit',
        scope: $t('errors.scope.duplicateAction'),
        toast: true
      });
      return;
    }
    duplicateScope = 'selected';
    duplicateConfirmDialogOpen = true;
  }

  function handleDuplicateRow(row: TRow) {
    singleRowToDuplicate = row;
    duplicateScope = 'single';
    duplicateConfirmDialogOpen = true;
    closeRowDropdown();
  }

  async function confirmDuplicate() {
    try {
      isDuplicating = true;
      const uuids = duplicateScope === 'single'
        ? [rowKey(singleRowToDuplicate!)]
        : selectedKeys;
      const response = await apiFetch(`/api/v1/entities/${entity}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuids })
      });
      if (!response.ok) {
        const errorData = await response.json() as RFC7807Error & { duplicateResults?: { successful: string[]; failed: Array<{ uuid: string; error: string }> } };
        // Include duplicateResults as extra field for the error panel
        const enhancedError = { ...errorData, duplicateResults: errorData.duplicateResults };
        pushRFC7807Error(enhancedError, { showToast: true });
        throw enhancedError;
      }
      const result = await response.json() as { uuids: string[]; errors: Array<{ uuid: string; error: string }> };
      if (result.errors.length > 0) {
        pushImpactError({
          impact: 'MEDIUM',
          messageKey: 'entities.list.duplicatePartialSuccess',
          messageParams: { count: result.uuids.length, failed: result.errors.length },
          scope: $t('errors.scope.duplicateApi')
        });
      } else {
        pushImpactError({
          impact: 'LOW',
          messageKey: 'entities.list.duplicateSuccess',
          messageParams: { count: result.uuids.length },
          scope: $t('errors.scope.duplicateApi')
        });
      }

      // Refresh the list
      onRefresh();

      duplicateConfirmDialogOpen = false;
    } catch (error) {
      console.error('Duplicate failed:', error);
      // Error already handled by pushRFC7807Error above
    } finally {
      isDuplicating = false;
      duplicateConfirmDialogOpen = false;
    }
  }

  function cancelDuplicate() {
    duplicateConfirmDialogOpen = false;
    singleRowToDuplicate = null;
  }

  function handleBulkExport() {
    exportFileType = null;
    exportScope = selectedKeys.length > 0 ? 'selected' : 'all';
    exportConfirmDialogOpen = true;
  }

  function handleHtmlExport() {
    htmlExportScope = selectedKeys.length > 0 ? 'selected' : 'all';
    htmlExportConfirmDialogOpen = true;
  }

  function cancelHtmlExport() {
    htmlExportConfirmDialogOpen = false;
  }

  async function confirmHtmlExport() {
    try {
      isHtmlExporting = true;
      
      // Build query parameters from current filters, search, sort
      const params = new URLSearchParams();
      params.append('file_type', 'html');
      
      if (search) params.append('search', search);
      if (searchInKeys) params.append('search_in', searchInKeys.join(','));
      if (sortKey) params.append('sort_key', sortKey);
      if (sortDir) params.append('sort_dir', sortDir);
      
      // Build filters array (same format as loadRows)
      let filterIdx = 0;
      const filters: Record<string, any> = {};
      if (filterValues) {
        for (const [key, value] of Object.entries(filterValues)) {
          if (value !== null && value !== undefined && value !== '') {
            const col = columns.find(c => c.key === key);
            const op = col?.type === 'text' ? 'ILIKE' : '=';
            filters[`filter[${filterIdx}].field`] = key;
            filters[`filter[${filterIdx}].operator`] = op;
            filters[`filter[${filterIdx}].value`] = value;
            filterIdx++;
          }
        }
      }
      
      // Add advanced filters
      if (advancedFilters && advancedFilters.length > 0) {
        advancedFilters.forEach((filter, idx) => {
          filters[`filter[${filterIdx}].field`] = filter.field;
          filters[`filter[${filterIdx}].operator`] = filter.operator;
          filters[`filter[${filterIdx}].value`] = filter.value;
          filterIdx++;
        });
      }
      
      // Add scope (selected vs all)
      if (htmlExportScope === 'selected' && selectedKeys.length > 0) {
        params.append('uuids', selectedKeys.join(','));
      }
      
      // Add deletion filter mode
      if (deletionFilterMode !== 'non_deleted') {
        params.append('deletion_filter_mode', deletionFilterMode);
      }
      
      // Add all filter parameters
      Object.entries(filters).forEach(([key, value]) => {
        params.append(key, value);
      });
      
      const response = await apiFetch(`/api/v1/entities/${entity}/export?${params.toString()}`);
      
      if (!response.ok) {
        // Read RFC 7807 compliant error response
        const errorData = await response.json();
        throw errorData;
      }
      
      // Get HTML content as text
      const htmlContent = await response.text();
      
      // Show preview dialog
      htmlPreviewContent = htmlContent;
      htmlPreviewDialogOpen = true;
      
      htmlExportConfirmDialogOpen = false;
    } catch (error) {
      console.error('HTML export failed:', error);
      const errorData = error as RFC7807Error;
      pushRFC7807Error(errorData, { showToast: true });
    } finally {
      isHtmlExporting = false;
      htmlExportConfirmDialogOpen = false;
    }
  }

  function closeHtmlPreview() {
    htmlPreviewDialogOpen = false;
    htmlPreviewContent = '';
  }

  async function copyHtmlToClipboard() {
    try {
      const blobHtml = new Blob([htmlPreviewContent], { type: 'text/html' });
      const plainText = htmlPreviewContent.replace(/<[^>]*>/g, '');
      const blobPlain = new Blob([plainText], { type: 'text/plain' });
      
      const clipboardItem = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobPlain
      });
      
      await navigator.clipboard.write([clipboardItem]);
    } catch (err) {
      console.error('Advanced clipboard copy failed, falling back to plain text:', err);
      navigator.clipboard.writeText(htmlPreviewContent);
    }
  }

  async function generatePdfPreview() {
    previewMode = 'pdf';
    pdfBlobUrl = null;

    try {
      const html2pdf = await import('html2pdf.js');
      const element = document.createElement('div');
      element.innerHTML = htmlPreviewContent;

      const opt = {
        margin: 10,
        filename: `${entity}-export.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };

      // Generate PDF as binary blob instead of downloading
      const worker = html2pdf.default().set(opt).from(element);
      const pdfBlob = await worker.output('blob');
      pdfBlobUrl = URL.createObjectURL(pdfBlob);
    } catch (error) {
      console.error('PDF generation failed:', error);
      previewMode = 'html';
    }
  }

  async function downloadPdf() {
    if (!pdfBlobUrl) return;

    const a = document.createElement('a');
    a.href = pdfBlobUrl;
    a.download = `${entity}-export.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function prepareEmailHtml() {
    previewMode = 'email';
    isEmailPreparing = true;
    emailHtmlContent = '';
    emailCopied = false;
    
    try {
      // 1. Sanitize with DOMPurify
      const DOMPurify = await import('dompurify');
      const sanitized = (DOMPurify as any).sanitize(htmlPreviewContent);
      
      // 2. Inline CSS with inline-css
      const inlineCss = await import('inline-css');
      const options = {
        url: ' ',
        applyStyleTags: true,
        removeStyleTags: true,
        applyLinkTags: false,
        preserveMediaQueries: true
      };
      
      const optimized = await (inlineCss as any).default(sanitized, options);
      emailHtmlContent = optimized;
    } catch (error) {
      console.error('Email HTML preparation failed:', error);
      emailHtmlContent = htmlPreviewContent;
    } finally {
      isEmailPreparing = false;
    }
  }

  async function copyEmailHtmlToClipboard() {
    try {
      const blobHtml = new Blob([emailHtmlContent], { type: 'text/html' });
      const plainText = emailHtmlContent.replace(/<[^>]*>/g, '');
      const blobPlain = new Blob([plainText], { type: 'text/plain' });
      
      const clipboardItem = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobPlain
      });
      
      await navigator.clipboard.write([clipboardItem]);
    } catch (err) {
      console.error('Advanced clipboard copy failed, falling back to plain text:', err);
      navigator.clipboard.writeText(emailHtmlContent);
    }
    
    emailCopied = true;
    setTimeout(() => {
      emailCopied = false;
    }, 2000);
  }

  /** Toggle toolbar mode between filters and bulk */
  function toggleToolbarMode() {
    toolbarMode = toolbarMode === 'filters' ? 'bulk' : 'filters';
  }

  const defaultSortDir = $derived(defaultSort?.dir ?? 'asc');
  const effectiveSortKey = $derived(sortKey ?? defaultSort?.key ?? null);
  const pageSizeOptions = $derived(pageSizeOptionsProp ?? [10, 25, 50, 100]);
  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));
  const allColumns = $derived((() => {
    let all: MetaColumn[];
    if (stickyColumns || auditingColumns) {
      all = [
        ...applyKeyOrder(stickyColumns ?? [], orderState.sticky),
        ...applyKeyOrder(dataColumns ?? [], orderState.data),
        ...applyKeyOrder(auditingColumns ?? [], orderState.auditing)
      ];
    } else {
      all = columns;
    }
    // Deduplicate by key, preserving order.
    const seen = new Set<string>();
    const dedup: MetaColumn[] = [];
    for (const col of all) {
      if (!seen.has(col.key)) {
        seen.add(col.key);
        dedup.push(col);
      }
    }
    return dedup;
  })());
  const datetimeIanaToggleColumns = $derived(allColumns.filter((c) => !!c.datetimeIanaToggle));
  const sortableColumns = $derived(allColumns.filter((c) => c.sortable !== false));
  const searchableColumns = $derived(allColumns.filter((c) => c.searchable !== false));
  const filterableColumns = $derived(allColumns.filter((c) => c.filterable !== false));
  const shownColumns = $derived(allColumns.filter((c) => visibleKeys.includes(c.key)));
  const renderColumns = $derived(shownColumns);
  const stickyColumnsGroup = $derived(
    applyKeyOrder(
      stickyColumns ??
      (() => {
        // Back-compat: legacy behavior (uuid/code pinned in the selector).
        const cols = allColumns;
        const byKey = new Map(cols.map((c) => [c.key, c] as const));
        const out: MetaColumn[] = [];
        const uuid = byKey.get('uuid');
        const code = byKey.get('code');
        if (uuid) out.push(uuid);
        if (code) out.push(code);
        return out;
      })(),
      orderState.sticky
    )
  );

  /** Card view: sticky uuid/code-style fields — dark uses **neutral** (same ramp as table sticky, no slate `gray`). */
  function stickyCardFieldChromeClass(col: MetaColumn, rowSelected: boolean): string | undefined {
    const stickyKeys = new Set(stickyColumnsGroup.map((c) => c.key));
    if (!stickyKeys.has(col.key)) return undefined;
    if (rowSelected) {
      return 'rounded-md border border-gray-300/80 bg-gray-200/85 p-2 transition-colors group-hover:bg-gray-300/90 dark:border-neutral-600 dark:bg-neutral-700 dark:group-hover:bg-neutral-600';
    }
    return 'rounded-md border border-gray-200/80 bg-gray-100/90 p-2 transition-colors group-hover:bg-gray-200/90 dark:border-neutral-800 dark:bg-neutral-900 dark:group-hover:bg-neutral-800';
  }

  /** Card view: destructive version for deleted rows — uses rose color scale. */
  function stickyCardFieldDestructiveChromeClass(col: MetaColumn, rowSelected: boolean): string | undefined {
    const stickyKeys = new Set(stickyColumnsGroup.map((c) => c.key));
    if (!stickyKeys.has(col.key)) return undefined;
    if (rowSelected) {
      return 'rounded-md border border-rose-300/80 bg-rose-300/85 p-2 transition-colors group-hover:bg-rose-400/90 dark:border-rose-600 dark:bg-rose-700 dark:group-hover:bg-rose-600';
    }
    return 'rounded-md border border-rose-200/80 bg-rose-100/90 p-2 transition-colors group-hover:bg-rose-200/90 dark:border-rose-900 dark:bg-rose-900 dark:group-hover:bg-rose-800';
  }

  /** Client-only: show all selected rows with client-side paging (no server calls until exit or reload). */
  let showSelectedOnly = $state(false);
  let clientSelectedPage = $state(1);
  let selectedRowByKey = $state(new Map<string, TRow>());

  const orderedSelectedRows = $derived(
    selectedKeys.map((k) => selectedRowByKey.get(k)).filter((r): r is TRow => r !== undefined)
  );
  const clientSelectedTotalPages = $derived(
    Math.max(1, Math.ceil(orderedSelectedRows.length / Math.max(1, pageSize)))
  );
  const footerUsesClientPaging = $derived(rowSelectionEnabled && showSelectedOnly);
  const footerPage = $derived(footerUsesClientPaging ? clientSelectedPage : page);
  const footerTotalPages = $derived(footerUsesClientPaging ? clientSelectedTotalPages : totalPages);
  const footerRangeTotal = $derived(footerUsesClientPaging ? orderedSelectedRows.length : total);
  const footerRangeStart = $derived(
    footerRangeTotal === 0 ? 0 : (footerPage - 1) * pageSize + 1
  );
  const footerRangeEnd = $derived(
    footerRangeTotal === 0 ? 0 : Math.min(footerPage * pageSize, footerRangeTotal)
  );

  const viewRows = $derived(
    rowSelectionEnabled && showSelectedOnly
      ? orderedSelectedRows.slice(
          (clientSelectedPage - 1) * pageSize,
          (clientSelectedPage - 1) * pageSize + pageSize
        )
      : rows
  );
  const pageKeys = $derived(viewRows.map((r) => rowKey(r)));
  const selectedOnPageCount = $derived(pageKeys.filter((k) => selectedKeys.includes(k)).length);
  const allOnPageSelected = $derived(pageKeys.length > 0 && selectedOnPageCount === pageKeys.length);
  /** Header checkbox tri-state: partial selection on current page. */
  const headerIndeterminate = $derived(selectedOnPageCount > 0 && !allOnPageSelected);
  const actionsEnabled = $derived(!!rowActionsEnabled || !!rowActions);
  const extraCols = $derived((rowSelectionEnabled ? 1 : 0) + (actionsEnabled ? 1 : 0));

  /** `<table>` from `Table.Root`; used to find the scroll host and preserve horizontal scroll across row reloads. */
  let tableRef = $state<HTMLTableElement | null>(null);
  let savedTableScrollLeft = $state(0);
  let prevRowsLoadingForScrollSave = $state(false);
  let prevRowsLoadingForScrollRestore = $state(false);

  function tableScrollHost(table: HTMLTableElement | null): HTMLElement | null {
    if (!table) return null;
    return table.closest('[data-slot=table-container]');
  }

  /** Capture horizontal scroll before the loading skeleton replaces row markup (browser often resets both axes). */
  $effect.pre(() => {
    void rowsLoading;
    void tableRef;
    const host = tableScrollHost(tableRef);
    if (rowsLoading && !prevRowsLoadingForScrollSave && host) savedTableScrollLeft = host.scrollLeft;
    prevRowsLoadingForScrollSave = rowsLoading;
  });

  $effect(() => {
    void rowsLoading;
    void tableRef;
    const host = tableScrollHost(tableRef);
    if (!rowsLoading && prevRowsLoadingForScrollRestore && host) {
      const left = savedTableScrollLeft;
      queueMicrotask(() => {
        host.scrollLeft = left;
        requestAnimationFrame(() => {
          if (host.scrollLeft !== left) host.scrollLeft = left;
        });
      });
    }
    prevRowsLoadingForScrollRestore = rowsLoading;
  });

  /** Any server list reload (sort, search, filters, page) exits client-only selection view. */
  let prevRowsLoadingForServerList = $state(false);
  $effect(() => {
    const loading = rowsLoading;
    if (loading && !prevRowsLoadingForServerList) {
      if (showSelectedOnly) showSelectedOnly = false;
      clientSelectedPage = 1;
    }
    prevRowsLoadingForServerList = loading;
  });

  // Sticky offsets (measured widths so we can keep columns auto-sized).
  let checkboxHeadRef = $state<HTMLElement | null>(null);
  let uuidHeadRef = $state<HTMLElement | null>(null);
  let codeHeadRef = $state<HTMLElement | null>(null);
  let uuidFirstCellRef = $state<HTMLElement | null>(null);
  let codeFirstCellRef = $state<HTMLElement | null>(null);
  let stickyLeftUuidPx = $state(0);
  let stickyLeftCodePx = $state(0);
  let stickyRO: ResizeObserver | null = null;

  function updateStickyOffsets() {
    const checkboxW = rowSelectionEnabled ? (checkboxHeadRef?.getBoundingClientRect().width ?? 0) : 0;
    // With table-layout:auto, body cells often drive the final column width.
    const uuidHeadW = uuidHeadRef?.getBoundingClientRect().width ?? 0;
    const codeHeadW = codeHeadRef?.getBoundingClientRect().width ?? 0;
    const uuidCellW = uuidFirstCellRef?.getBoundingClientRect().width ?? 0;
    const codeCellW = codeFirstCellRef?.getBoundingClientRect().width ?? 0;
    const uuidW = Math.max(uuidHeadW, uuidCellW);
    const codeW = Math.max(codeHeadW, codeCellW);

    const stickyVisibleKeys = stickyColumnsGroup
      .filter((c) => visibleKeys.includes(c.key))
      .filter((c) => c.key === 'uuid' || c.key === 'code')
      .map((c) => c.key);
    const firstKey = stickyVisibleKeys[0] ?? 'uuid';
    const firstW = firstKey === 'uuid' ? uuidW : codeW;

    // If the user reorders sticky columns, swap their left offsets accordingly.
    const nextLeftUuid = Math.round(firstKey === 'uuid' ? checkboxW : checkboxW + firstW);
    const nextLeftCode = Math.round(firstKey === 'code' ? checkboxW : checkboxW + firstW);

    // Avoid update loops when called from afterUpdate(): only write if changed.
    if (stickyLeftUuidPx !== nextLeftUuid) stickyLeftUuidPx = nextLeftUuid;
    if (stickyLeftCodePx !== nextLeftCode) stickyLeftCodePx = nextLeftCode;
  }

  onMount(() => {
    const onResize = () => {
      requestAnimationFrame(() => updateStickyOffsets());
    };
    window.addEventListener('resize', onResize);
    requestAnimationFrame(() => updateStickyOffsets());
    return () => window.removeEventListener('resize', onResize);
  });

  // Keep offsets correct across HMR/theme/style changes without requiring a full refresh.
  $effect(() => {
    void checkboxHeadRef;
    void uuidHeadRef;
    void codeHeadRef;
    void uuidFirstCellRef;
    void codeFirstCellRef;

    stickyRO?.disconnect();
    stickyRO = null;

    if (typeof ResizeObserver === 'undefined') return;
    stickyRO = new ResizeObserver(() => {
      requestAnimationFrame(() => updateStickyOffsets());
    });

    if (checkboxHeadRef) stickyRO.observe(checkboxHeadRef);
    if (uuidHeadRef) stickyRO.observe(uuidHeadRef);
    if (codeHeadRef) stickyRO.observe(codeHeadRef);
    if (uuidFirstCellRef) stickyRO.observe(uuidFirstCellRef);
    if (codeFirstCellRef) stickyRO.observe(codeFirstCellRef);

    requestAnimationFrame(() => updateStickyOffsets());

    return () => {
      stickyRO?.disconnect();
      stickyRO = null;
    };
  });

  // Recompute offsets when column set changes (but not on scroll).
  $effect(() => {
    void rowSelectionEnabled;
    void actionsEnabled;
    void visibleKeys;
    void columns;
    void orderState.sticky;
    requestAnimationFrame(() => updateStickyOffsets());
  });

  function stickyCellClass(key: string, idx: number, isHeader: boolean): string | undefined {
    if (key !== 'uuid' && key !== 'code') return undefined;
    /**
     * Sticky uuid/code: **neutral only** (TW `gray-*` dark is slate‑tinted / blue on screen).
     * Light unchanged. Dark: header `800`, body base `900` (hover `800` / selected `700` / `600` come da `entityListGrayBandStickyInteractionClass`).
     */
    const baseBg = isHeader
      ? 'bg-neutral-200 dark:bg-neutral-800'
      : 'bg-neutral-100 dark:bg-neutral-900';
    const left = key === 'uuid' ? 'left-(--pb-sticky-left-uuid)' : 'left-(--pb-sticky-left-code)';
    const z = isHeader ? 'z-50' : 'z-40';
    // bg-clip-border is important: Table primitives use bg-clip-padding, which can leave the border area "see-through"
    // when sticky columns overlap scrolling content.
    return `sticky ${left} ${z} ${baseBg} bg-clip-border`.trim();
  }

  const auditingKeySet = new Set([
    'created_at',
    'created_by',
    'updated_at',
    'updated_by',
    'version',
    'deleted_at',
    'deleted_by'
  ]);
  const auditingColumnsGroup = $derived(
    applyKeyOrder(auditingColumns ?? allColumns.filter((c) => auditingKeySet.has(c.key)), orderState.auditing)
  );
  const nonAuditingColumns = $derived(
    applyKeyOrder(
      dataColumns ??
        allColumns.filter(
          (c) => !auditingKeySet.has(c.key) && !stickyColumnsGroup.some((s) => s.key === c.key)
        ),
      orderState.data
    )
  );

  const searchScopeLabel = $derived(() => {
    if (!searchInKeys || searchInKeys.length === 0) return $t('entities.list.searchInAll');
    const keys = searchInKeys;
    if (keys.length === 1) {
      const col = searchableColumns.find((c) => c.key === keys[0]);
      return col ? $t(col.labelKey) : keys[0];
    }
    return `${keys.length} ${$t('entities.list.searchInFields')}`;
  });

  const hasAppliedFilters = $derived(
    (filterValues && Object.keys(filterValues).length > 0) ||
    (advancedFilters && advancedFilters.length > 0)
  );

  function formatBadgeValue(col: MetaColumn, value: any): string {
    if (col.type === 'badge' && col.badge?.values) {
      const badgeValue = col.badge.values[value];
      if (badgeValue) {
        return badgeValue.labelText || $t(badgeValue.labelKey || `entities.customer.status.${value}`);
      }
    }
    return String(value);
  }

  function formatFilterDateValue(isoString: string): string {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;

      const isDateTime = isoString.includes('T') || isoString.includes(':');
      const options: Intl.DateTimeFormatOptions = isDateTime
        ? { dateStyle: "long", timeStyle: "medium" }
        : { dateStyle: "long" };

      return new Intl.DateTimeFormat($uiLang, options).format(date);
    } catch {
      return isoString;
    }
  }

  function rowKey(row: TRow): string {
    const v = row[uid as keyof TRow] as unknown;
    return typeof v === 'string' ? v : String(v ?? '');
  }

  /** Merge current server page rows into a stable map so "selected only" can span pages without refetching. */
  $effect(() => {
    void rows;
    void selectedKeys;
    const sel = new Set(selectedKeys);
    const next = new Map<string, TRow>();
    for (const r of rows) {
      const k = rowKey(r);
      if (sel.has(k)) next.set(k, r);
    }
    const old = untrack(() => selectedRowByKey);
    for (const k of selectedKeys) {
      if (!next.has(k)) {
        const prev = old.get(k);
        if (prev) next.set(k, prev);
      }
    }
    selectedRowByKey = next;
  });

  function toggleSearchKey(key: string) {
    if (!searchInKeys || searchInKeys.length === 0) {
      onSearchInKeysChange([key]);
      return;
    }
    if (searchInKeys.includes(key)) {
      const next = searchInKeys.filter((k) => k !== key);
      onSearchInKeysChange(next.length ? next : null);
      return;
    }
    onSearchInKeysChange([...searchInKeys, key]);
  }

  /** Visual tokens for list search (aligned with backend customers wildcard rules). */
  type SearchSyntaxSeg =
    | { kind: 'plain'; text: string }
    | { kind: 'wAny'; text: string }
    | { kind: 'wOne'; text: string }
    | { kind: 'litStar' | 'litQ'; text: string }
    | { kind: 'sym'; text: string }
    | { kind: 'bsLit'; text: string };

  function searchSyntaxSegments(raw: string): SearchSyntaxSeg[] {
    const out: SearchSyntaxSeg[] = [];
    let buf = '';
    const flush = () => {
      if (buf) {
        out.push({ kind: 'plain', text: buf });
        buf = '';
      }
    };
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]!;
      const next = raw[i + 1];
      if (ch === '\\' && next === '*') {
        flush();
        out.push({ kind: 'wAny', text: '\\*' });
        i++;
      } else if (ch === '\\' && next === '?') {
        flush();
        out.push({ kind: 'wOne', text: '\\?' });
        i++;
      } else if (ch === '\\' && next !== undefined) {
        flush();
        out.push({ kind: 'bsLit', text: ch + next });
        i++;
      } else if (ch === '*') {
        flush();
        out.push({ kind: 'litStar', text: '*' });
      } else if (ch === '?') {
        flush();
        out.push({ kind: 'litQ', text: '?' });
      } else if (ch === '%' || ch === '_') {
        flush();
        out.push({ kind: 'sym', text: ch });
      } else {
        buf += ch;
      }
    }
    flush();
    return out;
  }

  const searchSyntaxParts = $derived(searchSyntaxSegments(search));

  function searchSyntaxSpanClass(seg: SearchSyntaxSeg): string {
    switch (seg.kind) {
      case 'plain':
        return 'text-foreground';
      case 'wAny':
        return 'font-semibold text-neutral-600 dark:text-neutral-400';
      case 'wOne':
        return 'font-semibold text-violet-600 dark:text-violet-400';
      case 'litStar':
      case 'litQ':
        return 'font-medium text-amber-700/90 dark:text-amber-400/90 bg-amber-50 dark:bg-amber-950/30 rounded px-0.5';
      case 'sym':
        return 'font-medium text-emerald-700/90 dark:text-emerald-400/90';
      case 'bsLit':
        return 'text-muted-foreground';
    }
  }

  function toggleColumnKey(key: string) {
    const col = columns.find((c) => c.key === key);
    if (col?.hideable === false) return;

    if (visibleKeys.includes(key)) {
      const next = visibleKeys.filter((k) => k !== key);
      if (next.length > 0) onVisibleKeysChange(next);
      return;
    }
    onVisibleKeysChange([...visibleKeys, key]);
  }

  function handleSortClick(col: MetaColumn) {
    if (rowsLoading) return;
    if (col.sortable === false) return;
    if (sortKey !== col.key) {
      onSortChange(col.key, 'asc');
    } else if (sortDir === 'asc') {
      onSortChange(col.key, 'desc');
    } else {
      onSortChange(null, defaultSortDir);
    }
  }

  function toggleRowSelect(key: string) {
    if (selectedKeys.includes(key)) {
      onSelectedKeysChange(selectedKeys.filter((k) => k !== key));
    } else {
      onSelectedKeysChange([...selectedKeys, key]);
    }
  }

  /** Toggle row selection on cell click when checkboxes are enabled (header excluded). */
  function onEntityRowClick(key: string, e: MouseEvent) {
    if (!rowSelectionEnabled || rowsLoading || error) return;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (
      t.closest(
        'input, button, a, textarea, select, [role="button"], [role="checkbox"], [data-slot=dropdown-menu-trigger]'
      )
    ) {
      return;
    }
    if (skipNextRowClickSelectToggle) {
      skipNextRowClickSelectToggle = false;
      return;
    }
    toggleRowSelect(key);
    // Avoid stray document-level handlers (dialogs/sheets) treating this as an extra activation.
    e.stopPropagation();
  }

  function onEntityCardClick(key: string, e: MouseEvent) {
    if (!rowSelectionEnabled || rowsLoading || error) return;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (
      t.closest(
        'input, button, a, textarea, select, [role="checkbox"], [data-slot=dropdown-menu-trigger], [data-pb-card-cta]'
      )
    ) {
      return;
    }
    toggleRowSelect(key);
    e.stopPropagation();
  }

  function toggleAllOnPage() {
    if (allOnPageSelected) {
      const remove = new Set(pageKeys);
      onSelectedKeysChange(selectedKeys.filter((k) => !remove.has(k)));
      return;
    }
    const next = new Set(selectedKeys);
    for (const k of pageKeys) next.add(k);
    onSelectedKeysChange([...next]);
  }

  function resetRowRangeSelect() {
    // Read brush state without subscribing the caller `$effect` (page/rowsLoading/…): otherwise
    // setting `rowRangeMouseDown` true on mousedown re-runs that effect and clears range before mousemove.
    if (untrack(() => rowRangeMouseDown && rangeDragActive)) skipNextRowClickSelectToggle = true;
    rowRangeMouseDown = false;
    rangeAnchorIndex = null;
    rangeDragActive = false;
    lastRangeEndIndex = null;
    selectionSnapshotAtMouseDown = null;
  }

  function canStartRowRangeSelect(e: MouseEvent): boolean {
    if (!rowSelectionEnabled || rowsLoading || error || viewRows.length === 0) return false;
    if (e.button !== 0) return false;
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    if (t.closest('input, button, a, textarea, select, [role="button"]')) return false;
    return true;
  }

  /** Rows in [anchor, end] toggle vs `selectionSnapshotAtMouseDown` (additive across strokes; rubber-band). */
  function applyRowRangeBrush(anchor: number, end: number) {
    const snap = selectionSnapshotAtMouseDown;
    if (!snap) return;

    const lo = Math.min(anchor, end);
    const hi = Math.max(anchor, end);
    const rangeKeys = viewRows.slice(lo, hi + 1).map((r) => rowKey(r));
    const rangeSet = new Set(rangeKeys);
    const pageKeySet = new Set(pageKeys);

    const next = new Set<string>();
    for (const k of snap) {
      if (!pageKeySet.has(k)) {
        next.add(k);
        continue;
      }
      if (rangeSet.has(k)) continue;
      next.add(k);
    }
    for (const k of rangeKeys) {
      if (!snap.has(k)) next.add(k);
    }
    onSelectedKeysChange([...next]);
  }

  function onRowRangeMouseDown(i: number, e: MouseEvent) {
    if (!rowSelectionEnabled) return;
    // New pointer gesture on a data row: clear a stale suppressor from an earlier range-drag mouseup.
    skipNextRowClickSelectToggle = false;
    if (!canStartRowRangeSelect(e)) return;
    e.preventDefault();
    selectionSnapshotAtMouseDown = new Set(selectedKeys);
    rowRangeMouseDown = true;
    rangeAnchorIndex = i;
    rangeDragActive = false;
    lastRangeEndIndex = null;
  }

  function onRowRangeMouseMove(e: MouseEvent) {
    if (!rowRangeMouseDown || rangeAnchorIndex === null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tr = el?.closest?.('tr[data-row-index]');
    if (!(tr instanceof HTMLElement)) return;
    const raw = tr.dataset.rowIndex;
    const idx = raw === undefined ? NaN : Number(raw);
    if (!Number.isFinite(idx) || idx < 0 || idx >= viewRows.length) return;

    if (!rangeDragActive) {
      if (idx === rangeAnchorIndex) return;
      rangeDragActive = true;
    }
    if (lastRangeEndIndex === idx) return;
    lastRangeEndIndex = idx;
    applyRowRangeBrush(rangeAnchorIndex, idx);
  }

  $effect(() => {
    void page;
    void pageSize;
    void rowsLoading;
    void error;
    resetRowRangeSelect();
  });

  $effect(() => {
    if (!rowRangeMouseDown) return;
    const move = (e: MouseEvent) => onRowRangeMouseMove(e);
    const up = () => resetRowRangeSelect();
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  });

  const loadingText = $derived(loadingMessage ?? $t('common.loading'));
  const emptyText = $derived(noRecordsMessage ?? $t('entities.list.noRecords'));

  const selectionCount = $derived(selectedKeys.length);
  const selectionPastParticipleKey = $derived(
    selectionCount === 1 ? 'entities.list.selectedSingular' : 'entities.list.selectedPlural'
  );

  $effect(() => {
    void selectedKeys;
    void rowSelectionEnabled;
    if (selectedKeys.length === 0 && showSelectedOnly) {
      showSelectedOnly = false;
      clientSelectedPage = 1;
    }
    if (!rowSelectionEnabled && showSelectedOnly) {
      showSelectedOnly = false;
      clientSelectedPage = 1;
    }
  });

  $effect(() => {
    void orderedSelectedRows.length;
    void pageSize;
    void showSelectedOnly;
    if (!showSelectedOnly) return;
    const maxP = Math.max(1, Math.ceil(orderedSelectedRows.length / Math.max(1, pageSize)));
    if (clientSelectedPage > maxP) clientSelectedPage = maxP;
  });
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
  {#snippet listDefaultCellValue(row: TRow, col: MetaColumn)}
    {@const mode = datetimeIanaModeByKey[col.key] ?? 'browser'}
    {@const parts = formatDatetimeCellDisplay(
      col,
      row as Record<string, unknown>,
      $uiLang,
      mode
    )}
    {#if isDatetimeIanaRecordMode(col) && parts.iana}
      <div class="flex min-w-0 flex-col gap-1">
        <span class="min-w-0 truncate">{parts.text}</span>
        <Badge
          variant="outline"
          class="w-fit max-w-full shrink truncate border-amber-300/90 bg-amber-100 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-950 shadow-none dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >{parts.iana}</Badge>
      </div>
    {:else}
      <span class="min-w-0 truncate">{parts.text}</span>
    {/if}
  {/snippet}

  {#snippet entityCardField(r: TRow, col: MetaColumn, rowSelected: boolean, rowDeleted: boolean)}
    <div
      class={cn(
        'flex flex-col gap-0.5',
        viewMode === 'cards_list' ? 'min-w-36 max-w-[24rem] shrink-0' : 'min-w-0'
      )}
    >
      <div class="text-xs font-medium text-muted-foreground">{$t(col.labelKey)}</div>
      <div
        class={cn(
          'min-w-0 text-sm',
          (!isCardFieldEmpty(r, col)
            ? datetimeIanaCardFieldHighlightClass(col, rowSelectionEnabled && rowSelected)
            : undefined) ?? (rowDeleted
              ? stickyCardFieldDestructiveChromeClass(col, rowSelectionEnabled && rowSelected)
              : stickyCardFieldChromeClass(col, rowSelectionEnabled && rowSelected))
        )}
      >
        {#if isCardFieldEmpty(r, col)}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  type="button"
                  {...props}
                  data-pb-card-cta
                  class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground"
                  aria-label={$t('entities.list.clear')}
                >
                  <Ban class="size-4" />
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>{$t('entities.list.emptyField')}</Tooltip.Content>
          </Tooltip.Root>
        {:else if cell}
          {@render cell({ row: r, column: col })}
        {:else}
          {@render listDefaultCellValue(r, col)}
        {/if}
      </div>
    </div>
  {/snippet}

  <div class="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2">
    <div class="flex min-w-0 flex-1 basis-0 items-center gap-2 sm:min-w-[260px] sm:max-w-[520px]">
      <InputGroup
        class="
          group/input
          w-full
          bg-sky-50/20 border border-input
          hover:bg-sky-50/45 hover:border-ring/40
          focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring
          dark:bg-input/40 dark:hover:bg-input/55
          rounded-md transition-all duration-200
        "
      >
        <InputGroupAddon
          align="inline-start"
          class="bg-transparent border-none pr-0"
        >
          <Search class="size-4 text-muted-foreground group-hover/input:text-sky-600 transition-colors" />
        </InputGroupAddon>

        <InputGroupInput
          class="
            bg-transparent border-none text-sm
            focus-visible:ring-0 focus-visible:ring-offset-0
            placeholder:text-muted-foreground/70 placeholder:text-xs
          "
          value={search}
          oninput={(e) => onSearchInput((e.currentTarget as HTMLInputElement).value)}
          placeholder={$t(searchPlaceholderKey ?? 'entities.list.searchPlaceholder')}
        />

        {#if search.trim().length > 0}
          <InputGroupButton
            variant="ghost"
            size="icon-xs"
            class="hover:bg-sky-100/50 dark:hover:bg-white/10"
            onclick={() => onSearchInput('')}
            aria-label={$t('common.reset')}
            title={$t('common.reset')}
          >
            <XIcon class="size-4" />
          </InputGroupButton>
        {/if}

        <InputGroupButton
          variant="soft"
          size="xs"
          class="mr-1 bg-sky-100/50 hover:bg-sky-200/50 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
          onclick={() =>
            openSheet(
              'entity.searchIn',
              {
                searchInKeys,
                searchableColumns,
                onSearchInKeysChange,
                toggleSearchKey,
                sheetMenuCheckboxClass: checkboxVisualOnlyClass
              } as any,
              { contentClass: 'w-[360px] p-0' }
            )}
        >
          {searchScopeLabel()}
        </InputGroupButton>
      </InputGroup>
    </div>

    <div class="flex items-center justify-end gap-2">
      <div
        class="inline-flex rounded-md border border-input bg-sky-100/50 p-0.5 shadow-xs dark:border-input dark:bg-muted/20"
        role="group"
        aria-label={$t('entities.list.viewMode.groupAria')}
      >
        <Button
          variant={viewMode === 'table' ? 'default' : 'ghost'}
          size="icon-sm"
          type="button"
          class={cn(
            'rounded-sm border border-transparent transition-colors hover:border-ring/50 dark:border-transparent dark:hover:border-ring/45',
            viewMode !== 'table' && 'hover:bg-sky-100 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
          )}
          aria-pressed={viewMode === 'table'}
          title={$t('entities.list.viewMode.table')}
          onclick={() => {
            viewMode = 'table';
          }}
        >
          <Table2 class="size-4" />
        </Button>
        <Button
          variant={viewMode === 'cards' ? 'default' : 'ghost'}
          size="icon-sm"
          type="button"
          class={cn(
            'rounded-sm border border-transparent transition-colors hover:border-ring/50 dark:border-transparent dark:hover:border-ring/45',
            viewMode !== 'cards' && 'hover:bg-sky-100 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
          )}
          aria-pressed={viewMode === 'cards'}
          title={$t('entities.list.viewMode.cards')}
          onclick={() => {
            viewMode = 'cards';
          }}
        >
          <LayoutGrid class="size-4" />
        </Button>
        <Button
          variant={viewMode === 'cards_list' ? 'default' : 'ghost'}
          size="icon-sm"
          type="button"
          class={cn(
            'rounded-sm border border-transparent transition-colors hover:border-ring/50 dark:border-transparent dark:hover:border-ring/45',
            viewMode !== 'cards_list' && 'hover:bg-sky-100 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
          )}
          aria-pressed={viewMode === 'cards_list'}
          title={$t('entities.list.viewMode.cardsList')}
          onclick={() => {
            viewMode = 'cards_list';
          }}
        >
          <LayoutList class="size-4" />
        </Button>
      </div>

      <div
        class="inline-flex rounded-md border border-input bg-sky-100/50 p-0.5 shadow-xs dark:border-input dark:bg-muted/20"
        role="group"
        aria-label={$t('entities.list.deletionFilter.groupAria')}
      >
        <Button
          variant={deletionFilterMode === 'non_deleted' ? 'default' : 'ghost'}
          size="icon-sm"
          type="button"
          class={cn(
            'rounded-sm border border-transparent transition-colors hover:border-ring/50 dark:border-transparent dark:hover:border-ring/45',
            deletionFilterMode !== 'non_deleted' && 'hover:bg-sky-100 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
          )}
          aria-pressed={deletionFilterMode === 'non_deleted'}
          title={$t('entities.list.deletionFilter.nonDeleted')}
          onclick={() => {
            deletionFilterMode = 'non_deleted';
          }}
        >
          <ListCheck class="size-4" />
        </Button>
        <Button
          variant={deletionFilterMode === 'deleted' ? 'default' : 'ghost'}
          size="icon-sm"
          type="button"
          class={cn(
            'rounded-sm border border-transparent transition-colors hover:border-ring/50 dark:border-transparent dark:hover:border-ring/45',
            deletionFilterMode !== 'deleted' && 'hover:bg-sky-100 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
          )}
          aria-pressed={deletionFilterMode === 'deleted'}
          title={$t('entities.list.deletionFilter.deleted')}
          onclick={() => {
            deletionFilterMode = 'deleted';
          }}
        >
          <ListX class="size-4" />
        </Button>
        <Button
          variant={deletionFilterMode === 'all' ? 'default' : 'ghost'}
          size="icon-sm"
          type="button"
          class={cn(
            'rounded-sm border border-transparent transition-colors hover:border-ring/50 dark:border-transparent dark:hover:border-ring/45',
            deletionFilterMode !== 'all' && 'hover:bg-sky-100 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
          )}
          aria-pressed={deletionFilterMode === 'all'}
          title={$t('entities.list.deletionFilter.all')}
          onclick={() => {
            deletionFilterMode = 'all';
          }}
        >
          <TextAlignJustify class="size-4" />
        </Button>
      </div>

      <Button
        variant="soft"
        size="icon-sm"
        disabled={rowsLoading || refreshDisabled}
        onclick={() => onRefresh()}
        aria-label={$t('entities.list.refresh')}
        title={$t('entities.list.refresh')}
      >
        <RotateCw class={rowsLoading ? 'size-4 animate-spin' : 'size-4'} />
      </Button>

      <Button
        variant="soft"
        size="sm"
        type="button"
        onclick={() =>
          openSheet(
            'entity.columns',
            {
              stickyColumns: stickyColumnsGroup,
              nonAuditingColumns,
              auditingColumns: auditingColumnsGroup,
              visibleKeys,
              toggleColumnKey,
              onResetColumnVisibility: resetColumnsAndSorting,
              sheetMenuCheckboxClass: checkboxVisualOnlyClass,
              t: $t
            } as any,
            { contentClass: 'w-[360px] p-0' }
          )}
      >
        <Columns3 class="size-4" />
        {$t('entities.list.columns')}
      </Button>

      {#if filterableColumns.length > 0}
        <Button
          variant="soft"
          size="sm"
          type="button"
          onclick={() => {
            if (sheetState.open && sheetState.panelId === 'entity.filters') {
              closeSheet();
              filtersOpen = false;
              return;
            }
            filtersOpen = true;
            openSheet('entity.filters', {
              content: FiltersPanel,
              props: {
                content: {},
                filterableColumns,
                filterValues: filterValues ?? {},
                onFilterValuesChange,
                onResetFilters
              }
            } as any, {
              contentClass: 'w-[360px] p-0',
              modal: false
            });
          }}
        >
          <SlidersHorizontal class="size-4" />
          {$t('entities.list.filters')}
        </Button>
      {/if}
    </div>
  </div>

  <div class="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
    <Button
      variant="outline"
      size="xs"
      class="h-6 text-xs border border-neutral-300 hover:border-neutral-400"
      onclick={toggleToolbarMode}
    >
      {#if toolbarMode === 'filters'}
        <ListCheck class="size-3.5" />
        {$t('entities.list.bulkActions.toggleToBulk')}
      {:else}
        <Funnel class="size-3.5" />
        {$t('entities.list.bulkActions.toggleToFilters')}
      {/if}
    </Button>
    <div class="h-6 w-px bg-border/60" aria-hidden="true"></div>

    {#if toolbarMode === 'filters'}
      {#if hasAppliedFilters}
        <div in:fly={{ y: 20, duration: 200 }} class="flex flex-wrap items-center gap-2">
          <Button
            variant="soft"
            size="xs"
            class="h-6 text-xs bg-primary/10 text-primary hover:bg-primary/20 border-primary/20"
            onclick={resetFilters}
          >
            <FilterX class="size-3.5" />
            {$t('common.clearAll')}
          </Button>
          <div class="h-6 w-px bg-border/60" aria-hidden="true"></div>
          {#if filterValues && Object.keys(filterValues).length > 0}
            {#each Object.entries(filterValues) as [key, value]}
              {@const col = filterableColumns.find((c) => c.key === key)}
              {#if col}
                {@const operator = col.type === 'text' ? 'contains' : '='}
                {@const formattedValue = col.type === 'date' || col.type === 'datetime' ? formatFilterDateValue(String(value)) : formatBadgeValue(col, value)}
                <Badge
                  variant="secondary"
                  class="gap-1.5 pr-1"
                >
                  <span class="text-xs font-bold text-foreground">{$t(col.labelKey)}</span>
                  <span class="text-xs text-primary">{$t(`entities.list.operators.${operator}`)}</span>
                  <span class="text-xs italic text-muted-foreground">{formattedValue}</span>
                  <button
                    type="button"
                    class="ml-0.5 inline-flex size-4 items-center justify-center rounded-full hover:bg-muted-foreground/20"
                    onclick={() => {
                      const next = { ...filterValues };
                      delete next[key];
                      onFilterValuesChange?.(next);
                    }}
                    aria-label={$t('common.remove')}
                  >
                    <XIcon class="size-3" />
                  </button>
                </Badge>
              {/if}
            {/each}
          {/if}
          {#if advancedFilters && advancedFilters.length > 0}
            {#each advancedFilters as filter}
              {@const col = filterableColumns.find((c) => c.key === filter.field)}
              {#if col}
                {@const formattedValue = (() => {
                  if (Array.isArray(filter.value)) {
                    return filter.value.map((v) => formatBadgeValue(col, v)).join(", ");
                  } else if (filter.operator === "BETWEEN" && typeof filter.value === "object" && "start" in filter.value && "end" in filter.value) {
                    const startFormatted = formatFilterDateValue(String(filter.value.start));
                    const endFormatted = formatFilterDateValue(String(filter.value.end));
                    return `${startFormatted} e ${endFormatted}`;
                  } else if (col.type === 'date' || col.type === 'datetime') {
                    return formatFilterDateValue(String(filter.value));
                  } else {
                    return formatBadgeValue(col, filter.value);
                  }
                })()}
                <Badge
                  variant="secondary"
                  class="gap-1.5 pr-1"
                >
                  <span class="text-xs font-bold text-foreground">{$t(col.labelKey)}</span>
                  <span class="text-xs text-primary">{$t(`entities.list.operators.${filter.operator}`)}</span>
                  <span class="text-xs italic text-muted-foreground">{formattedValue}</span>
                  <button
                    type="button"
                    class="ml-0.5 inline-flex size-4 items-center justify-center rounded-full hover:bg-muted-foreground/20"
                    onclick={() => {
                      const next = advancedFilters.filter((f) => f.id !== filter.id);
                      onAdvancedFiltersChange?.(next, 'AND');
                    }}
                    aria-label={$t('common.remove')}
                  >
                    <XIcon class="size-3" />
                  </button>
                </Badge>
              {/if}
            {/each}
          {/if}
        </div>
      {:else}
        <span in:fly={{ y: 20, duration: 200 }} class="text-xs italic text-muted-foreground/70">{$t('entities.list.filterBadge.noFiltersApplied')}</span>
      {/if}
    {:else}
      <div in:fly={{ y: 20, duration: 200 }} class="flex flex-wrap items-center gap-2">
        <Button
          variant="soft"
          size="xs"
          class="h-6 text-xs bg-primary/10 text-primary hover:bg-primary/20 border-primary/20"
          onclick={handleBulkExport}
        >
          <Download class="size-3.5" />
          {$t('entities.list.bulkActions.export')}
        </Button>
        <Button
          variant="soft"
          size="xs"
          class="h-6 text-xs bg-primary/10 text-primary hover:bg-primary/20 border-primary/20"
          onclick={handleHtmlExport}
        >
          <Download class="size-3.5" />
          {$t('entities.list.bulkActions.exportHtml')}
        </Button>
        <Button
          variant="soft"
          size="xs"
          class="h-6 text-xs bg-primary/10 text-primary hover:bg-primary/20 border-primary/20"
          onclick={handleBulkDuplicate}
          disabled={selectedKeys.length < 2}
        >
          <Copy class="size-3.5" />
          {$t('entities.list.bulkActions.duplicate')}
        </Button>
        <Button
          variant="soft"
          size="xs"
          class="h-6 text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 hover:border-destructive/50 border-destructive/20"
          onclick={handleBulkDelete}
          disabled={selectedKeys.length < 2}
        >
          <Trash2 class="size-3.5" />
          {$t('entities.list.bulkActions.delete')}
        </Button>
      </div>
    {/if}
  </div>

  <div class="min-h-0 flex-1 overflow-hidden">
    {#if metaLoading}
      {#if metaLoadingView}
        {@render metaLoadingView()}
      {:else}
        <div class="grid h-full place-items-center p-3">
          <div class="relative flex flex-col items-center gap-2 text-center">
            <div class="pb-watermark-loading">
              <Hourglass class="size-20 text-info" />
            </div>
            <div class="text-sm font-medium text-muted-foreground">{loadingText}</div>
          </div>
        </div>
      {/if}
    {:else}
      {#if viewMode !== 'table'}
        <div class="h-full overflow-auto">
          {#if error}
            {#if errorView}
              {@render errorView()}
            {:else}
              <div class="grid min-h-56 place-items-center">
                <div class="relative flex flex-col items-center gap-2 text-center">
                  <div class="pb-watermark-error">
                    <CircleX class="size-20 text-destructive" />
                  </div>
                  <div class="text-sm font-medium text-muted-foreground">{error}</div>
                </div>
              </div>
            {/if}
          {:else if rowsLoading}
            {#if rowsLoadingView}
              {@render rowsLoadingView()}
            {:else}
              <div class="w-full">
                <LoadingBar size="xs" />
                <div class="grid min-h-56 place-items-center">
                  <div class="relative flex flex-col items-center gap-2 text-center">
                    <div class="pb-watermark-loading">
                      <Hourglass class="size-20 text-info" />
                    </div>
                    <div class="text-sm font-medium text-muted-foreground">{loadingText}</div>
                  </div>
                </div>
              </div>
            {/if}
          {:else if rows.length === 0}
            {#if emptyView}
              {@render emptyView()}
            {:else}
              <div class="grid min-h-56 place-items-center">
                <div class="relative flex flex-col items-center gap-2 text-center">
                  <div class="pb-watermark-empty">
                    <TriangleAlert class="size-20 text-warning" />
                  </div>
                  <div class="text-sm font-medium text-muted-foreground">{emptyText}</div>
                </div>
              </div>
            {/if}
          {:else if viewRows.length === 0}
            <div class="grid min-h-56 place-items-center">
              <div class="relative flex flex-col items-center gap-2 text-center">
                <div class="pb-watermark-empty">
                  <TriangleAlert class="size-20 text-warning" />
                </div>
                <div class="text-sm font-medium text-muted-foreground">
                  {#if showSelectedOnly && selectionCount > 0 && orderedSelectedRows.length === 0}
                    {$t('entities.list.selectedRowsNotLoadedHint')}
                  {:else}
                    {$t('entities.list.noSelectedRowsInView')}
                  {/if}
                </div>
              </div>
            </div>
          {:else}
            <div
              class="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-background/90 px-3 py-2 backdrop-blur-sm supports-backdrop-filter:bg-background/70"
            >
              <div class="flex flex-wrap items-center gap-2">
                {#if rowSelectionEnabled}
                  <Checkbox
                    class={checkboxInteractiveClass}
                    checked={allOnPageSelected}
                    indeterminate={headerIndeterminate}
                    onCheckedChange={() => toggleAllOnPage()}
                    aria-label={$t('entities.list.selectAll')}
                  />
                  <span class="text-xs font-medium text-muted-foreground">
                    {allOnPageSelected ? $t('entities.list.deselectAll') : $t('entities.list.selectAll')}
                  </span>
                {/if}

                <div class="mx-1 h-6 w-px bg-border/60" aria-hidden="true"></div>

                <span class="text-xs font-medium text-muted-foreground">{$t('entities.list.sortBy')}</span>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props })}
                      <Button variant="soft" size="xs" {...props} class="max-w-[220px] truncate">
                        {$t(allColumns.find((c) => c.key === effectiveSortKey)?.labelKey ?? '')}
                      </Button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="start">
                    {#each sortableColumns as col (col.key)}
                      <DropdownMenu.Item
                        class={dropdownMenuSelectedItemClass(effectiveSortKey === col.key)}
                        onSelect={() => onSortChange(col.key, effectiveSortKey === col.key ? sortDir : 'asc')}
                      >
                        {$t(col.labelKey)}
                      </DropdownMenu.Item>
                    {/each}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>

                <span class="ml-1 text-xs font-medium text-muted-foreground">{$t('entities.list.inOrder')}</span>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props })}
                      <Button variant="soft" size="xs" {...props} disabled={!effectiveSortKey}>
                        {#if sortDir === 'asc'}
                          <ArrowUpNarrowWide class="size-4" />
                        {:else}
                          <ArrowDownWideNarrow class="size-4" />
                        {/if}
                      </Button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="start">
                    <DropdownMenu.Item
                      class={dropdownMenuSelectedItemClass(sortDir === 'asc')}
                      onSelect={() => effectiveSortKey && onSortChange(effectiveSortKey, 'asc')}
                    >
                      <span class="inline-flex items-center gap-2">
                        <ArrowUpNarrowWide class="size-4" />
                        {$t('entities.list.ascending')}
                      </span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      class={dropdownMenuSelectedItemClass(sortDir === 'desc')}
                      onSelect={() => effectiveSortKey && onSortChange(effectiveSortKey, 'desc')}
                    >
                      <span class="inline-flex items-center gap-2">
                        <ArrowDownWideNarrow class="size-4" />
                        {$t('entities.list.descending')}
                      </span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>

                {#each datetimeIanaToggleColumns as col (col.key)}
                  <div class="mx-1 h-6 w-px bg-border/60" aria-hidden="true"></div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-medium text-muted-foreground">{$t(col.labelKey)}</span>
                    <Switch
                      checked={(datetimeIanaModeByKey[col.key] ?? 'browser') === 'record'}
                      disabled={rowsLoading}
                      aria-label={(datetimeIanaModeByKey[col.key] ?? 'browser') === 'browser'
                        ? $t('entities.list.datetimeIana.hintBrowser')
                        : $t('entities.list.datetimeIana.hintRecord')}
                      title={(datetimeIanaModeByKey[col.key] ?? 'browser') === 'browser'
                        ? $t('entities.list.datetimeIana.hintBrowser')
                        : $t('entities.list.datetimeIana.hintRecord')}
                      onCheckedChange={() => toggleDatetimeIana(col)}
                    >
                      {#snippet thumbIcons({ checked })}
                        {#if checked}
                          <MapPin class="size-3.5 opacity-95" />
                        {:else}
                          <Globe class="size-3.5 opacity-95" />
                        {/if}
                      {/snippet}
                    </Switch>
                  </div>
                {/each}
              </div>
            </div>

            <div class="p-3">
              <div
                class={cn(
                  viewMode === 'cards_list'
                    ? 'flex flex-col gap-3'
                    : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                )}
              >
                {#each viewRows as r (rowKey(r))}
                  {@const rk = rowKey(r)}
                  {@const rowSelected = rowSelectionEnabled && selectedKeys.includes(rk)}
                  {@const rowDeleted = isRowDeleted(r)}
                  <div
                    role="button"
                    tabindex={rowSelectionEnabled ? 0 : -1}
                    aria-disabled={!rowSelectionEnabled}
                    data-state={rowSelected ? 'selected' : undefined}
                    class={cn(
                      'group rounded-md border bg-background p-3 shadow-sm transition-colors',
                      viewMode === 'cards_list'
                        ? 'flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:gap-4'
                        : undefined,
                      rowSelectionEnabled
                        ? rowSelected
                          ? 'cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800'
                          : 'cursor-pointer hover:bg-accent/40'
                        : undefined,
                      rowSelected
                        ? 'bg-neutral-50 ring-1 ring-primary/40 dark:bg-neutral-700 dark:ring-primary/35'
                        : undefined
                    )}
                    onclick={(e) => {
                      if (!rowSelectionEnabled) return;
                      onEntityCardClick(rk, e);
                    }}
                    onkeydown={
                      (e) => {
                        if (!rowSelectionEnabled) return;
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        toggleRowSelect(rk);
                      }
                    }
                  >
                    {#if viewMode === 'cards_list'}
                      <div
                        class="flex w-full shrink-0 items-start justify-between gap-2 sm:w-auto sm:flex-col sm:items-stretch sm:gap-2"
                      >
                        {#if rowSelectionEnabled}
                          <div
                            class="shrink-0"
                            data-pb-card-cta
                            role="button"
                            tabindex="-1"
                            onclick={(e) => e.stopPropagation()}
                            onkeydown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                            }}
                          >
                            <Checkbox
                              class={checkboxInteractiveClass}
                              checked={selectedKeys.includes(rk)}
                              onCheckedChange={() => toggleRowSelect(rk)}
                              aria-label={$t('entities.list.selectRow')}
                            />
                          </div>
                        {/if}

                        {#if actionsEnabled}
                          <div
                            class={cn('shrink-0', rowSelectionEnabled ? 'ml-auto sm:ml-0' : 'ml-auto')}
                            data-pb-card-cta
                            role="button"
                            tabindex="-1"
                            onclick={(e) => e.stopPropagation()}
                            onkeydown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                            }}
                          >
                            {#if rowActions}
                              {@render rowActions({ row: r })}
                            {:else}
                              <DropdownMenu.Root open={dropdownMenuRow === r}>
                                <DropdownMenu.Trigger>
                                  {#snippet child({ props })}
                                    <Button 
                                      {...props}
                                      variant="ghost" 
                                      size="icon-sm" 
                                      aria-label={$t('entities.list.rowActions')} 
                                      title={$t('entities.list.rowActions')}
                                      onclick={(e) => {
                                        e.stopPropagation();
                                        openRowDropdown(r);
                                      }}
                                    >
                                      <MoreVertical class="size-4" />
                                    </Button>
                                  {/snippet}
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Content class="w-56" align="end">
                                  {#if entityRowActions?.edit !== false}
                                    <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleEditRow(r); }}>
                                      <div class="flex items-center gap-2">
                                        <Pencil class="size-4 opacity-70" />
                                        <span>{$t('common.edit')}</span>
                                      </div>
                                    </DropdownMenu.Item>
                                  {/if}
                                  {#if entityRowActions?.duplicate !== false}
                                    <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleDuplicateRow(r); }}>
                                      <div class="flex items-center gap-2">
                                        <Copy class="size-4 opacity-70" />
                                        <span>{$t('common.duplicate')}</span>
                                      </div>
                                    </DropdownMenu.Item>
                                  {/if}
                                  {#if entityRowActions?.delete !== false}
                                    <DropdownMenu.Separator />
                                    <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleDeleteRow(r); }} class="text-destructive">
                                      <div class="flex items-center gap-2">
                                        <Trash2 class="size-4 text-destructive/70" />
                                        <span>{$t('common.delete')}</span>
                                      </div>
                                    </DropdownMenu.Item>
                                  {/if}
                                </DropdownMenu.Content>
                              </DropdownMenu.Root>
                            {/if}
                          </div>
                        {/if}
                      </div>

                      <div class="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-3">
                        {#each renderColumns as col (col.key)}
                          {@render entityCardField(r, col, rowSelected, rowDeleted)}
                        {/each}
                      </div>
                    {:else}
                      <div class="mb-2 flex items-start justify-between gap-2">
                        {#if rowSelectionEnabled}
                          <div
                            class="shrink-0"
                            data-pb-card-cta
                            role="button"
                            tabindex="-1"
                            onclick={(e) => e.stopPropagation()}
                            onkeydown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                            }}
                          >
                            <Checkbox
                              class={checkboxInteractiveClass}
                              checked={selectedKeys.includes(rk)}
                              onCheckedChange={() => toggleRowSelect(rk)}
                              aria-label={$t('entities.list.selectRow')}
                            />
                          </div>
                        {/if}

                        {#if actionsEnabled}
                          <div
                            class="ml-auto shrink-0"
                            data-pb-card-cta
                            role="button"
                            tabindex="-1"
                            onclick={(e) => e.stopPropagation()}
                            onkeydown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                            }}
                          >
                            {#if rowActions}
                              {@render rowActions({ row: r })}
                            {:else}
                              <DropdownMenu.Root open={dropdownMenuRow === r}>
                                <DropdownMenu.Trigger>
                                  {#snippet child({ props })}
                                    <Button 
                                      {...props}
                                      variant="ghost" 
                                      size="icon-sm" 
                                      aria-label={$t('entities.list.rowActions')} 
                                      title={$t('entities.list.rowActions')}
                                      onclick={(e) => {
                                        e.stopPropagation();
                                        openRowDropdown(r);
                                      }}
                                    >
                                      <MoreVertical class="size-4" />
                                    </Button>
                                  {/snippet}
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Content class="w-56" align="end">
                                  {#if entityRowActions?.edit !== false}
                                    <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleEditRow(r); }}>
                                      <div class="flex items-center gap-2">
                                        <Pencil class="size-4 opacity-70" />
                                        <span>{$t('common.edit')}</span>
                                      </div>
                                    </DropdownMenu.Item>
                                  {/if}
                                  {#if entityRowActions?.duplicate !== false}
                                    <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleDuplicateRow(r); }}>
                                      <div class="flex items-center gap-2">
                                        <Copy class="size-4 opacity-70" />
                                        <span>{$t('common.duplicate')}</span>
                                      </div>
                                    </DropdownMenu.Item>
                                  {/if}
                                  {#if entityRowActions?.delete !== false}
                                    <DropdownMenu.Separator />
                                    <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleDeleteRow(r); }} class="text-destructive">
                                      <div class="flex items-center gap-2">
                                        <Trash2 class="size-4 text-destructive/70" />
                                        <span>{$t('common.delete')}</span>
                                      </div>
                                    </DropdownMenu.Item>
                                  {/if}
                                </DropdownMenu.Content>
                              </DropdownMenu.Root>
                            {/if}
                          </div>
                        {/if}
                      </div>

                      <div class="flex flex-col gap-2">
                        {#each renderColumns as col (col.key)}
                          {@render entityCardField(r, col, rowSelected, rowDeleted)}
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <Table.Root
          bind:ref={tableRef}
          data-row-density={rowDensity}
          class={cn(
            'w-full bg-background **:data-[slot=table]:isolate **:data-[slot=table]:bg-background **:data-[slot=table-cell]:bg-clip-border [&_[data-slot=table-cell]:not(.sticky)]:bg-background dark:[&_[data-slot=table-cell]:not(.sticky)]:bg-neutral-950 [&_[data-slot=table-head]:not(.sticky)]:bg-neutral-50 dark:[&_[data-slot=table-head]:not(.sticky)]:bg-neutral-900',
            tableDensityClass
          )}
          containerClass="h-full overflow-auto"
          style={`--pb-sticky-left-uuid: ${stickyLeftUuidPx}px; --pb-sticky-left-code: ${stickyLeftCodePx}px;`}
        >
          <Table.Header class="sticky top-0 z-80 bg-background">
            <Table.Row>
              {#if rowSelectionEnabled}
                <Table.Head
                  bind:ref={checkboxHeadRef}
                  class="w-10 min-w-10 max-w-10 sticky left-0 z-70 bg-neutral-200 dark:bg-neutral-800 bg-clip-border px-2"
                >
                  <div class={cn('flex items-center justify-center', rowChromeH)}>
                    <Checkbox
                      class={checkboxInteractiveClass}
                      checked={allOnPageSelected}
                      indeterminate={headerIndeterminate}
                      onCheckedChange={() => toggleAllOnPage()}
                      aria-label={$t('entities.list.selectAll')}
                    />
                  </div>
                </Table.Head>
              {/if}
              {#each renderColumns as col, colIdx (col.key)}
                {#if col.key === 'uuid'}
                  <Table.Head
                    bind:ref={uuidHeadRef}
                    class={stickyCellClass(col.key, colIdx, true) ??
                      (col.sortable !== false
                        ? rowsLoading
                          ? 'relative z-10 select-none opacity-60'
                          : 'relative z-10 cursor-pointer select-none'
                        : 'relative z-10')}
                    onclick={() => handleSortClick(col)}
                  >
                  <span class="inline-flex items-center gap-1">
                    {$t(col.labelKey)}
                    {#if col.sortable !== false}
                      {#if sortKey !== col.key}
                        <ArrowUpDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-60'} />
                      {:else if sortDir === 'asc'}
                        <ArrowUp class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                      {:else}
                        <ArrowDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                      {/if}
                    {/if}
                  </span>
                  </Table.Head>
                {:else if col.key === 'code'}
                  <Table.Head
                    bind:ref={codeHeadRef}
                    class={stickyCellClass(col.key, colIdx, true) ??
                      (col.sortable !== false
                        ? rowsLoading
                          ? 'relative z-10 select-none opacity-60'
                          : 'relative z-10 cursor-pointer select-none'
                        : 'relative z-10')}
                    onclick={() => handleSortClick(col)}
                  >
                    <span class="inline-flex items-center gap-1">
                      {$t(col.labelKey)}
                      {#if col.sortable !== false}
                        {#if sortKey !== col.key}
                          <ArrowUpDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-60'} />
                        {:else if sortDir === 'asc'}
                          <ArrowUp class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                        {:else}
                          <ArrowDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                        {/if}
                      {/if}
                    </span>
                  </Table.Head>
                {:else}
                <Table.Head
                  class={cn(
                    stickyCellClass(col.key, colIdx, true) ??
                      (col.sortable !== false
                        ? rowsLoading
                          ? 'relative z-10 select-none opacity-60'
                          : 'relative z-10 cursor-pointer select-none'
                        : 'relative z-10'),
                    datetimeIanaHeadHighlightClass(col)
                  )}
                  onclick={(e) => {
                    const el = e.target as HTMLElement | null;
                    if (el?.closest?.('[data-pb-datetime-iana-toggle]')) return;
                    handleSortClick(col);
                  }}
                >
                  {#if col.datetimeIanaToggle}
                    <div class="flex w-full min-w-0 items-center justify-between gap-1">
                      <span class="inline-flex min-w-0 items-center gap-1">
                        {$t(col.labelKey)}
                        {#if col.sortable !== false}
                          {#if sortKey !== col.key}
                            <ArrowUpDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-60'} />
                          {:else if sortDir === 'asc'}
                            <ArrowUp class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                          {:else}
                            <ArrowDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                          {/if}
                        {/if}
                      </span>
                      <button
                        type="button"
                        data-pb-datetime-iana-toggle
                        class="inline-flex shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title={(datetimeIanaModeByKey[col.key] ?? 'browser') === 'browser'
                          ? $t('entities.list.datetimeIana.hintBrowser')
                          : $t('entities.list.datetimeIana.hintRecord')}
                        aria-label={(datetimeIanaModeByKey[col.key] ?? 'browser') === 'browser'
                          ? $t('entities.list.datetimeIana.hintBrowser')
                          : $t('entities.list.datetimeIana.hintRecord')}
                        onclick={(e) => {
                          e.stopPropagation();
                          toggleDatetimeIana(col);
                        }}
                      >
                        {#if (datetimeIanaModeByKey[col.key] ?? 'browser') === 'browser'}
                          <Globe class="size-3.5 opacity-90" />
                        {:else}
                          <MapPin class="size-3.5 opacity-90" />
                        {/if}
                      </button>
                    </div>
                  {:else}
                    <span class="inline-flex items-center gap-1">
                      {$t(col.labelKey)}
                      {#if col.sortable !== false}
                        {#if sortKey !== col.key}
                          <ArrowUpDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-60'} />
                        {:else if sortDir === 'asc'}
                          <ArrowUp class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                        {:else}
                          <ArrowDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                        {/if}
                      {/if}
                    </span>
                  {/if}
                </Table.Head>
              {/if}
            {/each}
            {#if actionsEnabled}
              <Table.Head
                class="w-10 min-w-10 max-w-10 sticky right-0 z-70 bg-neutral-200 dark:bg-neutral-800 bg-clip-border px-2"
              >
                <div class={cn('flex items-center justify-center', rowChromeH)}>
                  <span class="sr-only">{$t('common.actions')}</span>
                </div>
              </Table.Head>
            {/if}
          </Table.Row>
        </Table.Header>
        <Table.Body
          class={rowSelectionEnabled && rowRangeMouseDown && rangeDragActive ? 'select-none' : undefined}
        >
          {#if error}
            {#if errorView}
              {@render errorView()}
            {:else}
              <Table.Row>
                <Table.Cell colspan={renderColumns.length + extraCols} class="p-0">
                  <div class="grid min-h-56 place-items-center p-3">
                    <div class="relative flex flex-col items-center gap-2 text-center">
                      <div class="pb-watermark-error">
                        <CircleX class="size-20 text-destructive" />
                      </div>
                      <div class="text-sm font-medium text-muted-foreground">{error}</div>
                    </div>
                  </div>
                </Table.Cell>
              </Table.Row>
            {/if}
          {:else if rowsLoading}
            {#if rowsLoadingView}
              {@render rowsLoadingView()}
            {:else}
              <Table.Row>
                <Table.Cell colspan={renderColumns.length + extraCols} class="p-0">
                  <div class="w-full">
                    <LoadingBar size="xs" />
                    <div class="grid min-h-56 place-items-center p-3">
                      <div class="relative flex flex-col items-center gap-2 text-center">
                        <div class="pb-watermark-loading">
                          <Hourglass class="size-20 text-info" />
                        </div>
                        <div class="text-sm font-medium text-muted-foreground">{loadingText}</div>
                      </div>
                    </div>
                  </div>
                </Table.Cell>
              </Table.Row>
            {/if}
          {:else if rows.length === 0}
            {#if emptyView}
              {@render emptyView()}
            {:else}
              <Table.Row>
                <Table.Cell colspan={renderColumns.length + extraCols} class="p-0">
                  <div class="grid min-h-56 place-items-center p-3">
                    <div class="relative flex flex-col items-center gap-2 text-center">
                      <div class="pb-watermark-empty">
                        <TriangleAlert class="size-20 text-warning" />
                      </div>
                      <div class="text-sm font-medium text-muted-foreground">{emptyText}</div>
                    </div>
                  </div>
                </Table.Cell>
              </Table.Row>
            {/if}
          {:else if viewRows.length === 0}
            <Table.Row>
              <Table.Cell colspan={renderColumns.length + extraCols} class="p-0">
                <div class="grid min-h-56 place-items-center p-3">
                  <div class="relative flex flex-col items-center gap-2 text-center">
                    <div class="pb-watermark-empty">
                      <TriangleAlert class="size-20 text-warning" />
                    </div>
                    <div class="text-sm font-medium text-muted-foreground">
                      {#if showSelectedOnly && selectionCount > 0 && orderedSelectedRows.length === 0}
                        {$t('entities.list.selectedRowsNotLoadedHint')}
                      {:else}
                        {$t('entities.list.noSelectedRowsInView')}
                      {/if}
                    </div>
                  </div>
                </div>
              </Table.Cell>
            </Table.Row>
          {:else}
            {#key datetimeIanaRenderTick}
            {#each viewRows as r, i (rowKey(r))}
              {@const rk = rowKey(r)}
              {@const rowSelected = rowSelectionEnabled && selectedKeys.includes(rk)}
              {@const rowDeleted = isRowDeleted(r)}
              <Table.Row
                suppressCellHoverMuted
                data-row-index={rowSelectionEnabled ? i : undefined}
                data-state={rowSelected ? 'selected' : undefined}
                class={cn(
                  'group/entity-row',
                  rowSelected ? 'data-[state=selected]:bg-transparent!' : undefined
                )}
                onmousedown={rowSelectionEnabled ? (e) => onRowRangeMouseDown(i, e) : undefined}
                onclick={rowSelectionEnabled ? (e) => onEntityRowClick(rk, e) : undefined}
              >
                {#if rowSelectionEnabled}
                  <Table.Cell
                    class={cn(
                      'w-10 min-w-10 max-w-10 sticky left-0 z-50 bg-clip-border p-2',
                      rowDeleted
                        ? entityListDestructiveChromeCellClass(rowSelected)
                        : entityListGrayChromeCellClass(rowSelected)
                    )}
                  >
                    <div class={cn('flex items-center justify-center', rowChromeH)}>
                      <Checkbox
                        class={checkboxInteractiveClass}
                        checked={selectedKeys.includes(rk)}
                        onCheckedChange={() => toggleRowSelect(rk)}
                        aria-label="select row"
                      />
                    </div>
                  </Table.Cell>
                {/if}
                {#each renderColumns as col, colIdx (col.key)}
                  {#if col.key === 'uuid'}
                    {#if i === 0}
                      <Table.Cell
                        bind:ref={uuidFirstCellRef}
                        class={cn(
                          stickyCellClass(col.key, colIdx, false),
                          datetimeIanaCellHighlightClass(col, rowSelected),
                          isDatetimeIanaRecordMode(col)
                            ? undefined
                            : (rowDeleted
                              ? entityListDestructiveBandStickyInteractionClass(rowSelected)
                              : entityListGrayBandStickyInteractionClass(rowSelected)),
                          entityListDataCellValignClass(col)
                        )}
                      >
                        {#if cell}
                          {@render cell({ row: r, column: col })}
                        {:else}
                          {@render listDefaultCellValue(r, col)}
                        {/if}
                      </Table.Cell>
                    {:else}
                      <Table.Cell
                        class={cn(
                          stickyCellClass(col.key, colIdx, false),
                          datetimeIanaCellHighlightClass(col, rowSelected),
                          isDatetimeIanaRecordMode(col)
                            ? undefined
                            : (rowDeleted
                              ? entityListDestructiveBandStickyInteractionClass(rowSelected)
                              : entityListGrayBandStickyInteractionClass(rowSelected)),
                          entityListDataCellValignClass(col)
                        )}
                      >
                        {#if cell}
                          {@render cell({ row: r, column: col })}
                        {:else}
                          {@render listDefaultCellValue(r, col)}
                        {/if}
                      </Table.Cell>
                    {/if}
                  {:else if col.key === 'code'}
                    {#if i === 0}
                      <Table.Cell
                        bind:ref={codeFirstCellRef}
                        class={cn(
                          stickyCellClass(col.key, colIdx, false),
                          datetimeIanaCellHighlightClass(col, rowSelected),
                          isDatetimeIanaRecordMode(col)
                            ? undefined
                            : (rowDeleted
                              ? entityListDestructiveBandStickyInteractionClass(rowSelected)
                              : entityListGrayBandStickyInteractionClass(rowSelected)),
                          entityListDataCellValignClass(col)
                        )}
                      >
                        {#if cell}
                          {@render cell({ row: r, column: col })}
                        {:else}
                          {@render listDefaultCellValue(r, col)}
                        {/if}
                      </Table.Cell>
                    {:else}
                      <Table.Cell
                        class={cn(
                          stickyCellClass(col.key, colIdx, false),
                          datetimeIanaCellHighlightClass(col, rowSelected),
                          isDatetimeIanaRecordMode(col)
                            ? undefined
                            : (rowDeleted
                              ? entityListDestructiveBandStickyInteractionClass(rowSelected)
                              : entityListGrayBandStickyInteractionClass(rowSelected)),
                          entityListDataCellValignClass(col)
                        )}
                      >
                        {#if cell}
                          {@render cell({ row: r, column: col })}
                        {:else}
                          {@render listDefaultCellValue(r, col)}
                        {/if}
                      </Table.Cell>
                    {/if}
                  {:else}
                    <Table.Cell
                      class={cn(
                        stickyCellClass(col.key, colIdx, false),
                        datetimeIanaCellHighlightClass(col, rowSelected),
                        isDatetimeIanaRecordMode(col)
                          ? undefined
                          : (rowDeleted
                            ? entityListDestructiveScrollInteractionClass(rowSelected)
                            : entityListDefaultScrollInteractionClass(rowSelected)),
                        entityListDataCellValignClass(col)
                      )}
                    >
                      {#if cell}
                        {@render cell({ row: r, column: col })}
                      {:else}
                        {@render listDefaultCellValue(r, col)}
                      {/if}
                    </Table.Cell>
                  {/if}
                {/each}
                {#if actionsEnabled}
                  <Table.Cell
                    class={cn(
                      'w-10 min-w-10 max-w-10 sticky right-0 z-50 bg-clip-border p-2',
                      entityListGrayChromeCellClass(rowSelected)
                    )}
                  >
                    <div class={cn('flex items-center justify-center', rowChromeH)}>
                      {#if rowActions}
                        {@render rowActions({ row: r })}
                      {:else}
                        <DropdownMenu.Root open={dropdownMenuRow === r}>
                          <DropdownMenu.Trigger>
                            {#snippet child({ props })}
                              <Button 
                                {...props}
                                variant="ghost" 
                                size="icon-sm" 
                                aria-label="row actions" 
                                title="actions"
                                onclick={(e) => {
                                  e.stopPropagation();
                                  openRowDropdown(r);
                                }}
                              >
                                <MoreVertical class="size-4" />
                              </Button>
                            {/snippet}
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Content class="w-56" align="end">
                            {#if entityRowActions?.edit !== false}
                              <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleEditRow(r); }}>
                                <div class="flex items-center gap-2">
                                  <Pencil class="size-4 opacity-70" />
                                  <span>{$t('common.edit')}</span>
                                </div>
                              </DropdownMenu.Item>
                            {/if}
                            {#if entityRowActions?.duplicate !== false}
                              <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleDuplicateRow(r); }}>
                                <div class="flex items-center gap-2">
                                  <Copy class="size-4 opacity-70" />
                                  <span>{$t('common.duplicate')}</span>
                                </div>
                              </DropdownMenu.Item>
                            {/if}
                            {#if entityRowActions?.delete !== false}
                              <DropdownMenu.Separator />
                              <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleDeleteRow(r); }} class="text-destructive">
                                <div class="flex items-center gap-2">
                                  <Trash2 class="size-4 text-destructive/70" />
                                  <span>{$t('common.delete')}</span>
                                </div>
                              </DropdownMenu.Item>
                            {/if}
                          </DropdownMenu.Content>
                        </DropdownMenu.Root>
                      {/if}
                    </div>
                  </Table.Cell>
                {/if}
              </Table.Row>
            {/each}
            {/key}
          {/if}
        </Table.Body>
      </Table.Root>
    {/if}
    {/if}
  </div>

  <div
    class={cn(
      'flex items-center justify-between gap-3 border-t bg-background px-3 py-2',
      compactRows ? 'text-xs' : 'text-sm'
    )}
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div class="text-muted-foreground">
        {#if footerRangeTotal === 0}
          0
        {:else}
          {footerRangeStart}-{footerRangeEnd} / {footerRangeTotal}
        {/if}
      </div>
      {#if rowSelectionEnabled && selectionCount > 0}
        <div class="flex items-center gap-1.5 text-info">
          <span class="inline-flex flex-wrap items-baseline gap-x-1">
            {selectionCount}
            {#if selectionCount === 1}
              {#if selectionLabelSingularText}
                {' '}{selectionLabelSingularText}{' '}
              {:else if selectionLabelSingularKey}
                {' '}{$t(selectionLabelSingularKey)}{' '}
              {:else if selectionLabelText}
                {' '}{selectionLabelText}{' '}
              {:else if selectionLabelKey}
                {' '}{$t(selectionLabelKey)}{' '}
              {/if}
            {:else if selectionLabelText}
              {' '}{selectionLabelText}{' '}
            {:else if selectionLabelKey}
              {' '}{$t(selectionLabelKey)}{' '}
            {/if}
            {$t(selectionPastParticipleKey)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            class="shrink-0 text-info hover:bg-info/10 hover:text-info"
            aria-pressed={showSelectedOnly}
            title={showSelectedOnly ? $t('entities.list.viewAllRowsTitle') : $t('entities.list.viewSelectedOnlyTitle')}
            aria-label={showSelectedOnly ? $t('entities.list.viewAllRowsTitle') : $t('entities.list.viewSelectedOnlyTitle')}
            onclick={() => {
              const next = !showSelectedOnly;
              showSelectedOnly = next;
              if (next) clientSelectedPage = 1;
            }}
          >
            {#if showSelectedOnly}
              <EyeOff class="size-4" />
            {:else}
              <Eye class="size-4" />
            {/if}
          </Button>
        </div>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <span class="text-muted-foreground">{$t('entities.list.pageSize')}</span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button variant="soft" size="xs" {...props}>
              {pageSize}
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {#each pageSizeOptions as opt (opt)}
            <DropdownMenu.Item
              class={dropdownMenuSelectedItemClass(opt === pageSize)}
              onSelect={() => {
                onPageSizeChange(opt);
              }}
            >
              {opt}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <div class="mx-1 h-6 w-px bg-border/60" aria-hidden="true"></div>

      <div class="flex items-center gap-2">
        <Button
          variant="soft"
          size="xs"
          disabled={footerPage <= 1}
          onclick={() => {
            if (footerUsesClientPaging) clientSelectedPage = 1;
            else onPageChange(1);
          }}
          aria-label={$t('entities.list.firstPage')}
          title={$t('entities.list.firstPage')}
        >
          <ChevronsLeft class="size-4" />
        </Button>
        <Button
          variant="soft"
          size="xs"
          disabled={footerPage <= 1}
          onclick={() => {
            if (footerUsesClientPaging) clientSelectedPage = Math.max(1, clientSelectedPage - 1);
            else onPageChange(Math.max(1, page - 1));
          }}
          aria-label={$t('entities.list.previousPage')}
          title={$t('entities.list.previousPage')}
        >
          <ChevronLeft class="size-4" />
        </Button>
        <div class="whitespace-nowrap px-0.5 text-center tabular-nums text-muted-foreground">
          {$t('entities.list.paginationStatus')
            .replace('{page}', String(footerPage))
            .replace('{total}', String(footerTotalPages))}
        </div>
        <Button
          variant="soft"
          size="xs"
          disabled={footerPage >= footerTotalPages}
          onclick={() => {
            if (footerUsesClientPaging) clientSelectedPage = Math.min(footerTotalPages, clientSelectedPage + 1);
            else onPageChange(Math.min(totalPages, page + 1));
          }}
          aria-label={$t('entities.list.nextPage')}
          title={$t('entities.list.nextPage')}
        >
          <ChevronRight class="size-4" />
        </Button>
        <Button
          variant="soft"
          size="xs"
          disabled={footerPage >= footerTotalPages}
          onclick={() => {
            if (footerUsesClientPaging) clientSelectedPage = footerTotalPages;
            else onPageChange(totalPages);
          }}
          aria-label={$t('entities.list.lastPage')}
          title={$t('entities.list.lastPage')}
        >
          <ChevronsRight class="size-4" />
        </Button>
      </div>
    </div>
  </div>
</div>

<!-- Delete confirmation dialog -->
<DialogBordered bind:open={deleteConfirmDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('common.deleteConfirmTitle')}</Dialog.Title>
    <Dialog.Description>{$t('common.deleteConfirm')}</Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0">
    <Button
      variant="secondary"
      class="border border-neutral-300 hover:border-neutral-400 hover:bg-accent hover:text-accent-foreground hover:scale-105 transition-all"
      onclick={() => {
        deleteConfirmDialogOpen = false;
        rowToDelete = null;
      }}
    >
      {$t('common.cancel')}
    </Button>
    <Button
      class="bg-destructive text-destructive-foreground hover:bg-destructive/80 hover:scale-105 transition-all"
      onclick={confirmDeleteRow}
    >
      {$t('common.delete')}
    </Button>
  </Dialog.Footer>
</DialogBordered>

<!-- Bulk delete confirmation dialog -->
<DialogBordered bind:open={bulkDeleteConfirmDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('entities.list.bulkActions.deleteConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      Sei sicuro di voler eliminare {selectedKeys.length} elementi?
    </Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0">
    <Button
      variant="secondary"
      class="border border-neutral-300 hover:border-neutral-400 hover:bg-accent hover:text-accent-foreground hover:scale-105 transition-all"
      onclick={cancelBulkDelete}
    >
      {$t('common.cancel')}
    </Button>
    <Button
      class="bg-destructive text-destructive-foreground hover:bg-destructive/80 hover:scale-105 transition-all"
      onclick={confirmBulkDelete}
      disabled={isBulkDeleting}
    >
      {#if isBulkDeleting}
        {$t('common.deleting')}
      {:else}
        {$t('common.delete')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>

<!-- Export confirmation dialog -->
<DialogBordered bind:open={exportConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('common.exportConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      {#if selectedKeys.length > 0}
        {$t('common.exportConfirm')} {selectedKeys.length} {$t(`entities.${entity}.plural`)}?
      {:else}
        {$t('common.exportConfirm')} {total} {$t(`entities.${entity}.plural`)}?
      {/if}
    </Dialog.Description>
  </Dialog.Header>
  {#if selectedKeys.length > 0}
    <div class="py-4">
      <Choicebox bind:value={exportScope}>
        <ChoiceboxItem value="selected">
          <ChoiceboxTitle>Solo i {selectedKeys.length} elementi selezionati</ChoiceboxTitle>
          <ChoiceboxDescription>Esporta solo gli elementi selezionati nella tabella</ChoiceboxDescription>
          <ChoiceboxIndicator />
        </ChoiceboxItem>
        <ChoiceboxItem value="all">
          <ChoiceboxTitle>Tutti i {total} elementi</ChoiceboxTitle>
          <ChoiceboxDescription>Esporta tutti gli elementi della tabella (con filtri correnti)</ChoiceboxDescription>
          <ChoiceboxIndicator />
        </ChoiceboxItem>
      </Choicebox>
    </div>
  {/if}
  <Dialog.Footer class="gap-2 sm:space-x-0 flex-col sm:flex-row">
    <Button
      variant="secondary"
      class="border border-neutral-300 hover:border-neutral-400 hover:bg-accent hover:text-accent-foreground hover:scale-105 transition-all"
      onclick={cancelExportRow}
    >
      {$t('common.cancel')}
    </Button>
    <div class="flex gap-2 w-full sm:w-auto">
      <Button
        class="bg-warning text-warning-foreground hover:bg-warning/80 hover:scale-105 transition-all flex-1 sm:flex-none"
        onclick={() => { exportFileType = 'xlsx'; confirmExportRow(); }}
        disabled={isExporting}
      >
        {#if isExporting && exportFileType === 'xlsx'}
          {$t('common.exporting')}
        {:else}
          <BsFiletypeXlsx class="size-5" />
          {$t('common.exportExcel')}
        {/if}
      </Button>
      <Button
        class="bg-warning text-warning-foreground hover:bg-warning/80 hover:scale-105 transition-all flex-1 sm:flex-none"
        onclick={() => { exportFileType = 'csv'; confirmExportRow(); }}
        disabled={isExporting}
      >
        {#if isExporting && exportFileType === 'csv'}
          {$t('common.exporting')}
        {:else}
          <BsFiletypeCsv class="size-5" />
          {$t('common.exportCsv')}
        {/if}
      </Button>
    </div>
  </Dialog.Footer>
</DialogBordered>

<!-- HTML export confirmation dialog -->
<DialogBordered bind:open={htmlExportConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('common.exportHtmlConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      {#if selectedKeys.length > 0}
        {$t('common.exportHtmlConfirm')} {selectedKeys.length} {$t(`entities.${entity}.plural`)}?
      {:else}
        {$t('common.exportHtmlConfirm')} {total} {$t(`entities.${entity}.plural`)}?
      {/if}
    </Dialog.Description>
  </Dialog.Header>
  {#if selectedKeys.length > 0}
    <div class="py-4">
      <Choicebox bind:value={htmlExportScope}>
        <ChoiceboxItem value="selected">
          <ChoiceboxTitle>Solo i {selectedKeys.length} elementi selezionati</ChoiceboxTitle>
          <ChoiceboxDescription>Esporta solo gli elementi selezionati nella tabella</ChoiceboxDescription>
          <ChoiceboxIndicator />
        </ChoiceboxItem>
        <ChoiceboxItem value="all">
          <ChoiceboxTitle>Tutti i {total} elementi</ChoiceboxTitle>
          <ChoiceboxDescription>Esporta tutti gli elementi della tabella (con filtri correnti)</ChoiceboxDescription>
          <ChoiceboxIndicator />
        </ChoiceboxItem>
      </Choicebox>
    </div>
  {/if}
  <Dialog.Footer class="gap-2 sm:space-x-0 flex-col sm:flex-row">
    <Button
      variant="secondary"
      class="border border-neutral-300 hover:border-neutral-400 hover:bg-accent hover:text-accent-foreground hover:scale-105 transition-all"
      onclick={cancelHtmlExport}
    >
      {$t('common.cancel')}
    </Button>
    <Button
      class="bg-warning text-warning-foreground hover:bg-warning/80 hover:scale-105 transition-all flex-1 sm:flex-none"
      onclick={confirmHtmlExport}
      disabled={isHtmlExporting}
    >
      {#if isHtmlExporting}
        {$t('common.exporting')}
      {:else}
        {$t('common.confirm')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>

<!-- Duplicate confirmation dialog -->
<DialogBordered bind:open={duplicateConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('common.duplicateConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      {#if duplicateScope === 'single'}
        {$t('common.duplicateConfirmSingle')}?
      {:else}
        {$t('common.duplicateConfirm')} {selectedKeys.length} {$t(`entities.${entity}.plural`)}?
      {/if}
    </Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0 flex-col sm:flex-row">
    <Button
      variant="secondary"
      class="border border-neutral-300 hover:border-neutral-400 hover:bg-accent hover:text-accent-foreground hover:scale-105 transition-all"
      onclick={cancelDuplicate}
    >
      {$t('common.cancel')}
    </Button>
    <Button
      class="bg-warning text-warning-foreground hover:bg-warning/80 hover:scale-105 transition-all flex-1 sm:flex-none"
      onclick={confirmDuplicate}
      disabled={isDuplicating}
    >
      {#if isDuplicating}
        {$t('common.duplicating')}
      {:else}
        {$t('common.confirm')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>

<!-- HTML preview full-screen dialog -->
<DialogBordered bind:open={htmlPreviewDialogOpen} color="primary" class="!w-[95vw] !h-[95vh] !max-w-none !max-h-none !p-0 flex flex-col [&>div:nth-child(2)]:flex [&>div:nth-child(2)]:flex-col [&>div:nth-child(2)]:flex-1 [&>div:nth-child(2)]:min-h-0 [&>div:nth-child(2)]:!p-4" showCloseButton={false}>
  <Dialog.Header class="pb-4 shrink-0">
    <Dialog.Title>{$t('common.htmlPreviewTitle')}</Dialog.Title>
  </Dialog.Header>
  
  <!-- Navigation dock -->
  <div class="relative shrink-0">
    <Dock.Root class="!absolute -top-12 left-1/2 -translate-x-1/2 z-10 !bg-primary/10 !border-primary/20 dark:!bg-primary/10" magnification={70} distance={120}>
      <Dock.Icon
        onclick={() => { previewMode = 'html'; pdfBlobUrl = null; }}
        tooltip="HTML view"
        selected={previewMode === 'html'}
      >
        <BsFiletypeHtml class="w-6 h-6" />
      </Dock.Icon>
      <Dock.Icon
        onclick={generatePdfPreview}
        tooltip="PDF view"
        selected={previewMode === 'pdf'}
      >
        <BsFiletypePdf class="w-6 h-6" />
      </Dock.Icon>
      <Dock.Icon
        onclick={prepareEmailHtml}
        tooltip="Email"
        selected={previewMode === 'email'}
      >
        <BsEnvelopeAt class="w-6 h-6" />
      </Dock.Icon>
    </Dock.Root>
  </div>
  
  <!-- Preview content -->
  <div class="flex-1 overflow-hidden bg-background min-h-0 rounded-md relative">
    {#if previewMode === 'html'}
      <iframe
        srcdoc={htmlPreviewContent}
        class="w-full h-full border-0"
        title="HTML Preview"
      ></iframe>
    {:else if previewMode === 'pdf' && pdfBlobUrl}
      <iframe
        src={pdfBlobUrl}
        class="w-full h-full border-0"
        title="PDF Preview"
      ></iframe>
    {:else if previewMode === 'pdf'}
      <div class="flex items-center justify-center h-full">
        <p class="text-muted-foreground">Generating PDF...</p>
      </div>
    {:else if previewMode === 'email'}
      <div class="w-full h-full">
        {#if isEmailPreparing}
          <div class="flex items-center justify-center h-full">
            <p class="text-muted-foreground">Preparing email HTML...</p>
          </div>
        {:else}
          <Window
            class="!aspect-auto h-full w-full flex flex-col"
            contentClass="flex-1 min-h-0 !p-0"
          >
            <div class="flex h-full w-full overflow-hidden bg-background">
              <Resizable.PaneGroup direction="horizontal">
                <!-- PANNELLO SINISTRO: Elenco Mail (30% larghezza) -->
                <Resizable.Pane defaultSize={30} minSize={20}>
                  <ScrollArea class="h-full border-r p-4 bg-muted/20">
                    <h3 class="text-sm font-semibold mb-4 px-2 tracking-tight text-muted-foreground">Mailbox</h3>
                    <div class="space-y-2">
                      <!-- Item Mail Attivo (skeleton evidenziato) -->
                      <div class="p-3 space-y-2 border rounded-lg bg-card shadow-sm border-primary/50">
                        <Skeleton class="h-4 w-3/4" />
                        <Skeleton class="h-3 w-1/2" />
                      </div>
                      
                      <!-- Skeleton per altre mail -->
                      <div class="p-3 space-y-2 border rounded-lg opacity-50">
                        <Skeleton class="h-4 w-2/3" />
                        <Skeleton class="h-3 w-1/3" />
                      </div>
                      <div class="p-3 space-y-2 border rounded-lg opacity-50">
                        <Skeleton class="h-4 w-3/4" />
                        <Skeleton class="h-3 w-1/2" />
                      </div>
                    </div>
                  </ScrollArea>
                </Resizable.Pane>

                <Resizable.Handle withHandle />

                <!-- PANNELLO DESTRO: Area di Contenuto (Preview) -->
                <Resizable.Pane defaultSize={70}>
                  <div class="flex flex-col h-full bg-background min-h-0">
                    
                    <!-- Header dell'email (To, Subject) -->
                    <div class="p-4 border-b space-y-3 bg-card shrink-0">
                      <div class="text-sm text-muted-foreground flex gap-2 items-center">
                        <span class="font-medium">A:</span> 
                        <span class="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">recipient@example.com</span>
                      </div>
                      <div class="text-sm text-muted-foreground flex gap-2 items-center">
                        <span class="font-medium">Subject:</span>
                        <Skeleton class="h-4 flex-1" />
                      </div>
                    </div>

                    <!-- Area dell'IFrame -->
                    <div class="flex-1 bg-muted/10 relative h-full min-h-0">
                      <!-- L'iframe che ospita l'HTML puro del foglio e della tabella -->
                      <iframe 
                        title="Email Preview"
                        srcdoc={emailHtmlContent}
                        class="w-full h-full border-0 bg-white"
                        sandbox="allow-same-origin"
                      ></iframe>
                    </div>

                  </div>
                </Resizable.Pane>
                
              </Resizable.PaneGroup>
            </div>
          </Window>
        {/if}
      </div>
    {/if}
  </div>
  
  <Dialog.Footer class="gap-2 shrink-0">
    <Button
      variant="secondary"
      class="border border-neutral-300 hover:border-neutral-400 hover:bg-accent hover:text-accent-foreground hover:scale-105 transition-all"
      onclick={closeHtmlPreview}
    >
      {$t('common.close')}
    </Button>
    {#if previewMode === 'email'}
      <Button onclick={copyEmailHtmlToClipboard} disabled={isEmailPreparing || !emailHtmlContent}>
        {#if emailCopied}
          Copied!
        {:else}
          Copy HTML to Clipboard
        {/if}
      </Button>
    {:else if previewMode === 'pdf'}
      <Button onclick={downloadPdf} disabled={!pdfBlobUrl}>
        Scarica PDF
      </Button>
    {:else}
      <Button onclick={copyHtmlToClipboard} disabled={previewMode !== 'html'}>
        {$t('common.copyHtml')}
      </Button>
    {/if}
  </Dialog.Footer>
</DialogBordered>

<style>
  @keyframes pb-watermark-pulse {
    0%,
    100% {
      opacity: 0.12;
      transform: translateY(0) scale(1);
    }
    50% {
      opacity: 0.22;
      transform: translateY(-6px) scale(1.06);
    }
  }

  @keyframes pb-watermark-hourglass {
    0% {
      transform: rotate(0deg) scale(1);
      opacity: 0.12;
    }
    45% {
      transform: rotate(0deg) scale(1.06);
      opacity: 0.22;
    }
    55% {
      transform: rotate(180deg) scale(1.06);
      opacity: 0.22;
    }
    100% {
      transform: rotate(180deg) scale(1);
      opacity: 0.12;
    }
  }

  .pb-watermark-empty {
    transform-origin: center;
    animation: pb-watermark-pulse 2.6s ease-in-out infinite;
  }

  .pb-watermark-loading {
    transform-origin: center;
    animation: pb-watermark-hourglass 1.8s ease-in-out infinite alternate;
  }

  @keyframes pb-watermark-error {
    0%,
    100% {
      opacity: 0.1;
      transform: scale(1);
    }
    50% {
      opacity: 0.18;
      transform: scale(1.05);
    }
  }

  .pb-watermark-error {
    transform-origin: center;
    animation: pb-watermark-error 2.2s ease-in-out infinite;
  }
</style>
