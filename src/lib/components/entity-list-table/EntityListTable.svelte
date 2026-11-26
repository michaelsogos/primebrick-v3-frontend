<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { tick } from 'svelte';
  import { t } from '$lib/i18n';
  import { checkboxInteractiveClass } from '@primebrick/ui';
  import EntityListTableHeader from './components/EntityListTableHeader.svelte';
  import EntityListTableDialogs from './components/EntityListTableDialogs.svelte';
  import EntityListTableContent from './components/EntityListTableContent.svelte';
  import TableFooter from './components/TableFooter.svelte';

  import {
    useStickyColumns,
    useScrollPreservation,
    useRowRangeSelection,
    useToolbarMode,
    useClientSelection,
    useKeyboardNavigation,
    useSheetPanels
  } from './composables';
  import { useColumnOrder, pinAuditTail } from './composables/useColumnOrder.svelte';
  import { useViewMode } from './composables';
  import {
    isRowDeleted as isRowDeletedUtil,
    getRowKey
  } from './utils';
  import { useExport } from './composables/useExport.svelte.js';
  import { useBulkActions } from './composables/useBulkActions.svelte.js';
  import { hasRequiredPermission, isEntityOpAllowed } from '$lib/permissions.svelte';
  import { useRowActions } from './composables/useRowActions.svelte.js';
  import { useDialogs } from './composables/useDialogs.svelte.js';
  import { useDeletionFilter } from './composables/useDeletionFilter.svelte';
  import { createSelectionHandlers } from './handlers/selection';
  import { createSortingHandlers } from './handlers/sorting';
  import { createClickHandlers } from './handlers/click-handlers';
  import type { MetaColumn } from '$lib/entity-list/types';
  import { isColumnFilterable, isColumnSortable, searchableTextColumns } from '$lib/entity-list/types';
  import { setAuditColumnsContext, setActiveRolesContext, setEntitiesNsContext, setMetaUidContext, setTableEntityContext } from './context';
  import { useActiveRoles } from '$lib/composables/useActiveRoles.svelte';
  import { setEntitiesNsContext as uiSetEntitiesNsContext } from '@primebrick/ui';
  import { claimDocsContext } from '$lib/shell/docs/docs-context.svelte';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { loadModuleTranslations } from '$lib/i18n/use-module-translations.svelte';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { get } from 'svelte/store';

  import { LoadingBar } from '$lib/components/ui/loading-bar';

  import type { EntityListTableProps, ActionChrome } from './types';

  let {
    uid,
    entity = 'customer',
    service,
    translationKey,
    entities_ns,
    columns,
    columnOrderStorageKey,
    defaultSort,
    defaultView,
    pageSizeOptions: pageSizeOptionsProp,
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
    entityCustomActions,
    entityBulkCustomActions,
    entityActions,
    customActionHandlers,
    onCreateAction,
    create_cta,
    onEditAction,
    onRowDblClick: onRowDblClickProp,
    filterValues = {},
    onFilterValuesChange,
    onResetFilters,
    advancedFilters = [],
    onAdvancedFiltersChange,
    deletionFilterMode: deletionFilterModeProp = $bindable('non_deleted'),
    onDeletionFilterModeChange,
    filterPresets = [],
    presetSelections = {},
    onPresetChange,
    sparklineData = {},
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

  // Set context for child components — must be reactive because the audited
  // columns arrive after meta is loaded (initial value is [] before meta fetch)
  $effect(() => {
    setAuditColumnsContext(auditingColumnsGroup);
  });

  // Entity-label i18n namespace for the whole subtree (dialogs, panels,
  // version history) — `meta.entities_ns` served by the owning module;
  // `system` for BE/core-owned entities. Both contexts are set: the local
  // one for FE-resident dialogs and the @primebrick/ui one for ui-owned
  // entity-list components (DeleteDialog / EntityConfirmQuestion).
  $effect(() => {
    setEntitiesNsContext(entities_ns ?? 'system');
    uiSetEntitiesNsContext(entities_ns ?? 'system');
  });

  // The table's identity column — `reverse_ref` cells filter child lists
  // by it.
  $effect(() => {
    setMetaUidContext(uid);
  });

  // Table-entity context — the `version` cell's version-history badge
  // opens the stacked sheet with the same payload row actions build.
  $effect(() => {
    setTableEntityContext({
      entity,
      translationKey: effectiveTranslationKey,
      uid,
      columns: allColumns,
    });
  });

  // Active-roles lookup — ONE lazy fetch per list, gated on a
  // `options_source:"system.roles"` column actually being served
  // (`roles` on user_profile today). Cells resolve `idp_role` →
  // role record through the context — no per-cell fetches.
  const activeRoles = useActiveRoles({
    enabled: () => columns.some((c) => c.options_source === 'system.roles'),
  });
  $effect(() => {
    setActiveRolesContext(() => activeRoles.rolesByCode);
  });

  // Docs context: every entity list claims it so the docs panel resolves the
  // entity's user-guide doc. Cleanup releases it on unmount / entity change.
  $effect(() => claimDocsContext({ entity, mode: 'list' }));

  // Reload-strip visibility — two guards around the raw flag:
  //   on : `rowsLoading` can flip inside a single paint on fast localhost
  //        responses (filter apply ≈15ms) → min ON-duration or the strip
  //        is imperceptible.
  //   off: `loading=false` lands in the same flush that commits the new
  //        rows, but painting them (sparkline/datetime/badge cells) can
  //        take real time — the strip holds until the new tbody is
  //        actually painted (tick + a full frame), never before.
  const RELOAD_STRIP_MIN_MS = 250;
  let reloadStripVisible = $state(false);
  let reloadStripOnAt = 0;
  $effect(() => {
    if (rowsLoading) {
      if (!reloadStripVisible) {
        reloadStripVisible = true;
        reloadStripOnAt = Date.now();
      }
      return;
    }
    if (!reloadStripVisible) return;
    const onAt = reloadStripOnAt;
    let cancelled = false;
    void (async () => {
      await tick();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (cancelled) return;
      const wait = RELOAD_STRIP_MIN_MS - (Date.now() - onAt);
      if (wait <= 0) reloadStripVisible = false;
      else
        setTimeout(() => {
          if (!cancelled) reloadStripVisible = false;
        }, wait);
    })();
    return () => {
      cancelled = true;
    };
  });

  // Census-module dictionaries — `nats_subject`/ref cells resolve subject
  // `label_key`s (`crm.events.*` lives in the `crm` dict, not the current
  // route's). The SAME loading the create-form combobox does
  // (EntityFormPage:185) — single source of truth, zero drift.
  const censusModuleIds = $derived(
    new Set(
      shellNav.modules
        // is_reserved platform rows (api gateway) carry callables/emits for
        // vocabulary census but own no dict — their label_keys are app.*/system.*
        // core keys already served by the core packs.
        .filter(
          (m) =>
            !m.is_reserved &&
            ((m.callables?.callables?.length ?? 0) > 0 || (m.events?.emits?.length ?? 0) > 0),
        )
        .map((m) => m.id),
    ),
  );
  $effect(() => {
    const lang = get(uiLang);
    for (const code of censusModuleIds) void loadModuleTranslations(code, lang, { bestEffort: true });
  });

  // Translation key for dynamic i18n keys (dialogs, version history).
  // Falls back to `entity` when not explicitly provided.
  const effectiveTranslationKey = $derived(translationKey ?? entity ?? 'customer');

  // Utility functions moved to utils.ts
  const rowKey = (row: TRow): string => getRowKey(row, uid);

  // Column order management using composable
  const columnOrder = useColumnOrder(() => columnOrderStorageKey);
  const orderState = columnOrder.state;

  // Columns arrive as the single root-level `columns` array (pre-ordered via
  // `orderedColumns`); the sticky/audited groups are derived from column flags.
  const allColumns = $derived(columns);
  const datetimeIanaToggleColumns = $derived(allColumns.filter((c) => !!c.datetime_iana_toggle));
  const sortableColumns = $derived(allColumns.filter((c) => isColumnSortable(c)));
  const searchableColumns = $derived(searchableTextColumns(allColumns));
  // Fields governed by a declared filter preset (their `where[].field`) are
  // owned by the toolbar preset control — exposing them again in the filters
  // panel would create a second source of truth for the same predicate.
  const presetOwnedFields = $derived(
    new Set(
      filterPresets.flatMap((p) => p.options.flatMap((o) => (o.where ?? []).map((w) => w.field)))
    )
  );
  const filterableColumns = $derived(
    allColumns.filter((c) => isColumnFilterable(c) && !presetOwnedFields.has(c.key))
  );
  const stickyColumnsGroup = $derived(
    columnOrder.applyKeyOrder(allColumns.filter((c) => c.sticky === true), orderState.sticky)
  );

  const auditingColumnsGroup = $derived(
    pinAuditTail(
      columnOrder.applyKeyOrder(allColumns.filter((c) => c.audited === true), orderState.auditing)
    )
  );
  const hasSoftDelete = $derived(
    auditingColumnsGroup.some((c) => c.key === 'deleted_at' || c.key === 'deleted_by')
  );
  const nonAuditingColumns = $derived(
    columnOrder.applyKeyOrder(
      allColumns.filter((c) => !c.audited && !c.sticky),
      orderState.data
    )
  );
  // Rendered columns: sticky → normal → audited groups (manual reorder via
  // `orderState` applied), filtered by current visibility.
  const shownColumns = $derived(
    [...stickyColumnsGroup, ...nonAuditingColumns, ...auditingColumnsGroup].filter((c) =>
      visibleKeys.includes(c.key)
    )
  );

  // View mode management using composable
  const viewModeStorageKey = $derived(
    columnOrderStorageKey ? `${columnOrderStorageKey}:viewMode` : `pb.entityList:${uid}:viewMode`
  );
  const viewModeComposable = useViewMode({
    initialMode: () => defaultView,
    storageKey: () => viewModeStorageKey
  });
  const viewMode = $derived(viewModeComposable.state.viewMode);

  // Deletion filter management using composable
  const deletionFilterComposable = useDeletionFilter(
    () => uid,
    () => columnOrderStorageKey,
    () => deletionFilterModeProp ?? 'non_deleted',
    () => onDeletionFilterModeChange
  );
  const deletionFilterMode = $derived(deletionFilterComposable.state.deletionFilterMode);

  // When the entity has no soft-delete columns, force the deletion filter to
  // 'non_deleted' so the BE never receives a deleted_records param and the
  // toggle button group is hidden (see EntityListToolbar). The guard must wait
  // for columns to arrive: firing while meta is still loading clobbers the
  // composable's restored sessionStorage selection.
  $effect(() => {
    if (allColumns.length > 0 && !hasSoftDelete && deletionFilterMode !== 'non_deleted') {
      deletionFilterComposable.setDeletionFilterMode('non_deleted');
    }
  });

  // Sheet panel management composable
  const sheetPanels = useSheetPanels({
    columnOrder,
    columns: () => columns,
    visibleKeys: () => visibleKeys,
    searchInKeys: () => searchInKeys,
    onSearchInKeysChange: () => onSearchInKeysChange,
    onVisibleKeysChange: () => onVisibleKeysChange,
    onResetColumnVisibility: () => onResetColumnVisibility,
    entity: () => entity,
    service: () => service,
    filterableColumns: () => filterableColumns,
    searchableColumns: () => searchableColumns,
    nonAuditingColumns: () => nonAuditingColumns,
    auditingColumnsGroup: () => auditingColumnsGroup,
    stickyColumnsGroup: () => stickyColumnsGroup,
    filterValues: () => filterValues ?? null,
    onFilterValuesChange: () => onFilterValuesChange,
    onResetFilters: () => onResetFilters,
    advancedFilters: () => advancedFilters ?? null,
    onAdvancedFiltersChange: () => onAdvancedFiltersChange,
    datetimeIanaToggleColumns: () => datetimeIanaToggleColumns,
    datetimeIanaModeByKey: () => datetimeIanaModeByKey,
    toggleDatetimeIana: () => toggleDatetimeIana,
    datetimeIanaDisabled: () => rowsLoading
  });
  const toggleSearchKey = sheetPanels.toggleSearchKey;
  const toggleColumnKey = sheetPanels.toggleColumnKey;

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

  /** Open dropdown menu for a specific row */
  function openRowDropdown(row: TRow) {
    dropdownMenuRow = row;
  }

  /** Close dropdown menu */
  function closeRowDropdown() {
    dropdownMenuRow = null;
  }

  const defaultSortDir = $derived(defaultSort?.dir ?? 'asc');
  const effectiveSortKey = $derived(sortKey ?? defaultSort?.key ?? null);
  const pageSizeOptions = $derived(pageSizeOptionsProp ?? [10, 25, 50, 100]);
  const totalPages = $derived(Math.max(1, Math.ceil(Number(total) / Number(pageSize))));


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
  // `page` arrives from extJsonParse as native bigint — normalize to number
  // once here so every downstream consumer (footer math, sheets)
  // stays in plain-number land.
  const footerPage = $derived(footerUsesClientPaging ? clientSelectedPage : Number(page));
  const footerTotalPages = $derived(footerUsesClientPaging ? clientSelectedTotalPages : totalPages);
  const footerRangeTotal = $derived(footerUsesClientPaging ? orderedSelectedRows.length : Number(total));
  const footerRangeStart = $derived(
    footerRangeTotal === 0 ? 0 : (Number(footerPage) - 1) * Number(pageSize) + 1
  );
  const footerRangeEnd = $derived(
    footerRangeTotal === 0 ? 0 : Math.min(Number(footerPage) * Number(pageSize), footerRangeTotal)
  );

  const viewRows = $derived(clientSelection.viewRows);
  const pageKeys = $derived(viewRows.map((r) => rowKey(r)));
  const selectedOnPageCount = $derived(pageKeys.filter((k) => selectedKeys.includes(k)).length);
  const allOnPageSelected = $derived(pageKeys.length > 0 && selectedOnPageCount === pageKeys.length);
  /** Header checkbox tri-state: partial selection on current page. */
  const headerIndeterminate = $derived(selectedOnPageCount > 0 && !allOnPageSelected);


  /** `<table>` from `Table.Root`; used to find the scroll host and preserve horizontal scroll across row reloads. */
  let tableRef = $state<HTMLTableElement | null>(null);

  // Sticky offsets (measured widths so we can keep columns auto-sized).
  const stickyColumnsState = useStickyColumns({
    rowSelectionEnabled: () => rowSelectionEnabled,
    stickyColumnsGroup: () => stickyColumnsGroup,
    visibleKeys: () => visibleKeys
  });

  // Scroll preservation — sessionStorage-keyed like viewMode/deletionFilter
  // so the horizontal position survives a full page reload too.
  useScrollPreservation({
    tableRef: () => tableRef,
    rowsLoading: () => rowsLoading,
    storageKey: () =>
      columnOrderStorageKey ? `${columnOrderStorageKey}:scrollLeft` : `pb.entityList:${uid}:scrollLeft`
  });

  // Row range selection
  const rowRangeSelection = useRowRangeSelection({
    rowSelectionEnabled: () => rowSelectionEnabled,
    selectedKeys: () => selectedKeys,
    onSelectedKeysChange: () => onSelectedKeysChange,
    viewRows: () => viewRows,
    pageKeys: () => pageKeys,
    rowKey,
    rowsLoading: () => rowsLoading,
    error: () => error,
    page: () => clientSelectedPage,
    pageSize: () => pageSize
  });

  // Toolbar mode
  const toolbarModeState = useToolbarMode({
    selectedKeys: () => selectedKeys,
    filterValues: () => filterValues,
    advancedFilters: () => advancedFilters
  });

  const exportComposable = useExport({
    entity: () => entity,
    service: () => service,
    selectedKeys: () => selectedKeys,
    uid: () => uid,
    actions: () => entityActions,
    columns: () => columns,
    search: () => search,
    searchInKeys: () => searchInKeys,
    sortKey: () => sortKey,
    sortDir: () => sortDir,
    filterValues: () => filterValues,
    advancedFilters: () => advancedFilters,
    deletionFilterMode: () => deletionFilterMode,
  });

  const dialogs = useDialogs<TRow>();

  const bulkActions = useBulkActions({
    entity: () => entity,
    service: () => service,
    selectedKeys: () => selectedKeys,
    actions: () => entityActions,
    uid: () => uid,
    columns: () => columns,
    search: () => search,
    searchInKeys: () => searchInKeys,
    filterValues: () => filterValues,
    advancedFilters: () => advancedFilters,
    entities_ns: () => entities_ns,
    total: () => total,
    rowByKey: (key) => (rows as TRow[] | undefined)?.find((r) => rowKey(r) === key),
    onSelectionChange: (keys) => {
      selectedKeys = keys;
    },
    onRefresh: () => onRefresh,
    onToolbarModeChange: () => {
      toolbarModeState.setMode('filters');
    },
    t: $t,
    dialogs: {
      openDuplicateDialog: dialogs.openDuplicateDialog,
      closeDuplicateDialog: dialogs.closeDuplicateDialog
    },
    setDuplicateScope: dialogs.setDuplicateScope
  });

  // ── Capability + permission gating (meta.actions contract) ─────────────

  /**
   * True when the op exists in `meta.actions`, is `enabled`, and the current
   * user satisfies its declared requirement. FAIL-CLOSED: when `entityActions`
   * is absent (meta without `actions` — contract violation) every CTA is
   * treated as not allowed.
   */
  function opAllowed(op: string): boolean {
    if (!entityActions) {
      // Only warn when meta has actually loaded (columns are meta-derived —
      // columns.length > 0 means meta arrived but `actions` is still absent).
      // During the meta-loading window entityActions is legitimately undefined.
      if (import.meta.env.DEV && columns.length > 0) {
        console.warn(
          `[EntityListTable] no entityActions provided for entity "${entity}" — ` +
          `meta.actions missing (contract violation or stale meta cache); all CTAs gated off`
        );
      }
      return false;
    }
    return isEntityOpAllowed(entityActions, op);
  }

  /**
   * Row/bulk CTA visibility derived solely from the `meta.actions` capability
   * contract — an op is visible iff it is enabled AND the user satisfies its
   * declared requirement. Custom CTAs come from `meta.table.row_custom_actions`.
   */
  /** CTA chrome from `meta.actions[op]` — label/icon/color overrides
   *  (e.g. soft-delete-as-disable → "Deactivate"). `undefined` when the op
   *  carries no override → standard chrome applies. */
  function opChrome(op: string): ActionChrome | undefined {
    const action = entityActions?.find((a) => a.op === op);
    if (!action?.label_key && !action?.icon && !action?.color && !action?.variant && !action?.confirm_key && !action?.busy_key) return undefined;
    return { label_key: action.label_key, icon: action.icon, color: action.color, variant: action.variant, confirm_key: action.confirm_key, busy_key: action.busy_key };
  }

  const effectiveRowActions = $derived(({
    edit: opAllowed('update.single'),
    duplicate: opAllowed('duplicate.bulk'),
    delete: opAllowed('delete.single') || opAllowed('purge.single'),
    restore: opAllowed('restore.single'),
    versionHistory: opAllowed('read.audit'),
    custom_actions: entityCustomActions?.filter((a) => hasRequiredPermission(a.required_permission)),
    edit_chrome: opChrome('update.single'),
    delete_chrome: opChrome('delete.single'),
    restore_chrome: opChrome('restore.single'),
    duplicate_chrome: opChrome('duplicate.bulk')
  }));

  /** Bulk-bar custom CTAs — declared permission gate (endpoint dispatch
   *  rides `meta.actions` via `useBulkActions.handleBulkCustomAction`). */
  const effectiveBulkCustomActions = $derived(
    entityBulkCustomActions?.filter((a) => hasRequiredPermission(a.required_permission)) ?? []
  );

  /** True when at least one standard or custom row action is allowed —
   *  `restore` counts because a deleted row may show only that entry. */
  const hasEntityRowActions = $derived(
    effectiveRowActions.edit === true ||
      effectiveRowActions.duplicate === true ||
      effectiveRowActions.versionHistory === true ||
      effectiveRowActions.delete === true ||
      effectiveRowActions.restore === true ||
      (effectiveRowActions.custom_actions?.length ?? 0) > 0
  );

  // Zero allowed row ops → no ⋮ column at all (an empty dropdown reads as
  // broken). `rowActions` snippet keeps the column regardless (page owns it).
  const actionsEnabled = $derived(!!rowActions || (rowActionsEnabled && hasEntityRowActions));
  const extraCols = $derived((rowSelectionEnabled ? 1 : 0) + (actionsEnabled ? 1 : 0));

  /** Create CTA — provided handler only effective when `create.single` is allowed. */
  const effectiveOnCreateAction = $derived(
    onCreateAction && opAllowed('create.single') ? onCreateAction : undefined
  );

  /** Bulk toolbar CTA capabilities — each maps to its canonical op. */
  const bulkCapabilities = $derived({
    export: opAllowed('export'),
    htmlExport: opAllowed('export'),
    duplicate: opAllowed('duplicate.bulk'),
    delete: opAllowed('delete.bulk'),
    restore: opAllowed('restore.bulk'),
    edit: opAllowed('update.bulk')
  });

  /** Bulk-CTA chrome overrides (`delete.bulk`/`restore.bulk`) — same
   *  contract as the row chrome: icon+label+color travel together. */
  const bulkDeleteChrome = $derived(opChrome('delete.bulk'));
  const bulkRestoreChrome = $derived(opChrome('restore.bulk'));
  const bulkDuplicateChrome = $derived(opChrome('duplicate.bulk'));
  const bulkEditChrome = $derived(opChrome('update.bulk'));
  const bulkExportChrome = $derived(opChrome('export'));

  const rowActionsComposable = useRowActions<TRow>({
    entity: () => entity,
    service: () => service,
    translationKey: () => effectiveTranslationKey,
    entities_ns: () => entities_ns,
    uid: () => uid,
    columns: () => columns,
    actions: () => entityActions,
    onEditAction: () => onEditAction,
    onRefresh: () => onRefresh,
    isRowDeleted: isRowDeleted,
    // Hard-delete-only entities (meta.actions: purge.single enabled,
    // delete.single disabled) target `DELETE /:uuid/purge` automatically.
    usePurgeDelete: () => !opAllowed('delete.single') && opAllowed('purge.single'),
    rowKey: rowKey,
    closeRowDropdown: closeRowDropdown,
    t: $t,
    customActionHandlers: () => customActionHandlers,
    dialogs: {
      openDuplicateDialog: dialogs.openDuplicateDialog,
      closeDuplicateDialog: dialogs.closeDuplicateDialog,
      setDuplicateScope: dialogs.setDuplicateScope,
      setSingleRowToDuplicate: dialogs.setSingleRowToDuplicate
    }
  });

  // Selection handlers
  const selectionHandlers = createSelectionHandlers(
    () => selectedKeys,
    () => onSelectedKeysChange,
    () => pageKeys,
    () => allOnPageSelected
  );
  const { toggleRowSelect, toggleAllOnPage } = selectionHandlers;

  const keyboardNav = useKeyboardNavigation<TRow>({
    viewRows: () => viewRows,
    rowSelectionEnabled: () => rowSelectionEnabled,
    selectedKeys: () => selectedKeys,
    onSelectedKeysChange: () => onSelectedKeysChange,
    rowKey,
    dropdownMenuRow: () => dropdownMenuRow,
    closeRowDropdown,
    currentPage: () => footerPage,
    pageCount: () => footerTotalPages,
    goToPage: (p: number) => {
      if (footerUsesClientPaging) clientSelectedPage = p;
      else onPageChange(p);
    },
    createAction: () => effectiveOnCreateAction,
    openRowDropdown,
    toggleRowSelect,
    tableRef: () => tableRef
  });

  // Sorting handlers
  const sortingHandlers = createSortingHandlers(
    columnOrder,
    () => defaultSort,
    () => defaultSortDir,
    () => onResetColumnVisibility,
    () => onSortChange,
    () => rowsLoading,
    () => sortKey,
    () => sortDir,
    () => nonAuditingColumns,
    () => auditingColumnsGroup,
    () => nonAuditingColumns,
    () => onFilterValuesChange,
    () => onAdvancedFiltersChange,
    () => onResetFilters
  );
  const { resetColumnsAndSorting, resetFilters, handleSortClick } = sortingHandlers;

  // Record detail route — `kind:"detail"` census decl owns the `[param]`
  // template (same resolution `EntityTablePage` uses for the row edit
  // target); `window.open` in click-handlers turns a row dblclick into a
  // focused new tab on it.
  const detailRouteTemplate = $derived(
    shellNav.moduleNav?.routes?.find((r) => r.kind === 'detail' && r.entity === entity)?.route
  );
  const rowDetailHref = (row: TRow): string | null => {
    if (!detailRouteTemplate) return null;
    const v = (row as Record<string, unknown>)[uid];
    return v == null ? null : detailRouteTemplate.replace(/\[[a-zA-Z0-9_]+\]/, String(v));
  };

  // Click handlers
  const clickHandlers = createClickHandlers(
    rowActionsComposable,
    rowDetailHref,
    () => rowSelectionEnabled,
    () => rowsLoading,
    () => error,
    rowRangeSelection,
    toggleRowSelect
  );
  const { handleEditRow, handleRowDblClick, onEntityCardClick } = clickHandlers;

  // Columns selector — the same `entity.columns` sheet the toolbar CTA
  // opens; the header-row actions cell gets its own Columns3 button.
  function openColumnsSheet() {
    openSheet('entity.columns', {
      stickyColumns: stickyColumnsGroup,
      nonAuditingColumns,
      auditingColumns: auditingColumnsGroup,
      visibleKeys,
      toggleColumnKey,
      onResetColumnVisibility: resetColumnsAndSorting
    });
  }

  const loadingText = $derived(loadingMessage ?? $t('app.common.loading'));
  const emptyText = $derived(noRecordsMessage ?? $t('system.entities.list.no_records'));

  const selectionCount = $derived(selectedKeys.length);
  const selectionPastParticipleKey = $derived(
    selectionCount === 1 ? 'system.entities.list.selected_singular' : 'system.entities.list.selected_plural'
  );

  /** Card/card_list lower-bar zones (select-all | sort builder | IANA CTA) —
   *  table view keeps its own thead chrome and passes none. */
  const isSpecialView = $derived(viewMode !== 'table');
  const cardSelectAllZone = $derived(
    isSpecialView && rowSelectionEnabled
      ? {
          checked: allOnPageSelected,
          indeterminate: headerIndeterminate,
          onToggle: toggleAllOnPage,
          test_id: 'entity-list-card-select-all'
        }
      : undefined
  );
  const cardSortZone = $derived(
    isSpecialView && sortableColumns.length > 0
      ? {
          allColumns,
          sortableColumns,
          sortKey: effectiveSortKey,
          sortDir,
          onSortChange,
          test_id: 'entity-list-card-sort'
        }
      : undefined
  );
  const cardIanaZone = $derived(
    isSpecialView && datetimeIanaToggleColumns.length > 0
      ? {
          columns: datetimeIanaToggleColumns,
          modeByKey: datetimeIanaModeByKey,
          onToggle: toggleDatetimeIana,
          disabled: rowsLoading,
          test_id: 'entity-list-iana'
        }
      : undefined
  );
</script>

<svelte:window onkeydown={keyboardNav.handleGlobalKeyDown} />




<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <EntityListTableHeader
    search={search}
    onSearchInput={onSearchInput}
    searchInKeys={searchInKeys}
    searchableColumns={searchableColumns}
    onSearchInKeysChange={onSearchInKeysChange}
    toggleSearchKey={toggleSearchKey}
    viewMode={viewMode}
    onViewModeChange={viewModeComposable.setViewMode}
    deletionFilterMode={deletionFilterMode}
    onDeletionFilterModeChange={deletionFilterComposable.setDeletionFilterMode}
    hasSoftDelete={hasSoftDelete}
    rowsLoading={rowsLoading}
    refreshDisabled={refreshDisabled}
    onRefresh={onRefresh}
    filterableColumns={filterableColumns}
    onToggleFilters={sheetPanels.toggleFiltersSheet}
    filterPresets={filterPresets}
    presetSelections={presetSelections}
    onPresetChange={onPresetChange}
    stickyColumnsGroup={stickyColumnsGroup}
    nonAuditingColumns={nonAuditingColumns}
    auditingColumnsGroup={auditingColumnsGroup}
    visibleKeys={visibleKeys}
    toggleColumnKey={toggleColumnKey}
    resetColumnsAndSorting={resetColumnsAndSorting}
    onCreateAction={effectiveOnCreateAction}
    create_cta={create_cta}
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
    onToggleToolbarMode={toolbarModeState.toggle}
    onBulkExport={() => exportComposable.openExportDialog()}
    onHtmlExport={() => exportComposable.openHtmlExportConfirmDialog()}
    onBulkDuplicate={() => bulkActions.handleBulkDuplicate()}
    onBulkDelete={() => bulkActions.handleBulkDelete()}
    onBulkRestore={() => bulkActions.handleBulkRestore()}
    onBulkEdit={() => bulkActions.handleBulkEdit()}
    bulkEditChrome={bulkEditChrome}
    bulkCapabilities={bulkCapabilities}
    bulkCustomActions={effectiveBulkCustomActions}
    onBulkCustomAction={(a) => bulkActions.handleBulkCustomAction(a)}
    bulkDeleteChrome={bulkDeleteChrome}
    bulkRestoreChrome={bulkRestoreChrome}
    bulkDuplicateChrome={bulkDuplicateChrome}
    bulkExportChrome={bulkExportChrome}
    selectAll={cardSelectAllZone}
    sort={cardSortZone}
    ianaToggle={cardIanaZone}
  />

  <!-- Persistent reload strip — the h-0.5 slot keeps its height even when
       idle (no layout shift); the bar renders on EVERY populated-table
       reload (sort, filters, presets, pagination, refresh), not just the
       empty-state first load. -->
  <div class="h-0.5 w-full shrink-0" data-testid="elt-reload-strip">
    {#if reloadStripVisible}
      <LoadingBar size="xs" />
    {/if}
  </div>

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
    focusedRowIndex={keyboardNav.focusedRowIndex}
    onOpenColumnSelector={openColumnsSheet}
    actionsEnabled={actionsEnabled}
    rowActions={rowActions}
    entityRowActions={effectiveRowActions}
    dropdownMenuRow={dropdownMenuRow}
    datetimeIanaModeByKey={datetimeIanaModeByKey}
    datetimeIanaRenderTick={datetimeIanaRenderTick}
    sparklineData={sparklineData}
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
    effectiveSortKey={effectiveSortKey}
    sortDir={sortDir}
    toggleDatetimeIana={toggleDatetimeIana}
    onEntityRowClick={onEntityCardClick}
    onToggleRowSelect={toggleRowSelect}
    onOpenRowDropdown={openRowDropdown}
    onCloseRowDropdown={closeRowDropdown}
    onEditRow={handleEditRow}
    rowActionsComposable={rowActionsComposable}
    onRowDblClick={onRowDblClickProp ?? handleRowDblClick}
    bind:tableRef
    tableDensityClass={tableDensityClass}
    stickyColumnsState={stickyColumnsState}
    rowChromeH={rowChromeH}
    checkboxInteractiveClass={checkboxInteractiveClass}
    visibleKeys={visibleKeys}
    handleSortClick={handleSortClick}
    rowRangeSelection={rowRangeSelection}
    extraCols={extraCols}
  />

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
    create_label_key={effectiveOnCreateAction ? (create_cta?.label_key ?? 'system.entities.list.new') : undefined}
  />
  </div>

  <EntityListTableDialogs
    {dialogs}
    {rowActionsComposable}
    {bulkActions}
    {exportComposable}
    {selectedKeys}
    {total}
    {entity}
    entities_ns={entities_ns}
    translationKey={effectiveTranslationKey}
    duplicateChrome={effectiveRowActions.duplicate_chrome}
    exportChrome={bulkExportChrome}
  />

