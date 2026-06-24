<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
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
  import { Pagination } from './pagination';
  import TableBody from './components/TableBody.svelte';
  import TableFooter from './components/TableFooter.svelte';
  import CardViewRenderer from './components/CardViewRenderer.svelte';
  import PreviewPanelWrapper from './components/PreviewPanelWrapper.svelte';
  import BulkActionsToolbar from './components/BulkActionsToolbar.svelte';
  import EntityListTableHeader from './components/EntityListTableHeader.svelte';
  import EntityListTableFooter from './components/EntityListTableFooter.svelte';
  import EntityListTableDialogs from './components/EntityListTableDialogs.svelte';
  import EntityListTableLoading from './components/EntityListTableLoading.svelte';
  import EntityListTableCardView from './components/EntityListTableCardView.svelte';
  import EntityListTableHeaderRow from './components/EntityListTableHeaderRow.svelte';
  import EntityListTableTableView from './components/EntityListTableTableView.svelte';
  import EntityListTableContent from './components/EntityListTableContent.svelte';

  import {
    useStickyColumns,
    useScrollPreservation,
    useRowRangeSelection,
    useFilterPersistence,
    useToolbarMode,
    useSheetPanelManagement,
    useClientSelection,
    useKeyboardNavigation
  } from './composables';
  import { useColumnOrder } from './composables/useColumnOrder.svelte';
  import { useViewMode, type ViewMode } from './composables';
  import {
    isRowDeleted as isRowDeletedUtil,
    getRowKey
  } from './utils';
  import { useExport } from './composables/useExport.svelte.js';
  import { useBulkActions } from './composables/useBulkActions.svelte.js';
  import { useRowActions } from './composables/useRowActions.svelte.js';
  import { useDialogs } from './composables/useDialogs.svelte.js';
  import { usePreviewPanel } from './composables/usePreviewPanel.svelte.js';
  import { useDeletionFilter } from './composables/useDeletionFilter.svelte';
  import { createSelectionHandlers } from './handlers/selection';
  import { createSortingHandlers } from './handlers/sorting';
  import { createClickHandlers } from './handlers/click-handlers';
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
    entityListDestructiveScrollInteractionClass,
    stickyCellClassWithCompute
  } from './utils/cell-styling';
  import { stickyCardFieldChromeClass } from './utils/card-styling';
  import { isBlankish, getAuditFieldValue, isCardFieldEmpty } from './utils/cell-formatting';
  import { setAuditColumnsContext } from './context';
  import XIcon from '@lucide/svelte/icons/x';
  import Search from '@lucide/svelte/icons/search'
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
  import ArrowUpNarrowWide from '@lucide/svelte/icons/arrow-up-narrow-wide'
  import ArrowDownWideNarrow from '@lucide/svelte/icons/arrow-down-wide-narrow'
  import ArrowUp from '@lucide/svelte/icons/arrow-up'
  import ArrowDown from '@lucide/svelte/icons/arrow-down'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import Hourglass from '@lucide/svelte/icons/hourglass'
  import CircleX from '@lucide/svelte/icons/circle-x'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import ChevronsLeft from '@lucide/svelte/icons/chevrons-left'
  import ChevronsRight from '@lucide/svelte/icons/chevrons-right'
  import ChevronUp from '@lucide/svelte/icons/chevron-up'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import MoreVertical from '@lucide/svelte/icons/more-vertical'
  import Ban from '@lucide/svelte/icons/ban'
  import Globe from '@lucide/svelte/icons/globe'
  import MapPin from '@lucide/svelte/icons/map-pin'
  import Eye from '@lucide/svelte/icons/eye'
  import EyeOff from '@lucide/svelte/icons/eye-off'
  import ListCheck from '@lucide/svelte/icons/list-check'
  import FilterX from '@lucide/svelte/icons/filter-x'
  import Pencil from '@lucide/svelte/icons/pencil'
  import PencilOff from '@lucide/svelte/icons/pencil-off'
  import Trash from '@lucide/svelte/icons/trash'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import ArrowUpFromLine from '@lucide/svelte/icons/arrow-up-from-line'
  import AlertCircle from '@lucide/svelte/icons/alert-circle'
  import PanelRightClose from '@lucide/svelte/icons/panel-right-close'
  import PanelRightOpen from '@lucide/svelte/icons/panel-right-open'
  import Copy from '@lucide/svelte/icons/copy'
  import Download from '@lucide/svelte/icons/download'
  import Funnel from '@lucide/svelte/icons/funnel'
  import CircleCheck from '@lucide/svelte/icons/circle-check'
  import Info from '@lucide/svelte/icons/info'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import FileClock from '@lucide/svelte/icons/file-clock';
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

  import type { EntityListTableProps, CellArgs } from './types';

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
    selectedKeys = $bindable<string[]>([]),
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
  }: EntityListTableProps<TRow> = $props();

  // Set context for child components — must be reactive because auditingColumns
  // arrives after meta is loaded (initial value is [] before meta fetch completes)
  $effect(() => {
    setAuditColumnsContext(auditingColumns);
  });

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

  // Column order management using composable
  const columnOrder = useColumnOrder(columnOrderStorageKey);
  const orderState = columnOrder.state;

  const allColumns = $derived.by(() => {
    let all: MetaColumn[];
    if (stickyColumns || auditingColumns) {
      all = [
        ...columnOrder.applyKeyOrder(stickyColumns ?? [], orderState.sticky),
        ...columnOrder.applyKeyOrder(dataColumns ?? [], orderState.data),
        ...columnOrder.applyKeyOrder(auditingColumns ?? [], orderState.auditing)
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
    columnOrder.applyKeyOrder(
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
    columnOrder.applyKeyOrder(auditingColumns ?? allColumns.filter((c) => auditingKeySet.has(c.key)), orderState.auditing)
  );
  const nonAuditingColumns = $derived(
    columnOrder.applyKeyOrder(
      dataColumns ??
        allColumns.filter(
          (c) => !auditingKeySet.has(c.key) && !stickyColumnsGroup.some((s) => s.key === c.key)
        ),
      orderState.data
    )
  );

  // View mode management using composable
  const viewModeStorageKey = $derived(
    columnOrderStorageKey ? `${columnOrderStorageKey}:viewMode` : `pb.entityList:${uid}:viewMode`
  );
  const viewModeComposable = useViewMode({
    initialMode: 'table',
    storageKey: viewModeStorageKey
  });
  const viewMode = $derived(viewModeComposable.state.viewMode);

  // Deletion filter management using composable
  const deletionFilterComposable = useDeletionFilter(
    uid,
    columnOrderStorageKey,
    deletionFilterModeProp ?? 'non_deleted',
    onDeletionFilterModeChange
  );
  const deletionFilterMode = $derived(deletionFilterComposable.state.deletionFilterMode);

  // Column order functions provided by composable

  onMount(() => {
    // Column order initialization handled by composable
    // View mode initialization handled by composable
    // Deletion filter initialization handled by composable
  });

  // Deletion filter persistence handled by composable

  $effect(() => {
    void filterValues;
  });

  $effect(() => {
    void advancedFilters;
  });


  // Sheet panel management composable
  const sheetPanelManagement = useSheetPanelManagement();

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
          columnOrder.applyColumnVisibility(group, dedup);
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
    void sheetPanelManagement.state.lastPanelId;
    if (!sheetState.open && sheetPanelManagement.state.lastPanelId === 'entity.filters') filtersOpen = false;
  });

  const rowChromeH = $derived('h-6');
  /** Use `thead th` / `tbody td` selectors � attribute-based [&_[data-slot=�]] variants are unreliable in Tailwind. */
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





  /** Export confirmation dialog state */
  // Export state is now managed by exportComposable

  /** Entity preview panel state */
  const _sessionRaw = (() => {
    if (typeof sessionStorage === 'undefined') return null;
    const key = `pb-preview-panel:${entity ?? 'default'}`;
    return sessionStorage.getItem(key);
  })();




  // ============================
  // Dropdown Handlers
  // ============================

  /** Open dropdown menu for a specific row */
  function openRowDropdown(row: TRow) {
    dropdownMenuRow = row;
  }

  /** Close dropdown menu */
  function closeRowDropdown() {
    dropdownMenuRow = null;
  }

  /** Navigate preview records */
  function navigatePreview(direction: number) {
    previewPanel.navigatePreview(direction > 0 ? "next" : "prev");
  }

  // ============================
  // Keyboard Navigation Handlers
  // ============================
  // (Wired via useKeyboardNavigation composable — instantiated after previewPanel)


  // ============================
  // Row Action Handlers
  // ============================

  /** Handle delete action for a row */
  function handleDeleteRow(row: TRow) {
    // Open confirmation dialog instead of deleting directly
    dialogs.setRowToDelete(row);
    dialogs.openDeleteDialog();
    closeRowDropdown();
  }

  /** Handle restore action for a row */
  function handleRestoreRow(row: TRow) {
    // Open confirmation dialog instead of restoring directly
    dialogs.setRowToRestore(row);
    dialogs.openRestoreDialog();
    closeRowDropdown();
  }

  /** Confirm delete action after dialog confirmation */
  async function confirmDeleteRow() {
    if (!dialogs.state.rowToDelete) return;
    await rowActionsComposable.confirmDeleteRow(dialogs.state.rowToDelete as TRow);
    dialogs.closeDeleteDialog();
    dialogs.setRowToDelete(null);
  }

  /** Confirm restore action after dialog confirmation */
  async function confirmRestoreRow() {
    if (!dialogs.state.rowToRestore) return;
    await rowActionsComposable.confirmRestoreRow(dialogs.state.rowToRestore as TRow);
    dialogs.closeRestoreDialog();
    dialogs.setRowToRestore(null);
  }


  // ============================
  // Bulk Action Handlers
  // ============================

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


  // ============================
  // Export Handlers
  // ============================

  /** Confirm export action after dialog confirmation */
  async function confirmExportRow() {
    if (!exportComposable.state.fileType) return;
    await exportComposable.handleExport(exportComposable.state.fileType);
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
    dialogs.setDuplicateScope('selected');
    dialogs.openDuplicateDialog();
  }

  function handleDuplicateRow(row: TRow) {
    if (isRowDeleted(row)) {
      console.log('Cannot duplicate deleted row:', rowKey(row));
      return;
    }
    dialogs.setSingleRowToDuplicate(row);
    dialogs.setDuplicateScope('single');
    dialogs.openDuplicateDialog();
    closeRowDropdown();
  }

  async function confirmDuplicate() {
    if (dialogs.state.duplicateScope === 'single' && dialogs.state.singleRowToDuplicate) {
      await rowActionsComposable.confirmDuplicateRow(dialogs.state.singleRowToDuplicate as TRow);
    } else if (dialogs.state.duplicateScope === 'selected') {
      await bulkActions.confirmBulkDuplicate();
    }
    dialogs.closeDuplicateDialog();
    dialogs.setSingleRowToDuplicate(null);
  }

  function cancelDuplicate() {
    dialogs.closeDuplicateDialog();
    dialogs.setSingleRowToDuplicate(null);
  }

  function handleBulkExport() {
    exportComposable.openExportDialog();
  }

  function handleHtmlExport() {
    exportComposable.openHtmlExportConfirmDialog();
  }

  function cancelHtmlExport() {
    exportComposable.closeHtmlExportConfirmDialog();
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


  // ============================
  // Toolbar Handlers
  // ============================

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

  const clientSelection = useClientSelection<TRow>({
    selectedKeys: () => selectedKeys,
    rows: () => rows ?? [],
    rowKey,
    pageSize: () => pageSize,
    rowsLoading: () => rowsLoading,
    rowSelectionEnabled: () => rowSelectionEnabled,
    showSelectedOnly: () => showSelectedOnly,
    clientSelectedPage: () => clientSelectedPage,
    setShowSelectedOnly: (v: boolean) => { showSelectedOnly = v; },
    setClientSelectedPage: (p: number) => { clientSelectedPage = p; },
  });

  const orderedSelectedRows = $derived(clientSelection.orderedSelectedRows);
  const hasDeletedSelected = $derived(clientSelection.hasDeletedSelected);
  const allSelectedDeleted = $derived(clientSelection.allSelectedDeleted);
  const clientSelectedTotalPages = $derived(clientSelection.clientSelectedTotalPages);
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

  const viewRows = $derived(clientSelection.viewRows);
  const pageKeys = $derived(viewRows.map((r) => rowKey(r)));
  const selectedOnPageCount = $derived(pageKeys.filter((k) => selectedKeys.includes(k)).length);
  const allOnPageSelected = $derived(pageKeys.length > 0 && selectedOnPageCount === pageKeys.length);
  /** Header checkbox tri-state: partial selection on current page. */
  const headerIndeterminate = $derived(selectedOnPageCount > 0 && !allOnPageSelected);
  const actionsEnabled = $derived(!!rowActionsEnabled || !!rowActions);
  const extraCols = $derived((rowSelectionEnabled ? 1 : 0) + (actionsEnabled ? 1 : 0));

  /** `<table>` from `Table.Root`; used to find the scroll host and preserve horizontal scroll across row reloads. */
  let tableRef = $state<HTMLTableElement | null>(null);

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

  const previewPanel = usePreviewPanel<TRow>({
    viewRows: () => viewRows,
    rowKey: rowKey,
    onFieldChange: (row, field, value) => {
      // Handle field change if needed
    },
    onRefresh: onRefresh
  });

  const dialogs = useDialogs<TRow>();

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
    t: $t,
    dialogs: {
      openBulkDeleteDialog: dialogs.openBulkDeleteDialog,
      closeBulkDeleteDialog: dialogs.closeBulkDeleteDialog,
      openBulkRestoreDialog: dialogs.openBulkRestoreDialog,
      closeBulkRestoreDialog: dialogs.closeBulkRestoreDialog,
      openDuplicateDialog: dialogs.openDuplicateDialog,
      closeDuplicateDialog: dialogs.closeDuplicateDialog
    },
    setDuplicateScope: dialogs.setDuplicateScope
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
    t: $t,
    dialogs: {
      openDeleteDialog: dialogs.openDeleteDialog,
      closeDeleteDialog: dialogs.closeDeleteDialog,
      openRestoreDialog: dialogs.openRestoreDialog,
      closeRestoreDialog: dialogs.closeRestoreDialog,
      openDuplicateDialog: dialogs.openDuplicateDialog,
      closeDuplicateDialog: dialogs.closeDuplicateDialog,
      setDuplicateScope: dialogs.setDuplicateScope,
      setRowToDelete: dialogs.setRowToDelete,
      setRowToRestore: dialogs.setRowToRestore,
      setSingleRowToDuplicate: dialogs.setSingleRowToDuplicate
    }
  });

  // Selection handlers
  const selectionHandlers = createSelectionHandlers(
    () => selectedKeys,
    onSelectedKeysChange,
    () => pageKeys,
    () => allOnPageSelected
  );
  const { toggleRowSelect, toggleAllOnPage } = selectionHandlers;

  const keyboardNav = useKeyboardNavigation<TRow>({
    viewRows: () => viewRows,
    rowSelectionEnabled: () => rowSelectionEnabled,
    selectedKeys: () => selectedKeys,
    onSelectedKeysChange,
    rowKey,
    previewPanelOpen: () => previewPanel.state.previewPanelOpen,
    previewRowIndex: () => previewPanel.state.previewRowIndex,
    focusedRowIndex: () => previewPanel.state.focusedRowIndex,
    setFocusedRowIndex: (i: number) => previewPanel.setFocusedRowIndex(i),
    openPreview: (row: TRow) => previewPanel.openPreview(row),
    navigatePreview: (direction: 'next' | 'prev') => previewPanel.navigatePreview(direction),
    dropdownMenuRow: () => dropdownMenuRow,
    previewDropdownOpen: () => previewDropdownOpen,
    closeRowDropdown,
    page: () => page,
    pageSize: () => pageSize,
    totalPages: () => totalPages,
    onPageChange,
    openRowDropdown,
    footerUsesClientPaging: () => footerUsesClientPaging,
    clientSelectedPage: () => clientSelectedPage,
    setClientSelectedPage: (p: number) => { clientSelectedPage = p; },
    toggleRowSelect,
    tableRef: () => tableRef
  });

  // Sorting handlers
  const sortingHandlers = createSortingHandlers(
    columnOrder,
    defaultSort,
    defaultSortDir,
    onResetColumnVisibility,
    onSortChange,
    rowsLoading,
    () => sortKey,
    () => sortDir,
    dataColumns,
    auditingColumnsGroup,
    nonAuditingColumns,
    onFilterValuesChange,
    onAdvancedFiltersChange,
    onResetFilters
  );
  const { resetColumnsAndSorting, resetFilters, reorderGroup, handleSortClick } = sortingHandlers;

  // Click handlers
  const clickHandlers = createClickHandlers(
    rowActionsComposable,
    previewPanel,
    rowSelectionEnabled,
    rowsLoading,
    error,
    rowRangeSelection,
    toggleRowSelect
  );
  const { handleEditRow, handlePreviewRow, onEntityRowClick, onEntityCardClick } = clickHandlers;

  const loadingText = $derived(loadingMessage ?? $t('common.loading'));
  const emptyText = $derived(noRecordsMessage ?? $t('entities.list.noRecords'));

  const selectionCount = $derived(selectedKeys.length);
  const selectionPastParticipleKey = $derived(
    selectionCount === 1 ? 'entities.list.selectedSingular' : 'entities.list.selectedPlural'
  );
</script>

<svelte:window onkeydown={keyboardNav.handleGlobalKeyDown} />




<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <EntityListTableHeader
    search={search}
    onSearchInput={onSearchInput}
    searchPlaceholderKey={searchPlaceholderKey}
    searchInKeys={searchInKeys}
    searchableColumns={searchableColumns}
    onSearchInKeysChange={onSearchInKeysChange}
    toggleSearchKey={toggleSearchKey}
    viewMode={viewMode}
    onViewModeChange={viewModeComposable.setViewMode}
    deletionFilterMode={deletionFilterMode}
    onDeletionFilterModeChange={deletionFilterComposable.setDeletionFilterMode}
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
    stickyColumnsGroup={stickyColumnsGroup}
    nonAuditingColumns={nonAuditingColumns}
    auditingColumnsGroup={auditingColumnsGroup}
    visibleKeys={visibleKeys}
    toggleColumnKey={toggleColumnKey}
    resetColumnsAndSorting={resetColumnsAndSorting}
    checkboxVisualOnlyClass={checkboxVisualOnlyClass}
    onCreateAction={onCreateAction}
    toolbarMode={toolbarModeState.state.toolbarMode}
    hasAppliedFilters={toolbarModeState.hasAppliedFilters}
    filterValues={filterValues}
    advancedFilters={advancedFilters}
    selectedKeys={selectedKeys}
    hasDeletedSelected={hasDeletedSelected}
    allSelectedDeleted={allSelectedDeleted}
    onResetFilters={resetFilters}
    onFilterValuesChange={onFilterValuesChange}
    onAdvancedFiltersChange={onAdvancedFiltersChange}
    onToggleToolbarMode={toggleToolbarMode}
    onBulkExport={handleBulkExport}
    onHtmlExport={handleHtmlExport}
    onBulkDuplicate={() => bulkActions.handleBulkDuplicate()}
    onBulkDelete={() => bulkActions.handleBulkDelete()}
    onBulkRestore={() => bulkActions.handleBulkRestore()}
  />

  <EntityListTableContent
    metaLoading={metaLoading}
    viewMode={viewMode}
    metaLoadingView={metaLoadingView}
    loadingText={loadingText}
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
    error={error}
    errorView={errorView}
    rowsLoading={rowsLoading}
    rowsLoadingView={rowsLoadingView}
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
    rowActionsComposable={rowActionsComposable}
    onPreviewRow={handlePreviewRow}
    tableRef={tableRef}
    tableDensityClass={tableDensityClass}
    stickyColumnsState={stickyColumnsState}
    rowChromeH={rowChromeH}
    checkboxInteractiveClass={checkboxInteractiveClass}
    visibleKeys={visibleKeys}
    handleSortClick={handleSortClick}
    rowRangeSelection={rowRangeSelection}
    uid={uid}
    pageSize={pageSize}
    page={page}
    onPageChange={onPageChange}
    entity={entity}
    columns={columns}
    stickyColumns={stickyColumns}
    dataColumns={dataColumns}
    auditingColumns={auditingColumns}
    rowActionsEnabled={rowActionsEnabled}
    footerRangeTotal={footerRangeTotal}
    footerPage={footerPage}
    previewDropdownOpen={previewDropdownOpen}
    navigatePreview={navigatePreview}
    extraCols={extraCols}
  />

  <EntityListTableFooter
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

  <EntityListTableDialogs
    {dialogs}
    {rowActionsComposable}
    {bulkActions}
    {exportComposable}
    selectedKeys={selectedKeys}
    total={total}
    entity={entity}
    confirmDeleteRow={confirmDeleteRow}
    confirmRestoreRow={confirmRestoreRow}
    confirmBulkDelete={confirmBulkDelete}
    cancelBulkDelete={cancelBulkDelete}
    confirmBulkRestore={confirmBulkRestore}
    cancelBulkRestore={cancelBulkRestore}
    confirmExportRow={confirmExportRow}
    cancelExportRow={cancelExportRow}
    confirmHtmlExport={confirmHtmlExport}
    cancelHtmlExport={cancelHtmlExport}
    confirmDuplicate={confirmDuplicate}
    cancelDuplicate={cancelDuplicate}
    generatePdfPreview={generatePdfPreview}
    prepareEmailHtml={prepareEmailHtml}
    copyHtmlToClipboard={copyHtmlToClipboard}
    copyEmailHtmlToClipboard={copyEmailHtmlToClipboard}
    closeHtmlPreview={closeHtmlPreview}
  />

<style src="./EntityListTable.css"></style>

