<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { onMount, untrack } from 'svelte';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { LoadingBar } from '$lib/components/ui/loading-bar';
  import { Switch } from '$lib/components/ui/switch';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Table from '$lib/components/ui/table';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { cn } from '$lib/utils.js';
  import { closeSheet, openSheet, sheetState } from '$lib/shell/sheets/sheet-manager.svelte';
  import type { MetaColumn, SortDir } from '$lib/entity-list/types';
  import { formatDatetimeCellDisplay } from '$lib/entity-list/format-datetime-iana-cell';
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
    EyeOff
  } from 'lucide-svelte';

  type CellArgs = { row: TRow; column: MetaColumn };

  let {
    uid,
    columns,
    stickyColumns,
    dataColumns,
    auditingColumns,
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
    filtersOpen = $bindable(false),
    datetimeIanaModeByKey = $bindable<Record<string, 'browser' | 'record'>>({}),
    datetimeIanaRenderTick = $bindable(0),
    cell,
    filters,
    metaLoadingView,
    rowsLoadingView,
    emptyView,
    errorView,
    loadingMessage,
    noRecordsMessage
  }: {
    /** Meta column key whose values uniquely identify a row in the list (uuid, id, …). */
    uid: string;
    /**
     * Columns to render/select in the UI.
     * - New shape (preferred): provide `stickyColumns` + `dataColumns` + `auditingColumns`
     * - Back-compat: provide `columns` only
     */
    columns: MetaColumn[];
    stickyColumns?: MetaColumn[];
    dataColumns?: MetaColumn[];
    auditingColumns?: MetaColumn[];
    /** Session-scoped (sessionStorage) storage key for per-group column ordering. */
    columnOrderStorageKey?: string;
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
    onResetColumnVisibility: () => void;
    selectedKeys: string[];
    onSelectedKeysChange: (keys: string[]) => void;
    rowSelectionEnabled?: boolean;
    rowDensity?: 'default' | 'compact';
    onRefresh: () => void;
    refreshDisabled?: boolean;
    rowActionsEnabled?: boolean;
    rowActions?: Snippet<[ { row: TRow } ]>;
    filtersOpen?: boolean;
    /** Two-way with parent when the route uses `{#snippet cell}` and must mirror IANA datetime formatting. */
    datetimeIanaModeByKey?: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick?: number;
    cell?: Snippet<[CellArgs]>;
    filters?: Snippet;
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
    onResetColumnVisibility();
    // Reset column visual order (sticky/data/auditing) to default meta order.
    orderState.sticky = undefined;
    orderState.data = undefined;
    orderState.auditing = undefined;
    writeOrderState({});
    if (defaultSort?.key) onSortChange(defaultSort.key, defaultSort.dir ?? defaultSortDir);
    else onSortChange(null, defaultSortDir);
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
  });

  $effect(() => {
    void viewMode;
    writeViewMode(viewMode);
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
    // `filters` is a Snippet whose reference changes whenever the parent re-renders (e.g. on
    // `selectedKeys` updates). Do not subscribe to it here — only react to real sheet/bind state.
    if (!untrack(() => filters)) return;
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
        onResetColumnVisibility: resetColumnsAndSorting,
        sheetMenuCheckboxClass,
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
        sheetMenuCheckboxClass
      } as any;
    }
  });

  /** When the global sheet closes after showing filters, mirror that to the bindable prop. */
  $effect(() => {
    if (!untrack(() => filters)) return;
    void sheetState.open;
    void lastPanelId;
    if (!sheetState.open && lastPanelId === 'entity.filters') filtersOpen = false;
  });

  const selectionCheckboxClass =
    'border-foreground/50 shadow-sm dark:border-foreground/35 data-[state=checked]:border-primary';

  /** Sheet list rows use a real `Checkbox` for visuals; the row `button` handles clicks (checkbox is non-interactive). */
  const sheetMenuCheckboxClass =
    'pointer-events-none shrink-0 border-foreground/50 shadow-sm dark:border-foreground/35 data-[state=checked]:border-primary';

  const compactRows = $derived(rowDensity === 'compact');
  const rowChromeH = $derived(compactRows ? 'h-6' : 'h-10');
  /** Use `thead th` / `tbody td` selectors — attribute-based [&_[data-slot=…]] variants are unreliable in Tailwind. */
  const tableDensityClass = $derived(
    compactRows
      ? '[&_th]:!h-6 [&_th]:py-1 [&_th]:text-xs [&_tbody_td]:!py-1.5 [&_tbody_td]:text-sm'
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
   * `Table.Row` applies `hover:[…]:[&>th]:bg-muted`; repeat the same bg on `hover:` with `!` so the
   * header does not grey out on row hover (hover tint stays on body cells only).
   */
  function datetimeIanaHeadHighlightClass(col: MetaColumn): string | undefined {
    if (!isDatetimeIanaRecordMode(col)) return undefined;
    return '!bg-amber-100 hover:!bg-amber-100 dark:!bg-amber-950 dark:hover:!bg-amber-950';
  }

  /**
   * Datetime IANA body cells: amber palette only in record (stored timezone) mode. Browser mode: no classes here
   * (standard neutral interaction applies). Light: 50→100 hover, 200→300 when row selected.
   * Dark (Tailwind amber): base `950` → hover `900` → selected `800` → selected+hover `700`.
   */
  function datetimeIanaCellHighlightClass(col: MetaColumn, rowSelected: boolean): string | undefined {
    if (!isDatetimeIanaRecordMode(col)) return undefined;
    if (rowSelected) {
      return '!bg-amber-200/95 dark:!bg-amber-800 transition-colors group-hover/entity-row:!bg-amber-300/95 dark:group-hover/entity-row:!bg-amber-700';
    }
    return '!bg-amber-50 dark:!bg-amber-950 transition-colors group-hover/entity-row:!bg-amber-100/95 dark:group-hover/entity-row:!bg-amber-900';
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
      ? '!bg-neutral-300 dark:!bg-neutral-700 transition-colors group-hover/entity-row:!bg-neutral-400 dark:group-hover/entity-row:!bg-neutral-600'
      : 'bg-neutral-100 dark:bg-neutral-900 transition-colors group-hover/entity-row:bg-neutral-200 dark:group-hover/entity-row:bg-neutral-800';
  }

  /**
   * Sticky uuid/code body overlay (dark, not IANA): base from `stickyCellClass`; hover `800`; selected `700` / `600`.
   */
  function entityListGrayBandStickyInteractionClass(rowSelected: boolean): string {
    return rowSelected
      ? '!bg-neutral-300 dark:!bg-neutral-700 transition-colors group-hover/entity-row:!bg-neutral-400 dark:group-hover/entity-row:!bg-neutral-600'
      : 'transition-colors group-hover/entity-row:bg-neutral-200 dark:group-hover/entity-row:bg-neutral-800';
  }

  /**
   * Normal (non-sticky) scroll cells — **not** IANA record (IANA uses its own ramp). Light unchanged.
   * Dark: rest `950`, hover `900`, selected `900`, selected+hover `800` (sticky selected resta `700`/`600`).
   */
  function entityListDefaultScrollInteractionClass(rowSelected: boolean): string | undefined {
    if (rowSelected) {
      return 'transition-colors !bg-neutral-100 dark:!bg-neutral-900 group-hover/entity-row:!bg-neutral-200 dark:group-hover/entity-row:!bg-neutral-800';
    }
    return 'dark:!bg-neutral-950 transition-colors group-hover/entity-row:!bg-neutral-50 dark:group-hover/entity-row:!bg-neutral-900';
  }

  let rowRangeMouseDown = $state(false);
  let rangeAnchorIndex = $state<number | null>(null);
  let rangeDragActive = $state(false);
  let lastRangeEndIndex = $state<number | null>(null);
  /** Selection at mousedown; current drag applies symmetric diff with the active range vs this snapshot. */
  let selectionSnapshotAtMouseDown: Set<string> | null = null;
  /** After a range brush drag, suppress the following `click` on the row (same gesture as mouseup). */
  let skipNextRowClickSelectToggle = false;

  const defaultSortDir = $derived(defaultSort?.dir ?? 'asc');
  const effectiveSortKey = $derived(sortKey ?? defaultSort?.key ?? null);
  const pageSizeOptions = $derived(pageSizeOptionsProp ?? [10, 25, 50, 100]);
  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));
  const allColumns = $derived(
    stickyColumns || auditingColumns
      ? [
          ...applyKeyOrder(stickyColumns ?? [], orderState.sticky),
          ...applyKeyOrder(dataColumns ?? [], orderState.data),
          ...applyKeyOrder(auditingColumns ?? [], orderState.auditing)
        ]
      : columns
  );
  const datetimeIanaToggleColumns = $derived(allColumns.filter((c) => !!c.datetimeIanaToggle));
  const sortableColumns = $derived(allColumns.filter((c) => c.sortable !== false));
  const searchableColumns = $derived(allColumns.filter((c) => c.searchable !== false));
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
    const left = key === 'uuid' ? 'left-[var(--pb-sticky-left-uuid)]' : 'left-[var(--pb-sticky-left-code)]';
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
        return 'font-medium text-amber-700/90 dark:text-amber-400/90';
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

  {#snippet entityCardField(r: TRow, col: MetaColumn, rowSelected: boolean)}
    <div
      class={cn(
        'flex flex-col gap-0.5',
        viewMode === 'cards_list' ? 'min-w-[9rem] max-w-[24rem] shrink-0' : 'min-w-0'
      )}
    >
      <div class="text-xs font-medium text-muted-foreground">{$t(col.labelKey)}</div>
      <div
        class={cn(
          'min-w-0 text-sm',
          (!isCardFieldEmpty(r, col)
            ? datetimeIanaCardFieldHighlightClass(col, rowSelectionEnabled && rowSelected)
            : undefined) ?? stickyCardFieldChromeClass(col, rowSelectionEnabled && rowSelected)
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
                  aria-label="Vuoto"
                >
                  <Ban class="size-4" />
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Vuoto</Tooltip.Content>
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
      <div class="relative w-full">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 z-20 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <!-- Highlight layer: must match Input padding / font so glyphs line up with transparent text above. -->
        <div
          class="pointer-events-none absolute inset-0 z-0 flex min-h-9 items-center overflow-hidden whitespace-pre rounded-md border border-transparent bg-background py-1 pl-8 pr-36 text-base leading-normal md:text-sm"
          aria-hidden="true"
        >
          {#each searchSyntaxParts as seg, si (si)}
            <span class={searchSyntaxSpanClass(seg)}>{seg.text}</span>
          {/each}
        </div>
        <Input
          class="relative z-10 bg-transparent pl-8 pr-36 text-transparent caret-foreground selection:bg-primary/25 selection:text-transparent dark:selection:bg-primary/35 dark:selection:text-transparent"
          value={search}
          spellcheck={false}
          oninput={(e) => onSearchInput((e.currentTarget as HTMLInputElement).value)}
          placeholder={$t(searchPlaceholderKey ?? 'entities.list.searchPlaceholder')}
        />

        <div class="absolute right-1 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1">
          {#if search.trim().length > 0}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground opacity-70 hover:bg-accent hover:text-accent-foreground hover:opacity-100"
              onclick={() => onSearchInput('')}
              aria-label={$t('common.reset')}
              title={$t('common.reset')}
            >
              <XIcon class="size-4" />
            </Button>
          {/if}

          <Button
            variant="soft"
            size="xs"
            type="button"
            onclick={() =>
              openSheet(
                'entity.searchIn',
                {
                  searchInKeys,
                  searchableColumns,
                  onSearchInKeysChange,
                  toggleSearchKey,
                  sheetMenuCheckboxClass
                } as any,
                { contentClass: 'w-[360px] p-0' }
              )}
          >
            {searchScopeLabel()}
          </Button>
        </div>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2">
      <Button
        variant="soft"
        size="icon-sm"
        disabled={rowsLoading || refreshDisabled}
        onclick={() => onRefresh()}
        aria-label="refresh"
        title="refresh"
      >
        <RotateCw class={rowsLoading ? 'size-4 animate-spin' : 'size-4'} />
      </Button>

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
            'rounded-sm transition-colors',
            viewMode !== 'table' && 'hover:bg-sky-200 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
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
            'rounded-sm transition-colors',
            viewMode !== 'cards' && 'hover:bg-sky-200 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
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
            'rounded-sm transition-colors',
            viewMode !== 'cards_list' && 'hover:bg-sky-200 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
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
              sheetMenuCheckboxClass,
              t: $t
            } as any,
            { contentClass: 'w-[360px] p-0' }
          )}
      >
        <Columns3 class="size-4" />
        {$t('entities.list.columns')}
      </Button>

      {#if filters}
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
            openSheet('entity.filters', { content: filters } as any, {
              contentClass: 'w-[360px] p-0'
            });
          }}
        >
          <SlidersHorizontal class="size-4" />
          {$t('entities.list.filters')}
        </Button>
      {/if}
    </div>
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
              <div class="grid min-h-[14rem] place-items-center">
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
                <div class="grid min-h-[14rem] place-items-center">
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
              <div class="grid min-h-[14rem] place-items-center">
                <div class="relative flex flex-col items-center gap-2 text-center">
                  <div class="pb-watermark-empty">
                    <TriangleAlert class="size-20 text-warning" />
                  </div>
                  <div class="text-sm font-medium text-muted-foreground">{emptyText}</div>
                </div>
              </div>
            {/if}
          {:else if viewRows.length === 0}
            <div class="grid min-h-[14rem] place-items-center">
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
              class="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-background/90 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70"
            >
              <div class="flex flex-wrap items-center gap-2">
                {#if rowSelectionEnabled}
                  <Checkbox
                    class={selectionCheckboxClass}
                    checked={allOnPageSelected}
                    indeterminate={headerIndeterminate}
                    onCheckedChange={() => toggleAllOnPage()}
                    aria-label="select all"
                  />
                  <span class="text-xs font-medium text-muted-foreground">
                    {allOnPageSelected ? 'deseleziona tutto' : 'seleziona tutto'}
                  </span>
                {/if}

                <div class="mx-1 h-6 w-px bg-border/60" aria-hidden="true"></div>

                <span class="text-xs font-medium text-muted-foreground">Ordina per</span>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props })}
                      <Button variant="soft" size="xs" {...props} class="max-w-[220px] truncate">
                        {#if effectiveSortKey}
                          {$t(allColumns.find((c) => c.key === effectiveSortKey)?.labelKey ?? '')}
                        {:else}
                          —
                        {/if}
                      </Button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content>
                    <DropdownMenu.Item
                      class={dropdownMenuSelectedItemClass(effectiveSortKey === null)}
                      onSelect={() => onSortChange(null, defaultSortDir)}
                    >
                      —
                    </DropdownMenu.Item>
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

                <span class="ml-1 text-xs font-medium text-muted-foreground">in ordine</span>
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
                  <DropdownMenu.Content>
                    <DropdownMenu.Item
                      class={dropdownMenuSelectedItemClass(sortDir === 'asc')}
                      onSelect={() => effectiveSortKey && onSortChange(effectiveSortKey, 'asc')}
                    >
                      <span class="inline-flex items-center gap-2">
                        <ArrowUpNarrowWide class="size-4" />
                        Crescente
                      </span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      class={dropdownMenuSelectedItemClass(sortDir === 'desc')}
                      onSelect={() => effectiveSortKey && onSortChange(effectiveSortKey, 'desc')}
                    >
                      <span class="inline-flex items-center gap-2">
                        <ArrowDownWideNarrow class="size-4" />
                        Decrescente
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
                              class={selectionCheckboxClass}
                              checked={selectedKeys.includes(rk)}
                              onCheckedChange={() => toggleRowSelect(rk)}
                              aria-label="select row"
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
                              <Button variant="ghost" size="icon-sm" aria-label="row actions" title="actions">
                                <MoreVertical class="size-4" />
                              </Button>
                            {/if}
                          </div>
                        {/if}
                      </div>

                      <div class="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-3">
                        {#each renderColumns as col (col.key)}
                          {@render entityCardField(r, col, rowSelected)}
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
                              class={selectionCheckboxClass}
                              checked={selectedKeys.includes(rk)}
                              onCheckedChange={() => toggleRowSelect(rk)}
                              aria-label="select row"
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
                              <Button variant="ghost" size="icon-sm" aria-label="row actions" title="actions">
                                <MoreVertical class="size-4" />
                              </Button>
                            {/if}
                          </div>
                        {/if}
                      </div>

                      <div class="flex flex-col gap-2">
                        {#each renderColumns as col (col.key)}
                          {@render entityCardField(r, col, rowSelected)}
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
            'w-full bg-background [&_[data-slot=table]]:isolate [&_[data-slot=table]]:bg-background [&_[data-slot=table-cell]]:bg-clip-border [&_[data-slot=table-cell]:not(.sticky)]:bg-background dark:[&_[data-slot=table-cell]:not(.sticky)]:bg-neutral-950 [&_[data-slot=table-head]:not(.sticky)]:bg-neutral-50 dark:[&_[data-slot=table-head]:not(.sticky)]:bg-neutral-900',
            tableDensityClass
          )}
          containerClass="h-full overflow-auto"
          style={`--pb-sticky-left-uuid: ${stickyLeftUuidPx}px; --pb-sticky-left-code: ${stickyLeftCodePx}px;`}
        >
          <Table.Header class="sticky top-0 z-[80] bg-background">
            <Table.Row>
              {#if rowSelectionEnabled}
                <Table.Head
                  bind:ref={checkboxHeadRef}
                  class="w-10 min-w-10 max-w-10 sticky left-0 z-[70] bg-neutral-200 dark:bg-neutral-800 bg-clip-border px-2"
                >
                  <div class={cn('flex items-center justify-center', rowChromeH)}>
                    <Checkbox
                      class={selectionCheckboxClass}
                      checked={allOnPageSelected}
                      indeterminate={headerIndeterminate}
                      onCheckedChange={() => toggleAllOnPage()}
                      aria-label="select all"
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
                class="w-10 min-w-10 max-w-10 sticky right-0 z-[70] bg-neutral-200 dark:bg-neutral-800 bg-clip-border px-2"
              >
                <div class={cn('flex items-center justify-center', rowChromeH)}>
                  <span class="sr-only">actions</span>
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
                  <div class="grid min-h-[14rem] place-items-center p-3">
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
                    <div class="grid min-h-[14rem] place-items-center p-3">
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
                  <div class="grid min-h-[14rem] place-items-center p-3">
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
                <div class="grid min-h-[14rem] place-items-center p-3">
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
              <Table.Row
                suppressCellHoverMuted
                data-row-index={rowSelectionEnabled ? i : undefined}
                data-state={rowSelected ? 'selected' : undefined}
                class={cn(
                  'group/entity-row',
                  rowSelected ? 'data-[state=selected]:!bg-transparent' : undefined
                )}
                onmousedown={rowSelectionEnabled ? (e) => onRowRangeMouseDown(i, e) : undefined}
                onclick={rowSelectionEnabled ? (e) => onEntityRowClick(rk, e) : undefined}
              >
                {#if rowSelectionEnabled}
                  <Table.Cell
                    class={cn(
                      'w-10 min-w-10 max-w-10 sticky left-0 z-50 bg-clip-border p-2',
                      entityListGrayChromeCellClass(rowSelected)
                    )}
                  >
                    <div class={cn('flex items-center justify-center', rowChromeH)}>
                      <Checkbox
                        class={selectionCheckboxClass}
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
                            : entityListGrayBandStickyInteractionClass(rowSelected),
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
                            : entityListGrayBandStickyInteractionClass(rowSelected),
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
                            : entityListGrayBandStickyInteractionClass(rowSelected),
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
                            : entityListGrayBandStickyInteractionClass(rowSelected),
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
                          : entityListDefaultScrollInteractionClass(rowSelected),
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
                        <Button variant="ghost" size="icon-sm" aria-label="row actions" title="actions">
                          <MoreVertical class="size-4" />
                        </Button>
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
          aria-label="first page"
          title="first page"
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
          aria-label="previous page"
          title="previous page"
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
          aria-label="next page"
          title="next page"
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
          aria-label="last page"
          title="last page"
        >
          <ChevronsRight class="size-4" />
        </Button>
      </div>
    </div>
  </div>
</div>

{#if filters}
  <!-- Filters content is mounted inside the global SheetHost (entity.filters panel). -->
{/if}

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
