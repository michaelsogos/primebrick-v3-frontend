<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { badgeClassesFromToken } from '$lib/colors/badge';
  import { Checkbox, checkboxVisualOnlyClass, checkboxInteractiveClass } from '$lib/components/ui/checkbox';
  import { LoadingBar } from '$lib/components/ui/loading-bar';
  import { Switch } from '$lib/components/ui/switch';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Table from '$lib/components/ui/table';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Dialog as DialogPrimitive } from 'bits-ui';
  import { scale, fade, fly, slide } from 'svelte/transition';
  import { cn } from '$lib/utils.js';
  import { apiFetch } from '$lib/api';
  import { pushImpactError, pushRFC7807Error } from '$lib/errors/app-errors';
  import type { RFC7807Error } from '$lib/errors/rfc7807';
  import { closeSheet, openSheet, sheetState } from '$lib/shell/sheets/sheet-manager.svelte';
  import { FiltersPanel, VersionHistoryPanel, SearchInPanel, ColumnSelectorPanel } from './panels';
  import { SearchBar, ViewModeToggle, DeletionFilterToggle, BulkActions } from './toolbar';
  import { TableHeader, TableCell } from './table';
  import { CardField, CardGrid, CardList } from './cards';
  import { DeleteDialog, RestoreDialog, ExportDialog, DuplicateDialog } from './dialogs';
  import { Pagination } from './pagination';
  import {
    useStickyColumns,
    useScrollPreservation,
    useRowRangeSelection,
    useFilterPersistence,
    useToolbarMode
  } from './composables';
  import { useExport } from './composables/useExport.svelte.js';
  import { useBulkActions } from './composables/useBulkActions.svelte.js';
  import { useRowActions } from './composables/useRowActions.svelte.js';
  import { useDialogs } from './composables/useDialogs.svelte.js';
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
    ChevronDown,
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
    PencilOff,
    Trash,
    Trash2,
    ArrowUpFromLine,
    AlertCircle,
    PanelRightClose,
    PanelRightOpen,
    Copy,
    Download,
    Funnel,
    CircleCheck,
    Info,
    RefreshCw,
    FileClock
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
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import * as Timeline from '$lib/components/ui/timeline';

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
    onRefresh,
    refreshDisabled = false,
    rowActionsEnabled = false,
    rowActions,
    entityRowActions,
    onCreateAction,
    onEditAction,
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
    onRefresh: () => void;
    refreshDisabled?: boolean;
    rowActionsEnabled?: boolean;
    rowActions?: Snippet<[ { row: TRow } ]>;
    entityRowActions?: {
      duplicate?: boolean;
      delete?: boolean;
      edit?: boolean;
      preview?: boolean;
    };
    onCreateAction?: () => void;
    onEditAction?: (row: TRow) => void;
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
  // Read from sessionStorage eagerly (before effects run) to avoid the effect overwriting the stored value
  const _rawDeletion = (() => {
    if (typeof window === 'undefined') return null;
    const key = columnOrderStorageKey ? `${columnOrderStorageKey}:deletionFilter` : `pb.entityList:${uid}:deletionFilter`;
    return window.sessionStorage.getItem(key);
  })();
  const _initialDeletionMode: DeletionFilterMode | null =
    _rawDeletion === 'non_deleted' || _rawDeletion === 'deleted' || _rawDeletion === 'all' ? _rawDeletion : null;
  let deletionFilterMode = $state<DeletionFilterMode>(_initialDeletionMode ?? deletionFilterModeProp ?? 'non_deleted');

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
    filterPersistence.writeFilterValues({});
    filterPersistence.writeAdvancedFilters([]);
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
    if (storedDeletionFilter) {
      deletionFilterMode = storedDeletionFilter;
      // If the restored value differs from what the parent passed, notify the parent so it re-fetches
      if (storedDeletionFilter !== (deletionFilterModeProp ?? 'non_deleted')) {
        onDeletionFilterModeChange?.(storedDeletionFilter);
      }
    }

    // Initialize filters from sessionStorage. Only fire the callback when the stored
    // values actually differ from the current prop, to avoid an unnecessary refresh
    // when the parent already holds the same values (e.g. after a page refresh where
    // bootstrap already loaded rows with the restored filters).
    const storedFilterValues = filterPersistence.readFilterValues();
    if (
      Object.keys(storedFilterValues).length > 0 &&
      JSON.stringify(storedFilterValues) !== JSON.stringify(filterValues ?? {})
    ) {
      onFilterValuesChange?.(storedFilterValues);
    }

    const storedAdvancedFilters = filterPersistence.readAdvancedFilters();
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
    filterPersistence.writeFilterValues(filterValues ?? {});
  });

  $effect(() => {
    void advancedFilters;
    filterPersistence.writeAdvancedFilters(advancedFilters ?? []);
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

  const compactRows = $derived(true);
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
   * Get audit field value with _name fallback.
   * For audit fields (created_by, updated_by, deleted_by), checks for the corresponding
   * _name field (e.g., created_by_name) and uses it as fallback to show human-readable names.
   */
  function getAuditFieldValue(row: TRow, col: MetaColumn): string {
    const r = row as Record<string, unknown>;
    const raw = r[col.key];

    // Check if this is an audit field that should have a _name variant
    const auditFields = ['created_by', 'updated_by', 'deleted_by'];
    if (auditFields.includes(col.key)) {
      const nameField = `${col.key}_name`;
      const nameValue = r[nameField];
      // Use _name if present and non-empty, otherwise use original value
      if (!isBlankish(nameValue)) {
        return String(nameValue);
      }
    }

    // For non-audit fields or if _name is empty, use original value
    if (isBlankish(raw)) return '-';
    return formatListCellValue(col, raw, $uiLang);
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

  /** Row dropdown menu state: which row has the menu open */
  let dropdownMenuRow = $state<TRow | null>(null);
  /** Preview panel dropdown menu state */
  let previewDropdownOpen = $state(false);

  /** Delete confirmation dialog state */
  let deleteConfirmDialogOpen = $state(false);
  let rowToDelete: TRow | null = null;
  let isDeleting = $state(false);

  /** Restore confirmation dialog state */
  let restoreConfirmDialogOpen = $state(false);
  let rowToRestore: TRow | null = null;
  let isRestoring = $state(false);

  /** Bulk delete confirmation dialog state */
  let bulkDeleteConfirmDialogOpen = $state(false);
  let isBulkDeleting = $state(false);

  /** Bulk restore confirmation dialog state */
  let bulkRestoreConfirmDialogOpen = $state(false);
  let isBulkRestoring = $state(false);

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

  /** Entity preview panel state */
  const _sessionRaw = (() => {
    if (typeof sessionStorage === 'undefined') return null;
    const key = `pb-preview-panel:${entity ?? 'default'}`;
    return sessionStorage.getItem(key);
  })();
  const _sessionState = _sessionRaw ? JSON.parse(_sessionRaw) : null;

  let previewPanelOpen = $state<boolean>(_sessionState?.open ?? false);
  let previewRow = $state<TRow | null>(null);
  let previewRowIndex = $state(0);
  let previewEditMode = $state(false);
  let navigatingToNextPage = $state(false);
  let navigatingToPrevPage = $state(false);
  let previewPanelWidth = $state<number>(_sessionState?.width ?? 30); // percentage
  let isResizing = $state(false);
  let _previewRestoredKey = $state<string | null>(_sessionState?.rowKey ?? null);
  let focusedRowIndex = $state<number | null>(null);

  $effect(() => {
    if (typeof sessionStorage !== 'undefined') {
      // While restoring, preserve the key from session until previewRow is actually set
      const rowKey_ = previewRow
        ? String((previewRow as Record<string, unknown>)[uid])
        : (_previewRestoredKey ?? null);
      const key = `pb-preview-panel:${entity ?? 'default'}`;
      sessionStorage.setItem(key, JSON.stringify({ open: previewPanelOpen, width: previewPanelWidth, rowKey: rowKey_ }));
    }
  });

  $effect(() => {
    if (_previewRestoredKey && previewPanelOpen && !rowsLoading && rows.length > 0) {
      const idx = rows.findIndex((r) => String((r as Record<string, unknown>)[uid]) === _previewRestoredKey);
      if (idx !== -1) {
        previewRow = rows[idx];
        previewRowIndex = viewRows.findIndex((r) => String((r as Record<string, unknown>)[uid]) === _previewRestoredKey);
        focusedRowIndex = previewRowIndex;
        _previewRestoredKey = null;
      }
    }
  });

  /** Preview panel resize handlers */
  let resizeStartX = $state(0);
  let resizeStartWidth = $state(0);

  function startResize(e: MouseEvent) {
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartWidth = previewPanelWidth;
    e.preventDefault();
  }

  function handleResize(e: MouseEvent) {
    if (!isResizing) return;
    const container = e.currentTarget as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const deltaX = e.clientX - resizeStartX;
    const deltaPercent = (deltaX / containerRect.width) * 100;
    previewPanelWidth = Math.max(15, Math.min(70, resizeStartWidth - deltaPercent));
  }

  function stopResize() {
    isResizing = false;
  }

  async function loadVersionHistory(row: TRow) {
    const rowUuid = String((row as Record<string, unknown>)[uid]);
    openSheet('entity.versionHistory', {
      entity,
      rowUuid,
      columns: columns
    });
  }


  // Reset previewRowIndex when page changes
  $effect(() => {
    if (previewPanelOpen && viewRows.length > 0) {
      if (navigatingToNextPage) {
        // Going to next page - reset to first record
        previewRowIndex = 0;
        previewRow = viewRows[0];
        navigatingToNextPage = false;
      } else if (navigatingToPrevPage) {
        // Going to previous page - go to last record
        previewRowIndex = viewRows.length - 1;
        previewRow = viewRows[viewRows.length - 1];
        navigatingToPrevPage = false;
      } else if (previewRowIndex >= viewRows.length) {
        // If previewRowIndex is out of bounds after page change, reset it
        previewRowIndex = 0;
        previewRow = viewRows[0];
      }
    }
  });

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
    if (isRowDeleted(row)) {
      console.log('Cannot edit deleted row:', rowKey(row));
      return;
    }
    if (onEditAction) {
      onEditAction(row);
    }
    closeRowDropdown();
  }

  /** Handle preview action for a row */
  function handlePreviewRow(row: TRow) {
    previewRow = row;
    previewRowIndex = viewRows.findIndex(r => rowKey(r) === rowKey(row));
    focusedRowIndex = previewRowIndex;
    previewEditMode = false;
    previewPanelOpen = true;
    closeRowDropdown();
  }

  /** Navigate preview records */
  function navigatePreview(direction: number) {
    const newIndex = previewRowIndex + direction;
    if (newIndex >= 0 && newIndex < viewRows.length) {
      previewRowIndex = newIndex;
      previewRow = viewRows[newIndex];
      focusedRowIndex = newIndex;
    } else if (newIndex >= viewRows.length && footerPage < footerTotalPages) {
      // Trigger next page when reaching end of current page
      navigatingToNextPage = true;
      if (footerUsesClientPaging) {
        clientSelectedPage++;
      } else {
        onPageChange(page + 1);
      }
    } else if (newIndex < 0 && footerPage > 1) {
      // Trigger previous page when at start of current page
      navigatingToPrevPage = true;
      if (footerUsesClientPaging) {
        clientSelectedPage--;
      } else {
        onPageChange(page - 1);
      }
    }
  }

  /** Scroll focused row into view when index changes */
  $effect(() => {
    if (focusedRowIndex === null) return;
    const row = tableRef?.querySelector(`[data-focused-row-index="${focusedRowIndex}"]`) as HTMLElement;
    if (row) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
  /** Unified keyboard handler for preview panel and table row navigation */
  function handleGlobalKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    if (target.closest('[role="menu"]') || target.closest('[role="menuitem"]')) return;

    // Skip table row navigation if any dropdown menu is open (menu has priority)
    if (dropdownMenuRow !== null || previewDropdownOpen) return;

    if (previewPanelOpen) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigatePreview(-1);
        return;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigatePreview(1);
        return;
      }
    }

    if (viewRows.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (focusedRowIndex === null) {
        focusedRowIndex = 0;
      } else if (focusedRowIndex < viewRows.length - 1) {
        focusedRowIndex++;
      } else if (focusedRowIndex === viewRows.length - 1 && footerPage < footerTotalPages) {
        // Trigger next page when reaching end of current page
        navigatingToNextPage = true;
        if (footerUsesClientPaging) {
          clientSelectedPage++;
        } else {
          onPageChange(page + 1);
        }
      }
      if (previewPanelOpen && focusedRowIndex !== null) {
        previewRowIndex = focusedRowIndex;
        previewRow = viewRows[focusedRowIndex];
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (focusedRowIndex === null) {
        focusedRowIndex = viewRows.length - 1;
      } else if (focusedRowIndex > 0) {
        focusedRowIndex--;
      } else if (focusedRowIndex === 0 && footerPage > 1) {
        // Trigger previous page when at start of current page
        navigatingToPrevPage = true;
        if (footerUsesClientPaging) {
          clientSelectedPage--;
        } else {
          onPageChange(page - 1);
        }
      }
      if (previewPanelOpen && focusedRowIndex !== null) {
        previewRowIndex = focusedRowIndex;
        previewRow = viewRows[focusedRowIndex];
      }
    } else if (e.key === ' ' && focusedRowIndex !== null) {
      e.preventDefault();
      const row = viewRows[focusedRowIndex];
      if (row) toggleRowSelect(rowKey(row));
    } else if (e.key === 'Enter' && focusedRowIndex !== null) {
      e.preventDefault();
      const row = viewRows[focusedRowIndex];
      if (row) openRowDropdown(row);
    } else if (e.key === 'Escape') {
      closeRowDropdown();
      // Remove focus from kebab button to prevent reopening on arrow key
      // Use setTimeout to ensure it happens after dropdown's internal focus management
      setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }, 0);
    }
  }

  /** Handle delete action for a row */
  function handleDeleteRow(row: TRow) {
    // Open confirmation dialog instead of deleting directly
    rowToDelete = row;
    deleteConfirmDialogOpen = true;
    closeRowDropdown();
  }

  /** Handle restore action for a row */
  function handleRestoreRow(row: TRow) {
    // Open confirmation dialog instead of restoring directly
    rowToRestore = row;
    restoreConfirmDialogOpen = true;
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
      // Handle both RFC 7807 errors and non-RFC errors
      if (error && typeof error === 'object' && 'title' in error) {
        const err = error as RFC7807Error;
        // Ensure required RFC 7807 fields are present
        const rfcError: RFC7807Error = {
          type: err.type || 'about:blank',
          title: err.title || 'Delete failed',
          status: err.status || 500,
          detail: err.detail || 'Unknown error',
          internal_code: err.internal_code,
          instance: err.instance,
          severity: err.severity
        };
        pushRFC7807Error(rfcError, { showToast: true });
      } else {
        pushImpactError({
          impact: 'MEDIUM',
          messageKey: 'entities.list.deleteFailed',
          scope: $t('errors.scope.deleteApi'),
          detail: error instanceof Error ? error.message : String(error),
          toast: true,
        });
      }
    } finally {
      isDeleting = false;
    }
  }

  /** Confirm restore action after dialog confirmation */
  async function confirmRestoreRow() {
    if (!rowToRestore) return;
    try {
      isRestoring = true;
      const uuidValue = rowToRestore[uid] as string;
      await apiFetch(`/api/v1/entities/${entity}/${uuidValue}/restore`, {
        method: 'POST'
      });
      restoreConfirmDialogOpen = false;
      rowToRestore = null;
      // Refresh the list after successful restore
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Restore failed:', error);
      // Handle both RFC 7807 errors and non-RFC errors
      if (error && typeof error === 'object' && 'title' in error) {
        const err = error as RFC7807Error;
        // Ensure required RFC 7807 fields are present
        const rfcError: RFC7807Error = {
          type: err.type || 'about:blank',
          title: err.title || 'Restore failed',
          status: err.status || 500,
          detail: err.detail || 'Unknown error',
          internal_code: err.internal_code,
          instance: err.instance,
          severity: err.severity
        };
        pushRFC7807Error(rfcError, { showToast: true });
      } else {
        pushImpactError({
          impact: 'MEDIUM',
          messageKey: 'entities.list.restoreFailed',
          scope: $t('errors.scope.restoreApi'),
          detail: error instanceof Error ? error.message : String(error),
          toast: true,
        });
      }
    } finally {
      isRestoring = false;
    }
  }

  /** Cancel delete action */
  function cancelDeleteRow() {
    deleteConfirmDialogOpen = false;
    rowToDelete = null;
  }

  /** Bulk action handlers */
  function handleBulkDelete() {
    dialogs.openDeleteDialog();
  }

  /** Confirm bulk delete action after dialog confirmation */
  async function confirmBulkDelete() {
    await bulkActions.confirmBulkDelete();
    dialogs.closeDeleteDialog();
  }

  /** Cancel bulk delete action */
  function cancelBulkDelete() {
    dialogs.closeDeleteDialog();
  }

  function handleBulkRestore() {
    dialogs.openRestoreDialog();
  }

  /** Confirm bulk restore action after dialog confirmation */
  async function confirmBulkRestore() {
    await bulkActions.confirmBulkRestore();
    dialogs.closeRestoreDialog();
  }

  /** Cancel bulk restore action */
  function cancelBulkRestore() {
    dialogs.closeRestoreDialog();
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
    if (isRowDeleted(row)) {
      console.log('Cannot duplicate deleted row:', rowKey(row));
      return;
    }
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
    toolbarModeState.toggle();
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
        // Back-compat: use sticky flag from column metadata
        return allColumns.filter((c) => c.sticky === true);
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

  // Check if any selected records are deleted
  const hasDeletedSelected = $derived(
    orderedSelectedRows.some(r => isRowDeleted(r))
  );

  // Check if all selected records are deleted
  const allSelectedDeleted = $derived(
    orderedSelectedRows.length > 0 && orderedSelectedRows.every(r => isRowDeleted(r))
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
  const stickyColumnsState = useStickyColumns({
    rowSelectionEnabled: () => rowSelectionEnabled,
    stickyColumnsGroup: () => stickyColumnsGroup,
    visibleKeys: () => visibleKeys
  });

  // Scroll preservation
  const scrollPreservation = useScrollPreservation({
    tableRef: () => tableRef,
    rowsLoading: () => rowsLoading
  });

  // Row range selection
  const rowRangeSelection = useRowRangeSelection({
    rowSelectionEnabled: () => rowSelectionEnabled,
    selectedKeys: () => selectedKeys,
    // svelte-ignore state_referenced_locally
    onSelectedKeysChange,
    viewRows: () => viewRows,
    pageKeys: () => pageKeys,
    rowKey,
    rowsLoading: () => rowsLoading,
    error: () => error,
    page: () => clientSelectedPage,
    pageSize: () => pageSize
  });

  // Filter persistence
  const filterPersistence = useFilterPersistence({
    uid: () => uid,
    // svelte-ignore state_referenced_locally
    filterValuesStorageKey,
    // svelte-ignore state_referenced_locally
    advancedFiltersStorageKey,
    // svelte-ignore state_referenced_locally
    columnOrderStorageKey
  });

  // Toolbar mode
  const toolbarModeState = useToolbarMode({
    selectedKeys: () => selectedKeys,
    filterValues: () => filterValues,
    advancedFilters: () => advancedFilters
  });

  const exportComposable = useExport({
    entity: () => entity,
    selectedKeys: () => selectedKeys,
    uid: () => uid,
    columns: () => columns,
    search: () => search,
    searchInKeys: () => searchInKeys,
    sortKey: () => sortKey,
    sortDir: () => sortDir,
    filterValues: () => filterValues,
    advancedFilters: () => advancedFilters,
    deletionFilterMode: () => deletionFilterMode,
    onExportStart: () => {
      // Optional: handle export start
    },
    onExportComplete: () => {
      // Optional: handle export complete
    },
    onExportError: (error) => {
      // Optional: handle export error
    }
  });

  const bulkActions = useBulkActions({
    entity: () => entity,
    selectedKeys: () => selectedKeys,
    onBulkActionStart: () => {
      // Optional: handle bulk action start
    },
    onBulkActionComplete: () => {
      // Optional: handle bulk action complete
    },
    onBulkActionError: (error) => {
      // Optional: handle bulk action error
    },
    onSelectionChange: (keys) => {
      selectedKeys = keys;
    }
  });

  const rowActionsComposable = useRowActions<TRow>({
    entity: () => entity,
    uid: () => uid,
    onEditAction: onEditAction,
    onRefresh: onRefresh,
    isRowDeleted: isRowDeleted,
    rowKey: rowKey,
    onPreviewRow: (row) => {
      previewRow = row;
      previewRowIndex = viewRows.findIndex(r => rowKey(r) === rowKey(row));
      focusedRowIndex = previewRowIndex;
      previewEditMode = false;
      previewPanelOpen = true;
    },
    closeRowDropdown: closeRowDropdown,
    t: $t
  });

  const dialogs = useDialogs();

  function stickyCellClass(key: string, idx: number, isHeader: boolean): string | undefined {
    const visibleStickyCols = stickyColumnsGroup.filter((c) => visibleKeys.includes(c.key));
    const isSticky = visibleStickyCols.some(c => c.key === key);
    if (!isSticky) return undefined;

    /**
     * Sticky columns: **neutral only** (TW `gray-*` dark is slate‑tinted / blue on screen).
     * Light unchanged. Dark: header `800`, body base `900` (hover `800` / selected `700` / `600` come da `entityListGrayBandStickyInteractionClass`).
     */
    const baseBg = isHeader
      ? 'bg-neutral-200 dark:bg-neutral-800'
      : 'bg-neutral-100 dark:bg-neutral-900';
    const z = isHeader ? 'z-50' : 'z-40';
    // bg-clip-border is important: Table primitives use bg-clip-padding, which can leave the border area "see-through"
    // when sticky columns overlap scrolling content.
    return `sticky ${z} ${baseBg} bg-clip-border`.trim();
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
    if (rowRangeSelection.skipNextRowClickSelectToggle) {
      rowRangeSelection.skipNextRowClickSelectToggle = false;
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

<svelte:window onkeydown={handleGlobalKeyDown} />

{#snippet entityPreviewPanel(row: TRow)}
    {@const rowDeleted = isRowDeleted(row)}
    <div class="flex h-full flex-col bg-background">
      {#snippet headerTitle()}
        <div class="relative flex items-center">
          <div>{$t('entities.list.previewPanelTitle')}</div>
          {#if rowDeleted}
            <div class="absolute left-0 top-full -mt-[2px] text-destructive text-[10px] whitespace-nowrap">{$t('common.deletedRecord')}</div>
          {/if}
        </div>
      {/snippet}

      {#snippet headerActions()}
        <!-- Micro pagination absolutely centered in header -->
        <div class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="secondary-outline"
            onclick={() => navigatePreview(-1)}
            disabled={previewRowIndex === 0 && footerPage === 1}
            aria-label="Previous record"
            class="pointer-events-auto hover:scale-105 transition-all"
          >
            <ChevronLeft class="w-4 h-4" />
          </Button>
          <span class="text-xs font-medium w-16 text-center">
            {(footerPage - 1) * pageSize + previewRowIndex + 1} / {footerRangeTotal}
          </span>
          <Button
            size="icon-sm"
            variant="secondary-outline"
            onclick={() => navigatePreview(1)}
            disabled={previewRowIndex >= viewRows.length - 1 && footerPage >= footerTotalPages}
            aria-label="Next record"
            class="pointer-events-auto hover:scale-105 transition-all"
          >
            <ChevronRight class="w-4 h-4" />
          </Button>
        </div>

        <!-- CTAs on right -->
        {#if !rowDeleted}
          <!-- Mode switch with icons only -->
          <div class="flex items-center gap-2">
            {#if !previewEditMode}
              <PencilOff class="w-4 h-4 text-muted-foreground" />
            {:else}
              <Pencil class="w-4 h-4 text-muted-foreground" />
            {/if}
            <Switch
              bind:checked={previewEditMode}
              aria-label={$t('entities.list.editModeLabel')}
              disabled={rowDeleted}
            />
          </div>
        {/if}

        <!-- Kebab menu for row actions -->
        <DropdownMenu.Root bind:open={previewDropdownOpen}>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button 
                {...props}
                variant="ghost" 
                size="icon-sm" 
                aria-label={$t('common.more')} 
                class="mr-1"
              >
                <MoreVertical class="w-4 h-4" />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content class="w-56" align="end">
            {#if entityRowActions?.edit !== false}
              <DropdownMenu.Item
                onclick={() => { if (rowDeleted) return; handleEditRow(row); }}
                class={rowDeleted ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
              >
                <div class="flex items-center gap-2">
                  <Pencil class="size-4 opacity-70" />
                  <span>{$t('common.edit')}</span>
                </div>
              </DropdownMenu.Item>
            {/if}
            {#if entityRowActions?.duplicate !== false}
              <DropdownMenu.Item
                onclick={() => { if (rowDeleted) return; handleDuplicateRow(row); }}
                class={rowDeleted ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
              >
                <div class="flex items-center gap-2">
                  <Copy class="size-4 opacity-70" />
                  <span>{$t('common.duplicate')}</span>
                </div>
              </DropdownMenu.Item>
            {/if}
            <DropdownMenu.Item
              onclick={() => loadVersionHistory(row)}
            >
              <div class="flex items-center gap-2">
                <FileClock class="size-4 opacity-70" />
                <span>{$t('common.versionHistory')}</span>
              </div>
            </DropdownMenu.Item>
            {#if entityRowActions?.delete !== false}
              {#if rowDeleted}
                <DropdownMenu.Separator />
                <DropdownMenu.Item onclick={() => handleRestoreRow(row)} class="text-warning">
                  <div class="flex items-center gap-2">
                    <span class="relative flex items-center justify-center">
                      <Trash2 class="size-4 text-warning/70" />
                      <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                    </span>
                    <span>{$t('common.restore')}</span>
                  </div>
                </DropdownMenu.Item>
              {:else}
                <DropdownMenu.Separator />
                <DropdownMenu.Item onclick={() => handleDeleteRow(row)} class="text-destructive">
                  <div class="flex items-center gap-2">
                    <Trash2 class="size-4 text-destructive/70" />
                    <span>{$t('common.delete')}</span>
                  </div>
                </DropdownMenu.Item>
              {/if}
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <!-- Close button -->
        <Button
          onclick={() => previewPanelOpen = false}
          size="icon-sm"
          variant="ghost"
          aria-label={$t('common.close')}
        >
          <XIcon class="w-4 h-4" />
        </Button>
      {/snippet}

      <SheetHeader title={headerTitle} actions={headerActions} />

      <!-- Scrollable content -->
      <div class="flex-1 overflow-y-auto">
        {#if previewEditMode}
          <div class="px-4 py-3 text-sm text-muted-foreground">
            Edit mode - coming soon
          </div>
        {:else}
          {#if stickyColumns && stickyColumns.length > 0}
          <div class="my-2 sticky top-0 z-10 bg-background">
            <div class="flex items-center gap-2">
              <div class="h-px flex-1 bg-muted-foreground/50"></div>
              <div class="text-xs font-medium text-muted-foreground">{$t('entities.list.stickyFields')}</div>
              <div class="h-px flex-1 bg-muted-foreground/50"></div>
            </div>
          </div>
            <div class="px-2 grid grid-cols-2 gap-2 min-w-0">
              {#each stickyColumns as col}
                {@const isIanaRecordMode = col.type === 'datetime' && col.datetimeIanaToggle && (datetimeIanaModeByKey[col.key] ?? 'browser') === 'record'}
                <div class="flex flex-col gap-1 rounded-md p-2 hover:bg-accent min-w-0 {isIanaRecordMode ? 'border border-amber-200/70 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950' : ''}">
                  <span class="text-xs font-semibold text-primary break-words">{$t(col.labelKey)}</span>
                  {#if col.type === 'badge' && col.badge?.values && row[col.key]}
                    {@const badgeValue = row[col.key] as string}
                    {@const badgeColors = badgeClassesFromToken(col.badge.values[badgeValue]?.color ?? null)}
                    <Badge
                      class="shadow-none"
                      style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
                    >
                      {col.badge.values[badgeValue]?.labelText || $t(col.badge.values[badgeValue]?.labelKey || `entities.customer.status.${badgeValue}`)}
                    </Badge>
                  {:else if col.type === 'datetime' && col.datetimeIanaToggle}
                    {@const mode = datetimeIanaModeByKey[col.key] ?? 'browser'}
                    {@const parts = formatDatetimeCellDisplay(col, row as Record<string, unknown>, $uiLang, mode)}
                    {#if isIanaRecordMode && parts.iana}
                      <div class="flex min-w-0 flex-col gap-1">
                        <span class="text-sm font-medium break-words">{parts.text}</span>
                        <Badge
                          variant="outline"
                          class="w-fit max-w-fit border-amber-300/90 bg-amber-100 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-950 shadow-none dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                        >
                          {parts.iana}
                        </Badge>
                      </div>
                    {:else}
                      <span class="text-sm font-medium break-words">{parts.text}</span>
                    {/if}
                  {:else}
                    <span class="text-sm font-medium break-words">{formatListCellValue(col, row[col.key], $uiLang)}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if dataColumns && dataColumns.length > 0}
            <div class="my-2 sticky top-0 z-10 bg-background">
              <div class="flex items-center gap-2">
                <div class="h-px flex-1 bg-muted-foreground/50"></div>
                <div class="text-xs font-medium text-muted-foreground">{$t('entities.list.dataFields')}</div>
                <div class="h-px flex-1 bg-muted-foreground/50"></div>
              </div>
            </div>
            <div class="px-2 grid grid-cols-2 gap-2 min-w-0">
              {#each dataColumns as col}
                {@const isIanaRecordMode = col.type === 'datetime' && col.datetimeIanaToggle && (datetimeIanaModeByKey[col.key] ?? 'browser') === 'record'}
                <div class="flex flex-col gap-1 rounded-md p-2 hover:bg-accent min-w-0 {isIanaRecordMode ? 'border border-amber-200/70 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950' : ''}">
                  <span class="text-xs font-semibold text-primary break-words">{$t(col.labelKey)}</span>
                  {#if col.type === 'badge' && col.badge?.values && row[col.key]}
                    {#if row[col.key]}
                      {@const badgeValue = row[col.key] as string}
                      {@const badgeColors = badgeClassesFromToken(col.badge.values[badgeValue]?.color ?? null)}
                      <Badge
                        class="shadow-none"
                        style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
                      >
                        {col.badge.values[badgeValue]?.labelText || $t(col.badge.values[badgeValue]?.labelKey || `entities.customer.status.${badgeValue}`)}
                      </Badge>
                    {/if}
                  {:else if col.type === 'datetime' && col.datetimeIanaToggle}
                    {@const mode = datetimeIanaModeByKey[col.key] ?? 'browser'}
                    {@const parts = formatDatetimeCellDisplay(col, row as Record<string, unknown>, $uiLang, mode)}
                    {#if isIanaRecordMode && parts.iana}
                      <div class="flex min-w-0 flex-col gap-1">
                        <span class="text-sm font-medium break-words">{parts.text}</span>
                        <Badge
                          variant="outline"
                          class="w-fit max-w-fit border-amber-300/90 bg-amber-100 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-950 shadow-none dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                        >
                          {parts.iana}
                        </Badge>
                      </div>
                    {:else}
                      <span class="text-sm font-medium break-words">{parts.text}</span>
                    {/if}
                  {:else}
                    <span class="text-sm font-medium break-words">{formatListCellValue(col, row[col.key], $uiLang)}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if auditingColumns && auditingColumns.length > 0}
            <div class="my-2 sticky top-0 z-10 bg-background">
              <div class="flex items-center gap-2">
                <div class="h-px flex-1 bg-muted-foreground/50"></div>
                <div class="text-xs font-medium text-muted-foreground">{$t('entities.list.auditingFields')}</div>
                <div class="h-px flex-1 bg-muted-foreground/50"></div>
              </div>
            </div>
            <div class="px-2 grid grid-cols-2 gap-2 min-w-0">
              {#each auditingColumns as col}
                {@const isIanaRecordMode = col.type === 'datetime' && col.datetimeIanaToggle && (datetimeIanaModeByKey[col.key] ?? 'browser') === 'record'}
                <div class="flex flex-col gap-1 rounded-md p-2 hover:bg-accent min-w-0 {isIanaRecordMode ? 'border border-amber-200/70 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950' : ''}">
                  <span class="text-xs font-semibold text-primary break-words">{$t(col.labelKey)}</span>
                  {#if col.type === 'badge' && col.badge?.values && row[col.key]}
                    {#if row[col.key]}
                      {@const badgeValue = row[col.key] as string}
                      {@const badgeColors = badgeClassesFromToken(col.badge.values[badgeValue]?.color ?? null)}
                      <Badge
                        class="shadow-none"
                        style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
                      >
                        {col.badge.values[badgeValue]?.labelText || $t(col.badge.values[badgeValue]?.labelKey || `entities.customer.status.${badgeValue}`)}
                      </Badge>
                    {/if}
                  {:else if col.type === 'datetime' && col.datetimeIanaToggle}
                    {@const mode = datetimeIanaModeByKey[col.key] ?? 'browser'}
                    {@const parts = formatDatetimeCellDisplay(col, row as Record<string, unknown>, $uiLang, mode)}
                    {#if isIanaRecordMode && parts.iana}
                      <div class="flex min-w-0 flex-col gap-1">
                        <span class="text-sm font-medium break-words">{parts.text}</span>
                        <Badge
                          variant="outline"
                          class="w-fit max-w-fit border-amber-300/90 bg-amber-100 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-950 shadow-none dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                        >
                          {parts.iana}
                        </Badge>
                      </div>
                    {:else}
                      <span class="text-sm font-medium break-words">{parts.text}</span>
                    {/if}
                  {:else}
                    <span class="text-sm font-medium break-words">{getAuditFieldValue(row, col)}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>
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

{#snippet listDefaultCellValue(row: TRow, col: MetaColumn)}
    {@const value = row[col.key]}
    {#if col.type === 'boolean'}
      {#if value === true}
        <Tooltip.Root>
          <Tooltip.Trigger>
            <CircleCheck class="size-4 text-green-600 shrink-0" />
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>{$t(`entities.userProfile.fields.${col.key}`)}</p>
          </Tooltip.Content>
        </Tooltip.Root>
      {:else if value === false}
        <Tooltip.Root>
          <Tooltip.Trigger>
            <CircleX class="size-4 text-muted-foreground shrink-0" />
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>{$t(`entities.userProfile.fields.${col.key}_false`)}</p>
          </Tooltip.Content>
        </Tooltip.Root>
      {:else}
        <span class="min-w-0 truncate">-</span>
      {/if}
    {:else if col.badge?.values && value}
      {@const badgeValue = value as string}
      {@const badgeColors = badgeClassesFromToken(col.badge.values[badgeValue]?.color ?? null)}
      <Badge
        class="shadow-none"
        style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
      >
        {col.badge.values[badgeValue]?.labelText || $t(col.badge.values[badgeValue]?.labelKey || `entities.customer.status.${badgeValue}`)}
      </Badge>
    {:else if col.type === 'datetime'}
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
    {:else}
      <span class="min-w-0 truncate">{formatListCellValue(col, value, $uiLang)}</span>
    {/if}
  {/snippet}

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <div class="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2">
    <div class="flex min-w-0 flex-1 basis-0 items-center gap-2 sm:min-w-[260px] sm:max-w-[520px]">
      <SearchBar
        search={search}
        onSearchInput={onSearchInput}
        searchPlaceholderKey={searchPlaceholderKey}
        searchInKeys={searchInKeys}
        searchableColumns={searchableColumns}
        onSearchInKeysChange={onSearchInKeysChange}
        toggleSearchKey={toggleSearchKey}
      />
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

      {#if onCreateAction}
        <div class="h-6 w-px bg-border/60" aria-hidden="true"></div>
        <Button
          variant="default"
          size="sm"
          type="button"
          onclick={onCreateAction}
        >
          {$t('common.new')}
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
      {#if toolbarModeState.toolbarMode === 'filters'}
        <ListCheck class="size-3.5" />
        {$t('entities.list.bulkActions.toggleToBulk')}
      {:else}
        <Funnel class="size-3.5" />
        {$t('entities.list.bulkActions.toggleToFilters')}
      {/if}
    </Button>
    <div class="h-6 w-px bg-border/60" aria-hidden="true"></div>

    {#if toolbarModeState.toolbarMode === 'filters'}
      {#if toolbarModeState.hasAppliedFilters}
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
          disabled={selectedKeys.length < 2 || hasDeletedSelected}
        >
          <Trash2 class="size-3.5" />
          {$t('entities.list.bulkActions.delete')}
        </Button>
        {#if hasDeletedSelected}
          <Button
            variant="soft"
            size="xs"
            class="h-6 text-xs bg-warning/10 text-warning hover:bg-warning/20 hover:border-warning/50 border-warning/20"
            onclick={handleBulkRestore}
            disabled={!allSelectedDeleted}
          >
            <span class="relative flex items-center justify-center">
              <Trash2 class="size-3.5 text-warning/70" />
              <ArrowUpFromLine class="absolute -bottom-[1px] size-2.5 text-warning/70" />
            </span>
            {$t('entities.list.bulkActions.restore')}
          </Button>
        {/if}
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
                  {@const rowFocused = focusedRowIndex !== null && viewRows[focusedRowIndex] === r}
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
                        : undefined,
                      rowFocused ? 'border-2 border-primary ring-2 ring-primary/20' : ''
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
                              <DropdownMenu.Root open={dropdownMenuRow === r} onOpenChange={(open) => { if (!open) closeRowDropdown(); }}>
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
                                    <DropdownMenu.Item
                                      onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; handleEditRow(r); }}
                                      class={isRowDeleted(r) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                                    >
                                      <div class="flex items-center gap-2">
                                        <Pencil class="size-4 opacity-70" />
                                        <span>{$t('common.edit')}</span>
                                      </div>
                                    </DropdownMenu.Item>
                                  {/if}
                                  {#if entityRowActions?.duplicate !== false}
                                    <DropdownMenu.Item
                                      onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; handleDuplicateRow(r); }}
                                      class={isRowDeleted(r) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                                    >
                                      <div class="flex items-center gap-2">
                                        <Copy class="size-4 opacity-70" />
                                        <span>{$t('common.duplicate')}</span>
                                      </div>
                                    </DropdownMenu.Item>
                                  {/if}
                                  <DropdownMenu.Item
                                    onclick={(e) => { e.stopPropagation(); loadVersionHistory(r); }}
                                  >
                                    <div class="flex items-center gap-2">
                                      <FileClock class="size-4 opacity-70" />
                                      <span>{$t('common.versionHistory')}</span>
                                    </div>
                                  </DropdownMenu.Item>
                                  {#if entityRowActions?.preview !== false}
                                    <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handlePreviewRow(r); }}>
                                      <div class="flex items-center gap-2">
                                        <Eye class="size-4 opacity-70" />
                                        <span>{$t('entities.list.preview')}</span>
                                      </div>
                                    </DropdownMenu.Item>
                                  {/if}
                                  {#if entityRowActions?.delete !== false}
                                    <DropdownMenu.Separator />
                                    {#if isRowDeleted(r)}
                                      <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleRestoreRow(r); }} class="text-warning">
                                        <div class="flex items-center gap-2">
                                          <span class="relative flex items-center justify-center">
                                            <Trash2 class="size-4 text-warning/70" />
                                            <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                                          </span>
                                          <span>{$t('common.restore')}</span>
                                        </div>
                                      </DropdownMenu.Item>
                                    {:else}
                                      <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleDeleteRow(r); }} class="text-destructive">
                                        <div class="flex items-center gap-2">
                                          <Trash2 class="size-4 text-destructive/70" />
                                          <span>{$t('common.delete')}</span>
                                        </div>
                                      </DropdownMenu.Item>
                                    {/if}
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
                              <DropdownMenu.Root open={dropdownMenuRow === r} onOpenChange={(open) => { if (!open) closeRowDropdown(); }}>
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
                                    <DropdownMenu.Item
                                      onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; handleEditRow(r); }}
                                      class={isRowDeleted(r) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                                    >
                                      <div class="flex items-center gap-2">
                                        <Pencil class="size-4 opacity-70" />
                                        <span>{$t('common.edit')}</span>
                                      </div>
                                    </DropdownMenu.Item>
                                  {/if}
                                  {#if entityRowActions?.duplicate !== false}
                                    <DropdownMenu.Item
                                      onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; handleDuplicateRow(r); }}
                                      class={isRowDeleted(r) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                                    >
                                      <div class="flex items-center gap-2">
                                        <Copy class="size-4 opacity-70" />
                                        <span>{$t('common.duplicate')}</span>
                                      </div>
                                    </DropdownMenu.Item>
                                  {/if}
                                  <DropdownMenu.Item
                                    onclick={(e) => { e.stopPropagation(); loadVersionHistory(r); }}
                                  >
                                    <div class="flex items-center gap-2">
                                      <FileClock class="size-4 opacity-70" />
                                      <span>{$t('common.versionHistory')}</span>
                                    </div>
                                  </DropdownMenu.Item>
                                  {#if entityRowActions?.preview !== false}
                                    <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handlePreviewRow(r); }}>
                                      <div class="flex items-center gap-2">
                                        <Eye class="size-4 opacity-70" />
                                        <span>{$t('entities.list.preview')}</span>
                                      </div>
                                    </DropdownMenu.Item>
                                  {/if}
                                  {#if entityRowActions?.delete !== false}
                                    <DropdownMenu.Separator />
                                    {#if isRowDeleted(r)}
                                      <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleRestoreRow(r); }} class="text-warning">
                                        <div class="flex items-center gap-2">
                                          <span class="relative flex items-center justify-center">
                                            <Trash2 class="size-4 text-warning/70" />
                                            <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                                          </span>
                                          <span>{$t('common.restore')}</span>
                                        </div>
                                      </DropdownMenu.Item>
                                    {:else}
                                      <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleDeleteRow(r); }} class="text-destructive">
                                        <div class="flex items-center gap-2">
                                          <Trash2 class="size-4 text-destructive/70" />
                                          <span>{$t('common.delete')}</span>
                                        </div>
                                      </DropdownMenu.Item>
                                    {/if}
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
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="flex h-full overflow-hidden" role="region" aria-label="Table and preview panel" onmousemove={handleResize} onmouseup={stopResize} onmouseleave={stopResize}>
          <div class="flex-1 min-w-0 overflow-hidden">
            <Table.Root
          bind:ref={tableRef}
          class={cn(
            'w-full bg-background **:data-[slot=table]:isolate **:data-[slot=table]:bg-background **:data-[slot=table-cell]:bg-clip-border [&_[data-slot=table-cell]:not(.sticky)]:bg-background dark:[&_[data-slot=table-cell]:not(.sticky)]:bg-neutral-950 [&_[data-slot=table-head]:not(.sticky)]:bg-neutral-50 dark:[&_[data-slot=table-head]:not(.sticky)]:bg-neutral-900',
            tableDensityClass
          )}
          containerClass="h-full overflow-auto"
        >
          <Table.Header class="sticky top-0 z-80 bg-background">
            <Table.Row>
              {#if rowSelectionEnabled}
                <Table.Head
                  bind:ref={stickyColumnsState.checkboxHeadRef}
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
                {#if stickyColumnsGroup.some((s) => s.key === col.key)}
                  <Table.Head
                    style="left: {stickyColumnsState.stickyLeftOffsets[col.key] ?? 0}px;"
                    class={stickyCellClass(col.key, colIdx, true) ??
                      (col.sortable !== false
                        ? rowsLoading
                          ? 'relative z-10 select-none opacity-60'
                          : 'relative z-10 cursor-pointer select-none'
                        : 'relative z-10')}
                    onclick={() => handleSortClick(col)}
                  >
                  <div use:stickyColumnsState.stickyRef={{ key: col.key, isHead: true }}>
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
                  </div>
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onclick={() => {
                      if (!previewPanelOpen && !previewRow && viewRows.length > 0) {
                        previewRow = viewRows[0];
                        previewRowIndex = 0;
                      }
                      previewPanelOpen = !previewPanelOpen;
                    }}
                    aria-label={$t('entities.list.togglePreviewPanel')}
                    title={$t('entities.list.togglePreviewPanel')}
                    class="transition-transform duration-300"
                  >
                    {#if previewPanelOpen}
                      <PanelRightClose class="size-4 transition-transform duration-300" />
                    {:else}
                      <PanelRightOpen class="size-4 transition-transform duration-300" />
                    {/if}
                  </Button>
                </div>
              </Table.Head>
            {/if}
          </Table.Row>
        </Table.Header>
        <Table.Body
          class={rowSelectionEnabled && rowRangeSelection.rowRangeMouseDown && rowRangeSelection.rangeDragActive ? 'select-none' : undefined}
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
              {@const rowFocused = focusedRowIndex === i}
              <Table.Row
                suppressCellHoverMuted
                data-row-index={rowSelectionEnabled ? i : undefined}
                data-focused-row-index={rowFocused ? i : undefined}
                data-state={rowSelected ? 'selected' : undefined}
                class={cn(
                  'group/entity-row',
                  rowSelected ? 'data-[state=selected]:bg-transparent!' : undefined,
                  rowFocused ? 'border-2 border-primary ring-2 ring-primary/20' : ''
                )}
                onmousedown={rowSelectionEnabled ? (e) => rowRangeSelection.onRowRangeMouseDown(i, e) : undefined}
                onclick={rowSelectionEnabled ? (e) => onEntityRowClick(rk, e) : undefined}
                ondblclick={() => handlePreviewRow(r)}
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
                  {#if stickyColumnsGroup.some((s) => s.key === col.key)}
                    {#if i === 0}
                      <Table.Cell
                        style="left: {stickyColumnsState.stickyLeftOffsets[col.key] ?? 0}px;"
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
                        <div use:stickyColumnsState.stickyRef={{ key: col.key, isHead: false }}>
                        {#if cell}
                          {@render cell({ row: r, column: col })}
                        {:else}
                          {@render listDefaultCellValue(r, col)}
                        {/if}
                        </div>
                      </Table.Cell>
                    {:else}
                      <Table.Cell
                        style="left: {stickyColumnsState.stickyLeftOffsets[col.key] ?? 0}px;"
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
                        <DropdownMenu.Root open={dropdownMenuRow === r} onOpenChange={(open) => { if (!open) closeRowDropdown(); }}>
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
                              <DropdownMenu.Item
                                onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; handleEditRow(r); }}
                                class={isRowDeleted(r) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                              >
                                <div class="flex items-center gap-2">
                                  <Pencil class="size-4 opacity-70" />
                                  <span>{$t('common.edit')}</span>
                                </div>
                              </DropdownMenu.Item>
                            {/if}
                            {#if entityRowActions?.duplicate !== false}
                              <DropdownMenu.Item
                                onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; handleDuplicateRow(r); }}
                                class={isRowDeleted(r) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                              >
                                <div class="flex items-center gap-2">
                                  <Copy class="size-4 opacity-70" />
                                  <span>{$t('common.duplicate')}</span>
                                </div>
                              </DropdownMenu.Item>
                            {/if}
                            <DropdownMenu.Item
                              onclick={(e) => { e.stopPropagation(); loadVersionHistory(r); }}
                            >
                              <div class="flex items-center gap-2">
                                <FileClock class="size-4 opacity-70" />
                                <span>{$t('common.versionHistory')}</span>
                              </div>
                            </DropdownMenu.Item>
                            {#if entityRowActions?.preview !== false}
                              <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handlePreviewRow(r); }}>
                                <div class="flex items-center gap-2">
                                  <Eye class="size-4 opacity-70" />
                                  <span>{$t('entities.list.preview')}</span>
                                </div>
                              </DropdownMenu.Item>
                            {/if}
                            {#if entityRowActions?.delete !== false}
                              <DropdownMenu.Separator />
                              {#if isRowDeleted(r)}
                                <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleRestoreRow(r); }} class="text-warning">
                                  <div class="flex items-center gap-2">
                                    <span class="relative flex items-center justify-center">
                                      <Trash2 class="size-4 text-warning/70" />
                                      <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                                    </span>
                                    <span>{$t('common.restore')}</span>
                                  </div>
                                </DropdownMenu.Item>
                              {:else}
                                <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); handleDeleteRow(r); }} class="text-destructive">
                                  <div class="flex items-center gap-2">
                                    <Trash2 class="size-4 text-destructive/70" />
                                    <span>{$t('common.delete')}</span>
                                  </div>
                                </DropdownMenu.Item>
                              {/if}
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
          </div>

          {#if previewPanelOpen}
            <!-- Resize handle between table and panel -->
            <button
              type="button"
              class="relative h-full w-2 cursor-ew-resize hover:bg-primary/30 z-20 border-l-2 border-transparent hover:border-primary transition-colors flex items-center justify-center"
              onmousedown={startResize}
              aria-label="Resize panel"
            >
              <div class="w-1 h-8 bg-border rounded-full"></div>
            </button>
          {/if}

          <div
            class="h-full overflow-hidden border-l bg-background {isResizing ? '' : 'transition-[width,min-width] duration-300 ease-in-out'}"
            style="width: {previewPanelOpen ? `${previewPanelWidth}%` : '0'}; min-width: {previewPanelOpen ? '220px' : '0'}"
          >
            <div class="h-full w-full overflow-auto">
              {#if previewRow}
                {@render entityPreviewPanel(previewRow)}
              {/if}
            </div>
          </div>
        </div>
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
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
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

<!-- Restore confirmation dialog -->
<DialogBordered bind:open={restoreConfirmDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('common.restoreConfirmTitle')}</Dialog.Title>
    <Dialog.Description>{$t('common.restoreConfirm')}</Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={() => {
        restoreConfirmDialogOpen = false;
        rowToRestore = null;
      }}
    >
      {$t('common.cancel')}
    </Button>
    <Button
      class="bg-warning text-warning-foreground hover:bg-warning/80 hover:scale-105 transition-all"
      onclick={confirmRestoreRow}
      disabled={isRestoring}
    >
      {#if isRestoring}
        {$t('common.restoring')}
      {:else}
        {$t('common.restore')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>

<!-- Bulk delete confirmation dialog -->
<DialogBordered bind:open={dialogs.deleteDialogOpen} color="destructive" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('entities.list.bulkActions.deleteConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      Sei sicuro di voler eliminare {selectedKeys.length} elementi?
    </Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={cancelBulkDelete}
    >
      {$t('common.cancel')}
    </Button>
    <Button
      class="bg-destructive text-destructive-foreground hover:bg-destructive/80 hover:scale-105 transition-all"
      onclick={confirmBulkDelete}
      disabled={bulkActions.isDeleting}
    >
      {#if bulkActions.isDeleting}
        {$t('common.deleting')}
      {:else}
        {$t('common.delete')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>

<!-- Bulk restore confirmation dialog -->
<DialogBordered bind:open={dialogs.restoreDialogOpen} color="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('entities.list.bulkActions.restoreConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      Sei sicuro di voler ripristinare {selectedKeys.length} elementi?
    </Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={cancelBulkRestore}
    >
      {$t('common.cancel')}
    </Button>
    <Button
      class="bg-warning text-warning-foreground hover:bg-warning/80 hover:scale-105 transition-all"
      onclick={confirmBulkRestore}
      disabled={bulkActions.isRestoring}
    >
      {#if bulkActions.isRestoring}
        {$t('common.restoring')}
      {:else}
        {$t('common.restore')}
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
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
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
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
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
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
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
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
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
