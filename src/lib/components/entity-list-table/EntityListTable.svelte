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
  import TableBody from './components/TableBody.svelte';
  import TableFooter from './components/TableFooter.svelte';
  import CardViewRenderer from './components/CardViewRenderer.svelte';
  import PreviewPanelWrapper from './components/PreviewPanelWrapper.svelte';

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
  import { stickyCardFieldChromeClass } from './utils/card-styling';
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

  // Utility functions moved to utils.ts
  const rowKey = (row: TRow): string => getRowKey(row, uid);

  // Toggle functions - must be defined before effects that use them
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

  type ColumnOrderState = {
    sticky?: string[];
    data?: string[];
    auditing?: string[];
  };

  const orderState = $state<ColumnOrderState>({});

  const allColumns = $derived.by(() => {
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
  });
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
  });

  $effect(() => {
    void advancedFilters;
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
  /** Use `thead th` / `tbody td` selectors — attribute-based [&_[data-slot=…]] variants are unreliable in Tailwind. */
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
    previewPanel.navigatePreview(direction > 0 ? "next" : "prev");
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
        <CardViewRenderer
          viewMode={viewMode}
          viewRows={viewRows}
          shownColumns={shownColumns}
          rowSelectionEnabled={rowSelectionEnabled}
          selectedKeys={selectedKeys}
          rowKey={rowKey}
          isRowDeleted={isRowDeleted}
          previewPanel={previewPanel}
          actionsEnabled={actionsEnabled}
          rowActions={rowActions}
          entityRowActions={entityRowActions}
          dropdownMenuRow={dropdownMenuRow}
          datetimeIanaModeByKey={datetimeIanaModeByKey}
          datetimeIanaRenderTick={datetimeIanaRenderTick}
          cell={cell}
          stickyColumnsGroup={stickyColumnsGroup}
          onLoadVersionHistory={() => {}}
          error={error}
          errorView={errorView}
          rowsLoading={rowsLoading}
          rowsLoadingView={rowsLoadingView}
          loadingText={loadingText}
          rows={rows}
          emptyView={emptyView}
          emptyText={emptyText}
          showSelectedOnly={showSelectedOnly}
          selectionCount={selectionCount}
          orderedSelectedRows={orderedSelectedRows}
          allOnPageSelected={allOnPageSelected}
          headerIndeterminate={headerIndeterminate}
          toggleAllOnPage={toggleAllOnPage}
          allColumns={allColumns}
          effectiveSortKey={effectiveSortKey}
          sortDir={sortDir}
          onSortChange={onSortChange}
          sortableColumns={sortableColumns}
          datetimeIanaToggleColumns={datetimeIanaToggleColumns}
          toggleDatetimeIana={toggleDatetimeIana}
          onEntityRowClick={onEntityCardClick}
          onToggleRowSelect={toggleRowSelect}
          onOpenRowDropdown={openRowDropdown}
          onCloseRowDropdown={closeRowDropdown}
          onEditRow={handleEditRow}

          onDuplicateRow={(r) => rowActionsComposable.handleDuplicateRow(r)}
          onDeleteRow={(r) => rowActionsComposable.handleDeleteRow(r)}
          onRestoreRow={(r) => rowActionsComposable.handleRestoreRow(r)}
          onPreviewRow={handlePreviewRow}
        />
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="flex h-full overflow-hidden" role="region" aria-label="Table and preview panel">
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
        <TableBody
          error={error}
          errorView={errorView}
          rowsLoading={rowsLoading}
          rowsLoadingView={rowsLoadingView}
          loadingText={loadingText}
          rows={rows}
          viewRows={viewRows}
          shownColumns={shownColumns}
          extraCols={extraCols}
          emptyView={emptyView}
          emptyText={emptyText}
          showSelectedOnly={showSelectedOnly}
          selectionCount={selectionCount}
          orderedSelectedRows={orderedSelectedRows}
          rowSelectionEnabled={rowSelectionEnabled}
          selectedKeys={selectedKeys}
          rowRangeSelection={rowRangeSelection}
          datetimeIanaRenderTick={datetimeIanaRenderTick}
          rowKey={rowKey}
          isRowDeleted={isRowDeleted}
          previewPanel={previewPanel}
          actionsEnabled={actionsEnabled}
          rowChromeH={rowChromeH}
          stickyColumnsGroup={stickyColumnsGroup}
          onLoadVersionHistory={() => {}}
          stickyColumnsState={stickyColumnsState}
          datetimeIanaModeByKey={datetimeIanaModeByKey}
          cell={cell}
          rowActions={rowActions}
          entityRowActions={entityRowActions}
          dropdownMenuRow={dropdownMenuRow}
          onRowRangeMouseDown={(index: number, e: MouseEvent) => rowRangeSelection.onRowRangeMouseDown(index, e)}
          onEntityRowClick={onEntityRowClick}
          onPreviewRow={handlePreviewRow}
          onToggleRowSelect={toggleRowSelect}
          onOpenRowDropdown={openRowDropdown}
          onCloseRowDropdown={closeRowDropdown}
          onEditRow={handleEditRow}

          onDuplicateRow={(row: TRow) => rowActionsComposable.handleDuplicateRow(row)}
          onDeleteRow={(row: TRow) => rowActionsComposable.handleDeleteRow(row)}
          onRestoreRow={(row: TRow) => rowActionsComposable.handleRestoreRow(row)}
          stickyCellClass={stickyCellClass}
        />
      </Table.Root>
          </div>

          <PreviewPanelWrapper
            {previewPanel}
            {rows}
            {viewRows}
            {uid}
            {pageSize}
            {page}
            {onPageChange}
            {entity}
            {columns}
            {stickyColumns}
            {dataColumns}
            {auditingColumns}
            {rowActionsEnabled}
            {rowActions}
            {entityRowActions}
            {datetimeIanaModeByKey}
            {isRowDeleted}
            {rowKey}
            {rowSelectionEnabled}
            selectedKeys={selectedKeys as Set<string> | string[]}
            footerRangeTotal={footerRangeTotal}
            footerPage={footerPage}
            {previewDropdownOpen}
            navigatePreview={navigatePreview}
            onEditRow={handleEditRow}
            onDuplicateRow={(row: TRow) => rowActionsComposable.handleDuplicateRow(row)}
            onDeleteRow={(row: TRow) => rowActionsComposable.handleDeleteRow(row)}
            onRestoreRow={(row: TRow) => rowActionsComposable.handleRestoreRow(row)}
            onPreviewDropdownOpenChange={(open: boolean) => previewDropdownOpen = open}
            {rowsLoading}
            {cell}
          />
        </div>
    {/if}
    {/if}
  </div>

  <TableFooter
    footerRangeTotal={footerRangeTotal}
    footerRangeStart={footerRangeStart}
    footerRangeEnd={footerRangeEnd}
    footerPage={footerPage}
    footerTotalPages={footerTotalPages}
    footerUsesClientPaging={footerUsesClientPaging}
    bind:clientSelectedPage={clientSelectedPage}
    rowSelectionEnabled={rowSelectionEnabled}
    selectionCount={selectionCount}
    selectionLabelKey={selectionLabelKey}
    selectionLabelSingularKey={selectionLabelSingularKey}
    selectionLabelText={selectionLabelText}
    selectionLabelSingularText={selectionLabelSingularText}
    selectionPastParticipleKey={selectionPastParticipleKey}
    bind:showSelectedOnly={showSelectedOnly}
    pageSize={pageSize}
    pageSizeOptions={pageSizeOptions}
    page={page}
    totalPages={totalPages}
    onPageChange={onPageChange}
    onPageSizeChange={onPageSizeChange}
  />
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

