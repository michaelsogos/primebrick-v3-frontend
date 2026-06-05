<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { onMount, untrack } from 'svelte';
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

  import { scale, fade, fly, slide } from 'svelte/transition';
  import { cn } from '$lib/utils.js';
  import { apiFetch } from '$lib/api';
  import { pushImpactError, pushRFC7807Error } from '$lib/errors/app-errors';
  import type { RFC7807Error } from '$lib/errors/rfc7807';
  import { closeSheet, openSheet, sheetState } from '$lib/shell/sheets/sheet-manager.svelte';
  import { FiltersPanel, VersionHistoryPanel, SearchInPanel, ColumnSelectorPanel, PreviewPanel } from './panels';
  import { EntityListToolbar, FilterBar, SelectionCounter } from './toolbar';
  import { TableHeader, TableCell } from './table';
  import { CardField, CardGrid, CardList } from './cards';
  import { DeleteDialog, RestoreDialog, BulkDeleteDialog, BulkRestoreDialog, ExportDialog, HtmlExportDialog, DuplicateDialog, ExportPreviewDialog } from './dialogs';
  import { Pagination } from './pagination';
  import {
    useStickyColumns,
    useScrollPreservation,
    useRowRangeSelection,
    useFilterPersistence,
    useToolbarMode
  } from './composables';
  import {
    isRowDeleted as isRowDeletedUtil,
    getRowKey
  } from './utils';
  import { useExport } from './composables/useExport.svelte.js';
  import { useBulkActions } from './composables/useBulkActions.svelte.js';
  import { useRowActions } from './composables/useRowActions.svelte.js';
  import { useDialogs } from './composables/useDialogs.svelte.js';
  import { usePreviewPanel } from './composables/usePreviewPanel.svelte.js';
  import type { MetaColumn, SortDir, ListMetaViewVisibility, ViewName, AdvancedFilter } from '$lib/entity-list/types';
  import { defaultVisibleColumnKeys, formatDatetimeCellDisplay } from '$lib/entity-list';
  import { formatListCellValue } from '$lib/i18n/date-format';
  import { searchSyntaxSegments, searchSyntaxSpanClass } from './search/search-syntax';
  import {
    entityListDataCellValignClass,
    isDatetimeIanaRecordMode,
    datetimeIanaHeadHighlightClass,
    datetimeIanaCellHighlightClass,
    datetimeIanaCardFieldHighlightClass,
    entityListGrayChromeCellClass,
    entityListDestructiveChromeCellClass,
    entityListGrayBandStickyInteractionClass,
    entityListDestructiveBandStickyInteractionClass,
    entityListDefaultScrollInteractionClass,
    entityListDestructiveScrollInteractionClass
  } from './utils/cell-styling';
  import { isBlankish, getAuditFieldValue, isCardFieldEmpty } from './utils/cell-formatting';
  import XIcon from '@lucide/svelte/icons/x';
  import {
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
    RotateCcw,
    MoreVertical,
    Ban,
    Globe,
    MapPin,
    Eye,
    EyeOff,
    ListCheck,
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
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import * as Dock from '$lib/components/ui/dock';
  import * as Resizable from '$lib/components/ui/resizable';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Window } from '$lib/components/ui/window';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';

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
    /** Meta column key whose values uniquely identify a row in the list (uuid, id, â€¦). */
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

  // Utility functions moved to utils.ts
  const rowKey = (row: TRow): string => getRowKey(row, uid);

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

  const rowChromeH = $derived('h-6');
  /** Use `thead th` / `tbody td` selectors â€” attribute-based [&_[data-slot=â€¦]] variants are unreliable in Tailwind. */
  const tableDensityClass = $derived(
    '[&_th]:h-6! [&_th]:py-1 [&_th]:text-xs [&_tbody_td]:py-1.5! [&_tbody_td]:text-sm'
  );

  // Panels are mounted via global SheetHost; keep local boolean state only for the optional `filters` slot.

  function toggleDatetimeIana(col: MetaColumn) {
    const cur = datetimeIanaModeByKey[col.key] ?? 'browser';
    const next: 'browser' | 'record' = cur === 'browser' ? 'record' : 'browser';
    datetimeIanaModeByKey = { ...datetimeIanaModeByKey, [col.key]: next };
    datetimeIanaRenderTick++;
  }
  const isRowDeleted = (row: TRow): boolean => isRowDeletedUtil(row);

  let dropdownMenuRow = $state<TRow | null>(null);
  /** Preview panel dropdown menu state */
  let previewDropdownOpen = $state(false);

  /** Row tracking for dialog actions */
  let rowToDelete: TRow | null = $state(null);
  let rowToRestore: TRow | null = $state(null);
  let singleRowToDuplicate: TRow | null = $state(null);
  let duplicateScope = $state<'selected' | 'single'>('selected');

  /** Export confirmation dialog state */
  // Export state is now managed by exportComposable

  /** Entity preview panel state */
  const _sessionRaw = (() => {
    if (typeof sessionStorage === 'undefined') return null;
    const key = `pb-preview-panel:${entity ?? 'default'}`;
    return sessionStorage.getItem(key);
  })();
  const _sessionState = _sessionRaw ? JSON.parse(_sessionRaw) : null;

  // Preview panel state is now managed by previewPanel composable
  let navigatingToNextPage = $state(false);
  let navigatingToPrevPage = $state(false);
  let previewPanelWidth = $state<number>(_sessionState?.width ?? 30); // percentage
  let isResizing = $state(false);
  let _previewRestoredKey = $state<string | null>(_sessionState?.rowKey ?? null);

  $effect(() => {
    if (typeof sessionStorage !== 'undefined') {
      // While restoring, preserve the key from session until previewRow is actually set
      const rowKey_ = previewPanel.previewRow
        ? String((previewPanel.previewRow as Record<string, unknown>)[uid])
        : (_previewRestoredKey ?? null);
      const key = `pb-preview-panel:${entity ?? 'default'}`;
      sessionStorage.setItem(key, JSON.stringify({ open: previewPanel.previewPanelOpen, width: previewPanelWidth, rowKey: rowKey_ }));
    }
  });

  $effect(() => {
    if (_previewRestoredKey && previewPanel.previewPanelOpen && !rowsLoading && rows.length > 0) {
      const idx = rows.findIndex((r) => String((r as Record<string, unknown>)[uid]) === _previewRestoredKey);
      if (idx !== -1) {
        previewPanel.openPreview(rows[idx]);
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
    if (previewPanel.previewPanelOpen && viewRows.length > 0) {
      if (navigatingToNextPage) {
        // Going to next page - reset to first record
        previewPanel.openPreview(viewRows[0]);
        navigatingToNextPage = false;
      } else if (navigatingToPrevPage) {
        // Going to previous page - go to last record
        previewPanel.openPreview(viewRows[viewRows.length - 1]);
        navigatingToPrevPage = false;
      } else if (previewPanel.previewRowIndex >= viewRows.length) {
        // If previewRowIndex is out of bounds after page change, reset it
        previewPanel.openPreview(viewRows[0]);
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
    rowActionsComposable.handleEditRow(row);
  }

  /** Handle preview action for a row */
  function handlePreviewRow(row: TRow) {
    previewPanel.openPreview(row);
    closeRowDropdown();
  }

  /** Navigate preview records */
  function navigatePreview(direction: number) {
    const currentPreviewIndex = previewPanel.previewRowIndex;
    const newIndex = currentPreviewIndex + direction;
    
    if (newIndex >= 0 && newIndex < viewRows.length) {
      previewPanel.navigatePreview(direction > 0 ? 'next' : 'prev');
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
    if (previewPanel.previewRowIndex === null) return;
    const row = tableRef?.querySelector(`[data-focused-row-index="${previewPanel.previewRowIndex}"]`) as HTMLElement;
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

    if (previewPanel.previewPanelOpen) {
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
      if (previewPanel.focusedRowIndex === null) {
        // focusedRowIndex is managed by previewPanel composable
      } else if (previewPanel.focusedRowIndex < viewRows.length - 1) {
        // focusedRowIndex is managed by previewPanel composable
      } else if (previewPanel.focusedRowIndex === viewRows.length - 1 && footerPage < footerTotalPages) {
        // Trigger next page when reaching end of current page
        navigatingToNextPage = true;
        if (footerUsesClientPaging) {
          clientSelectedPage++;
        } else {
          onPageChange(page + 1);
        }
      }
      if (previewPanel.previewPanelOpen && previewPanel.focusedRowIndex !== null) {
        previewPanel.openPreview(viewRows[previewPanel.focusedRowIndex]);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (previewPanel.focusedRowIndex === null) {
        // focusedRowIndex is managed by previewPanel composable
      } else if (previewPanel.focusedRowIndex > 0) {
        // focusedRowIndex is managed by previewPanel composable
      } else if (previewPanel.focusedRowIndex === 0 && footerPage > 1) {
        // Trigger previous page when at start of current page
        navigatingToPrevPage = true;
        if (footerUsesClientPaging) {
          clientSelectedPage--;
        } else {
          onPageChange(page - 1);
        }
      }
      if (previewPanel.previewPanelOpen && previewPanel.focusedRowIndex !== null) {
        previewPanel.openPreview(viewRows[previewPanel.focusedRowIndex]);
      }
    } else if (e.key === ' ' && previewPanel.focusedRowIndex !== null) {
      e.preventDefault();
      const row = viewRows[previewPanel.focusedRowIndex];
      if (row) toggleRowSelect(rowKey(row));
    } else if (e.key === 'Enter' && previewPanel.focusedRowIndex !== null) {
      e.preventDefault();
      const row = viewRows[previewPanel.focusedRowIndex];
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
    dialogs.openDeleteDialog();
    closeRowDropdown();
  }

  /** Handle restore action for a row */
  function handleRestoreRow(row: TRow) {
    // Open confirmation dialog instead of restoring directly
    rowToRestore = row;
    dialogs.openRestoreDialog();
    closeRowDropdown();
  }

  /** Confirm delete action after dialog confirmation */
  async function confirmDeleteRow() {
    if (!rowToDelete) return;
    await rowActionsComposable.confirmDeleteRow(rowToDelete);
    dialogs.closeDeleteDialog();
    rowToDelete = null;
  }

  /** Confirm restore action after dialog confirmation */
  async function confirmRestoreRow() {
    if (!rowToRestore) return;
    await rowActionsComposable.confirmRestoreRow(rowToRestore);
    dialogs.closeRestoreDialog();
    rowToRestore = null;
  }

  /** Bulk action handlers */
  function handleBulkDelete() {
    dialogs.openBulkDeleteDialog();
  }

  /** Confirm bulk delete action after dialog confirmation */
  async function confirmBulkDelete() {
    await bulkActions.confirmBulkDelete();
    dialogs.closeBulkDeleteDialog();
  }

  /** Cancel bulk delete action */
  function cancelBulkDelete() {
    dialogs.closeBulkDeleteDialog();
  }

  function handleBulkRestore() {
    dialogs.openBulkRestoreDialog();
  }

  /** Confirm bulk restore action after dialog confirmation */
  async function confirmBulkRestore() {
    await bulkActions.confirmBulkRestore();
    dialogs.closeBulkRestoreDialog();
  }

  /** Cancel bulk restore action */
  function cancelBulkRestore() {
    dialogs.closeBulkRestoreDialog();
  }

  /** Confirm export action after dialog confirmation */
  async function confirmExportRow() {
    if (!exportComposable.fileType) return;
    await exportComposable.handleExport(exportComposable.fileType);
    exportComposable.closeExportDialog();
  }

  /** Cancel export action */
  function cancelExportRow() {
    exportComposable.closeExportDialog();
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
    dialogs.openDuplicateDialog();
  }

  function handleDuplicateRow(row: TRow) {
    if (isRowDeleted(row)) {
      console.log('Cannot duplicate deleted row:', rowKey(row));
      return;
    }
    singleRowToDuplicate = row;
    duplicateScope = 'single';
    dialogs.openDuplicateDialog();
    closeRowDropdown();
  }

  async function confirmDuplicate() {
    if (duplicateScope === 'single' && singleRowToDuplicate) {
      await rowActionsComposable.confirmDuplicateRow(singleRowToDuplicate);
    }
    // Bulk duplicate is handled separately by bulkActions composable
    dialogs.closeDuplicateDialog();
    singleRowToDuplicate = null;
  }

  function cancelDuplicate() {
    dialogs.closeDuplicateDialog();
    singleRowToDuplicate = null;
  }

  function handleBulkExport() {
    exportComposable.openExportDialog();
  }

  function handleHtmlExport() {
    exportComposable.handleHtmlExport();
  }

  function cancelHtmlExport() {
    exportComposable.closeHtmlExportDialog();
  }

  async function confirmHtmlExport() {
    await exportComposable.handleHtmlExport();
  }

  function closeHtmlPreview() {
    exportComposable.closeHtmlPreview();
  }

  async function copyHtmlToClipboard() {
    await exportComposable.copyHtmlToClipboard();
  }

  async function generatePdfPreview() {
    await exportComposable.generatePdfPreview();
  }

  async function prepareEmailHtml() {
    await exportComposable.prepareEmailHtml();
  }

  async function copyEmailHtmlToClipboard() {
    await exportComposable.copyEmailHtmlToClipboard();
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

  /** Card view: sticky uuid/code-style fields â€” dark uses **neutral** (same ramp as table sticky, no slate `gray`). */
  function stickyCardFieldChromeClass(col: MetaColumn, rowSelected: boolean, destructive: boolean = false): string | undefined {
    const stickyKeys = new Set(stickyColumnsGroup.map((c) => c.key));
    if (!stickyKeys.has(col.key)) return undefined;

    const baseClass = 'rounded-md border p-2 transition-colors group-hover';
    if (destructive) {
      if (rowSelected) {
        return `${baseClass} border-rose-300/80 bg-rose-300/85 group-hover:bg-rose-400/90 dark:border-rose-600 dark:bg-rose-700 dark:group-hover:bg-rose-600`;
      }
      return `${baseClass} border-rose-200/80 bg-rose-100/90 group-hover:bg-rose-200/90 dark:border-rose-900 dark:bg-rose-900 dark:group-hover:bg-rose-800`;
    }
    if (rowSelected) {
      return `${baseClass} border-gray-300/80 bg-gray-200/85 group-hover:bg-gray-300/90 dark:border-neutral-600 dark:bg-neutral-700 dark:group-hover:bg-neutral-600`;
    }
    return `${baseClass} border-gray-200/80 bg-gray-100/90 group-hover:bg-gray-200/90 dark:border-neutral-800 dark:bg-neutral-900 dark:group-hover:bg-neutral-800`;
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
    },
    onRefresh: onRefresh,
    onToolbarModeChange: () => {
      toolbarModeState.setMode('filters');
    },
    t: $t
  });

  const rowActionsComposable = useRowActions<TRow>({
    entity: () => entity,
    uid: () => uid,
    columns: () => columns,
    onEditAction: onEditAction,
    onRefresh: onRefresh,
    isRowDeleted: isRowDeleted,
    rowKey: rowKey,
    onPreviewRow: (row) => {
      previewPanel.openPreview(row);
    },
    closeRowDropdown: closeRowDropdown,
    t: $t
  });

  const previewPanel = usePreviewPanel<TRow>({
    viewRows: () => viewRows,
    rowKey: rowKey,
    onFieldChange: (row, field, value) => {
      // Handle field change if needed
    },
    onRefresh: onRefresh
  });

  const dialogs = useDialogs();

  function stickyCellClass(key: string, idx: number, isHeader: boolean): string | undefined {
    const visibleStickyCols = stickyColumnsGroup.filter((c) => visibleKeys.includes(c.key));
    const isSticky = visibleStickyCols.some(c => c.key === key);
    if (!isSticky) return undefined;

    /**
     * Sticky columns: **neutral only** (TW `gray-*` dark is slateâ€‘tinted / blue on screen).
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
          (!isCardFieldEmpty(r, col, $uiLang, datetimeIanaModeByKey, cell, formatDatetimeCellDisplay, formatListCellValue, isDatetimeIanaRecordMode)
            ? datetimeIanaCardFieldHighlightClass(col, rowSelectionEnabled && rowSelected, datetimeIanaModeByKey)
            : undefined) ?? (rowDeleted
              ? stickyCardFieldChromeClass(col, rowSelectionEnabled && rowSelected, true)
              : stickyCardFieldChromeClass(col, rowSelectionEnabled && rowSelected))
        )}
      >
        {#if isCardFieldEmpty(r, col, $uiLang, datetimeIanaModeByKey, cell, formatDatetimeCellDisplay, formatListCellValue, isDatetimeIanaRecordMode)}
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
          <TableCell row={r} column={col} datetimeIanaModeByKey={datetimeIanaModeByKey} datetimeIanaRenderTick={datetimeIanaRenderTick} />
        {/if}
      </div>
    </div>
  {/snippet}



<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <EntityListToolbar
    search={search}
    onSearchInput={onSearchInput}
    searchPlaceholderKey={searchPlaceholderKey}
    searchInKeys={searchInKeys}
    searchableColumns={searchableColumns}
    onSearchInKeysChange={onSearchInKeysChange}
    toggleSearchKey={toggleSearchKey}
    viewMode={viewMode}
    onViewModeChange={(mode) => viewMode = mode}
    deletionFilterMode={deletionFilterMode}
    onDeletionFilterModeChange={(mode) => deletionFilterMode = mode}
    rowsLoading={rowsLoading}
    refreshDisabled={refreshDisabled}
    onRefresh={onRefresh}
    filterableColumns={filterableColumns}
    filtersOpen={filtersOpen}
    onFiltersOpenChange={(open) => {
      if (open) {
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
      } else {
        closeSheet();
        filtersOpen = false;
      }
    }}
    onColumnSelectorClick={() =>
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
    onCreateAction={onCreateAction}
  />

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
      <div in:fly={{ y: 20, duration: 200 }}>
        <FilterBar
          hasAppliedFilters={toolbarModeState.hasAppliedFilters}
          filterValues={filterValues}
          advancedFilters={advancedFilters}
          filterableColumns={filterableColumns}
          onResetFilters={resetFilters}
          onFilterValuesChange={(values: Record<string, unknown>) => onFilterValuesChange?.(values)}
          onAdvancedFiltersChange={(filters: AdvancedFilter[]) => onAdvancedFiltersChange?.(filters, 'AND')}
        />
      </div>
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
          onclick={bulkActions.handleBulkDuplicate}
          disabled={selectedKeys.length < 2}
        >
          <Copy class="size-3.5" />
          {$t('entities.list.bulkActions.duplicate')}
        </Button>
        <Button
          variant="soft"
          size="xs"
          class="h-6 text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 hover:border-destructive/50 border-destructive/20"
          onclick={bulkActions.handleBulkDelete}
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
            onclick={bulkActions.handleBulkRestore}
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
                  {@const rowFocused = previewPanel.focusedRowIndex !== null && viewRows[previewPanel.focusedRowIndex] === r}
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
                                      onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; rowActionsComposable.handleDuplicateRow(r); }}
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
                                      <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); rowActionsComposable.handleRestoreRow(r); }} class="text-warning">
                                        <div class="flex items-center gap-2">
                                          <span class="relative flex items-center justify-center">
                                            <Trash2 class="size-4 text-warning/70" />
                                            <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                                          </span>
                                          <span>{$t('common.restore')}</span>
                                        </div>
                                      </DropdownMenu.Item>
                                    {:else}
                                      <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); rowActionsComposable.handleDeleteRow(r); }} class="text-destructive">
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
                        {#each shownColumns as col (col.key)}
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
                                      onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; rowActionsComposable.handleDuplicateRow(r); }}
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
                                      <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); rowActionsComposable.handleRestoreRow(r); }} class="text-warning">
                                        <div class="flex items-center gap-2">
                                          <span class="relative flex items-center justify-center">
                                            <Trash2 class="size-4 text-warning/70" />
                                            <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                                          </span>
                                          <span>{$t('common.restore')}</span>
                                        </div>
                                      </DropdownMenu.Item>
                                    {:else}
                                      <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); rowActionsComposable.handleDeleteRow(r); }} class="text-destructive">
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
                        {#each shownColumns as col (col.key)}
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
              {#each shownColumns as col, colIdx (col.key)}
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
                    datetimeIanaHeadHighlightClass(col, datetimeIanaModeByKey)
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
                      if (!previewPanel.previewPanelOpen && !previewPanel.previewRow && viewRows.length > 0) {
                        previewPanel.openPreview(viewRows[0]);
                      } else if (previewPanel.previewPanelOpen) {
                        previewPanel.closePreview();
                      } else {
                        previewPanel.openPreview(viewRows[0]);
                      }
                    }}
                    aria-label={$t('entities.list.togglePreviewPanel')}
                    title={$t('entities.list.togglePreviewPanel')}
                    class="transition-transform duration-300"
                  >
                    {#if previewPanel.previewPanelOpen}
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
                <Table.Cell colspan={shownColumns.length + extraCols} class="p-0">
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
                <Table.Cell colspan={shownColumns.length + extraCols} class="p-0">
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
                <Table.Cell colspan={shownColumns.length + extraCols} class="p-0">
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
              <Table.Cell colspan={shownColumns.length + extraCols} class="p-0">
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
              {@const rowFocused = previewPanel.focusedRowIndex === i}
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
                {#each shownColumns as col, colIdx (col.key)}
                  {#if stickyColumnsGroup.some((s) => s.key === col.key)}
                    {#if i === 0}
                      <Table.Cell
                        style="left: {stickyColumnsState.stickyLeftOffsets[col.key] ?? 0}px;"
                        class={cn(
                          stickyCellClass(col.key, colIdx, false),
                          datetimeIanaCellHighlightClass(col, rowSelected, datetimeIanaModeByKey),
                          isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)
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
                          <TableCell row={r} column={col} datetimeIanaModeByKey={datetimeIanaModeByKey} datetimeIanaRenderTick={datetimeIanaRenderTick} />
                        {/if}
                        </div>
                      </Table.Cell>
                    {:else}
                      <Table.Cell
                        style="left: {stickyColumnsState.stickyLeftOffsets[col.key] ?? 0}px;"
                        class={cn(
                          stickyCellClass(col.key, colIdx, false),
                          datetimeIanaCellHighlightClass(col, rowSelected, datetimeIanaModeByKey),
                          isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)
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
                          <TableCell row={r} column={col} datetimeIanaModeByKey={datetimeIanaModeByKey} datetimeIanaRenderTick={datetimeIanaRenderTick} />
                        {/if}
                      </Table.Cell>
                    {/if}
                  {:else}
                    <Table.Cell
                      class={cn(
                        stickyCellClass(col.key, colIdx, false),
                        datetimeIanaCellHighlightClass(col, rowSelected, datetimeIanaModeByKey),
                        isDatetimeIanaRecordMode(col, datetimeIanaModeByKey)
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
                        <TableCell row={r} column={col} datetimeIanaModeByKey={datetimeIanaModeByKey} datetimeIanaRenderTick={datetimeIanaRenderTick} />
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
                                onclick={(e) => { e.stopPropagation(); if (isRowDeleted(r)) return; rowActionsComposable.handleDuplicateRow(r); }}
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
                                <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); rowActionsComposable.handleRestoreRow(r); }} class="text-warning">
                                  <div class="flex items-center gap-2">
                                    <span class="relative flex items-center justify-center">
                                      <Trash2 class="size-4 text-warning/70" />
                                      <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
                                    </span>
                                    <span>{$t('common.restore')}</span>
                                  </div>
                                </DropdownMenu.Item>
                              {:else}
                                <DropdownMenu.Item onclick={(e) => { e.stopPropagation(); rowActionsComposable.handleDeleteRow(r); }} class="text-destructive">
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

          {#if previewPanel.previewPanelOpen}
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
            style="width: {previewPanel.previewPanelOpen ? `${previewPanelWidth}%` : '0'}; min-width: {previewPanel.previewPanelOpen ? '220px' : '0'}"
          >
            <div class="h-full w-full overflow-auto">
              {#if previewPanel.previewPanelOpen}
                <PreviewPanel
                  row={previewPanel.previewRow!}
                  previewEditMode={previewPanel.previewEditMode}
                  previewRowIndex={previewPanel.previewRowIndex}
                  previewDropdownOpen={previewDropdownOpen}
                  totalRecords={footerRangeTotal}
                  currentPage={footerPage}
                  pageSize={pageSize}
                  onPreviewEditModeChange={(mode: boolean) => previewPanel.previewEditMode = mode}
                  onNavigatePreview={navigatePreview}
                  onPreviewDropdownOpenChange={(open: boolean) => previewDropdownOpen = open}
                  onEditRow={handleEditRow}
                  onDuplicateRow={(row: TRow) => rowActionsComposable.handleDuplicateRow(row)}
                  onDeleteRow={(row: TRow) => rowActionsComposable.handleDeleteRow(row)}
                  onRestoreRow={(row: TRow) => rowActionsComposable.handleRestoreRow(row)}
                  onLoadVersionHistory={loadVersionHistory}
                  onClosePreview={() => previewPanel.closePreview()}
                  cell={cell}
                  columns={columns}
                  stickyColumns={stickyColumns}
                  dataColumns={dataColumns}
                  auditingColumns={auditingColumns}
                  datetimeIanaModeByKey={datetimeIanaModeByKey}
                  entityRowActions={entityRowActions}
                  isRowDeleted={isRowDeleted}
                  rowSelectionEnabled={rowSelectionEnabled}
                  rowSelected={selectedKeys.includes(rowKey(previewPanel.previewRow!))}
                />
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
      'text-xs'
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
        <SelectionCounter
          selectionCount={selectionCount}
          selectionLabelKey={selectionLabelKey}
          selectionLabelSingularKey={selectionLabelSingularKey}
          selectionLabelText={selectionLabelText}
          selectionLabelSingularText={selectionLabelSingularText}
          selectionPastParticipleKey={selectionPastParticipleKey}
          showSelectedOnly={showSelectedOnly}
          onShowSelectedOnlyChange={(show: boolean) => { showSelectedOnly = show; if (show) clientSelectedPage = 1; }}
        />
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

<DeleteDialog
  bind:open={dialogs.deleteDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeDeleteDialog(); }}
  isDeleting={rowActionsComposable.isDeleting}
  onConfirm={confirmDeleteRow}
  onCancel={() => dialogs.closeDeleteDialog()}
/>

<RestoreDialog
  bind:open={dialogs.restoreDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeRestoreDialog(); }}
  isRestoring={rowActionsComposable.isRestoring}
  onConfirm={confirmRestoreRow}
  onCancel={() => dialogs.closeRestoreDialog()}
/>

<BulkDeleteDialog
  bind:open={dialogs.bulkDeleteDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeBulkDeleteDialog(); }}
  selectedCount={selectedKeys.length}
  isDeleting={bulkActions.isDeleting}
  onConfirm={confirmBulkDelete}
  onCancel={cancelBulkDelete}
/>

<BulkRestoreDialog
  bind:open={dialogs.bulkRestoreDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeBulkRestoreDialog(); }}
  selectedCount={selectedKeys.length}
  isRestoring={bulkActions.isRestoring}
  onConfirm={confirmBulkRestore}
  onCancel={cancelBulkRestore}
/>

<ExportDialog
  bind:open={exportComposable.exportOpen}
  onOpenChange={(open) => { if (!open) exportComposable.closeExportDialog(); }}
  selectedCount={selectedKeys.length}
  totalCount={total}
  entity={entity}
  exportScope={exportComposable.exportScope}
  onExportScopeChange={(scope) => exportComposable.exportScope = scope}
  fileType={exportComposable.fileType}
  isExporting={exportComposable.isExporting}
  onFileTypeChange={(type) => exportComposable.setFileType(type as 'xlsx' | 'csv')}
  onConfirm={confirmExportRow}
  onCancel={cancelExportRow}
/>

<HtmlExportDialog
  bind:open={exportComposable.htmlPreviewDialogOpen}
  onOpenChange={(open: boolean) => { if (!open) exportComposable.closeHtmlExportDialog(); }}
  selectedCount={selectedKeys.length}
  totalCount={total}
  entity={entity}
  exportScope={exportComposable.htmlExportScope}
  onExportScopeChange={(scope) => exportComposable.htmlExportScope = scope}
  isExporting={exportComposable.isHtmlExporting}
  onConfirm={confirmHtmlExport}
  onCancel={cancelHtmlExport}
/>

<DuplicateDialog
  bind:open={dialogs.duplicateDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeDuplicateDialog(); }}
  duplicateScope={duplicateScope}
  selectedCount={selectedKeys.length}
  entity={entity}
  isDuplicating={rowActionsComposable.isDuplicating}
  onConfirm={confirmDuplicate}
  onCancel={cancelDuplicate}
/>

<!-- HTML preview full-screen dialog -->
<ExportPreviewDialog
  bind:open={exportComposable.htmlPreviewDialogOpen}
  onOpenChange={(open) => { if (!open) exportComposable.closeHtmlExportDialog(); }}
  previewMode={exportComposable.previewMode}
  onPreviewModeChange={(mode: 'html' | 'pdf' | 'email') => exportComposable.previewMode = mode}
  htmlPreviewContent={exportComposable.htmlPreviewContent}
  pdfBlobUrl={exportComposable.pdfBlobUrl}
  emailHtmlContent={exportComposable.emailHtmlContent}
  isEmailPreparing={exportComposable.isEmailPreparing}
  emailCopied={exportComposable.emailCopied}
  onGeneratePdfPreview={generatePdfPreview}
  onPrepareEmailHtml={prepareEmailHtml}
  onCopyHtmlToClipboard={copyHtmlToClipboard}
  onCopyEmailHtmlToClipboard={copyEmailHtmlToClipboard}
  onClose={closeHtmlPreview}
/>

<style src="./EntityListTable.css"></style>

