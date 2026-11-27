<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { toDisplayString } from '@primebrick/ui';
  import { t } from '$lib/i18n';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount, untrack, type Snippet } from 'svelte';
  import { entitiesNs } from '$lib/utils/entity-meta';
  import { pushNotification } from '$lib/errors/app-errors';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { isSnakeCaseSingular } from '$lib/entity-list';
  import { EntityListTable } from '$lib/components/entity-list-table';
  import type { CellArgs } from '$lib/components/entity-list-table/types';
  import type { RowCustomAction } from '@primebrick/core';
  // Page body chrome (the bordered box) is inherited — AppShell mounts
  // AppPageScaffold once for every (app) page; archetypes never self-wrap.
  import {
    useEntityList,
    type FixedFilter,
    type PersistMedium
  } from '$lib/composables/useEntityList.svelte';

  interface EntityTablePageProps {
    /** Full entity API base (`/api/v1/entities/<entity>` or `/svc/<svc>/api/v1/entities/<entity>`). */
    basePath: string;
    /** Owning service — REQUIRED for builtin entities (they mount on
     *  every service, so the entity→service census is last-wins
     *  ambiguous). Side paths (row ops, audit, sheets, export, record
     *  sheet) thread it through instead of re-deriving from `entity`. */
    service?: string;
    /** Page storage namespace — `pb:<page>:list:`. */
    storageKeyPrefix: string;
    /** Legacy family BroadcastChannel (receiver mode — child form pages notify). */
    syncChannel?: string;
    /** i18n scope key for list-error notifications. */
    errorScopeKey?: string;
    /** i18n scope key for bootstrap-failure notifications — defaults to errorScopeKey. */
    errorScopeKeyInit?: string;
    /** Always-on server filters (section splits). */
    fixedFilters?: FixedFilter[];
    onRowsLoaded?: (rows: TRow[]) => void;
    /** false for entities without soft-delete — skips deleted_records. */
    deletionFilter?: boolean;
    persist?: PersistMedium;
    legacyPersist?: PersistMedium | null;
    searchGate?: (trimmed: string) => boolean;
    searchDebounceMs?: number;

    /** Navigation strategy for create/edit — `popup` (new tab + focus, the
     *  platform convention: form pages are child tabs that broadcast and
     *  self-close) or `goto` (same-tab, opt-out for pages that don't
     *  implement the child contract). */
    navStrategy?: 'goto' | 'popup';
    /** Create path (e.g. `/system/settings/users/create`). */
    createPath?: string;
    /** Edit path template — `:uuid` substituted with the row uid value
     *  (same placeholder convention as `meta.actions[].endpoint.path`). */
    editPath?: string;
    /** Full override for the create CTA — bypasses navStrategy. */
    onCreateAction?: () => void;
    /** Full override for the row edit action — bypasses navStrategy. */
    onEditAction?: (row: TRow) => void;
    /** Full override for the row dblclick — bypasses the wired default
     *  (`kind:"detail"` route in a new tab, else the `entity.record`
     *  update sheet). */
    onRowDblClick?: (row: TRow) => void;
    /** Handlers for `meta.table.row_custom_actions` entries (keyed by action_name). */
    customActionHandlers?: Record<string, (row: TRow) => void>;
    /** Row-actions column — default true. */
    rowActions?: boolean;
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;

    /** Per-cell render override — forwarded verbatim to EntityListTable. */
    cell?: Snippet<[CellArgs<TRow>]>;
    /** Page-specific dialogs — rendered after the table; receives the meta
     *  uid + `meta.table.row_custom_actions` so a custom-action dialog can
     *  inherit the SAME chrome the row CTA rendered (one source). */
    extraDialogs?: Snippet<[uid: string, row_custom_actions: RowCustomAction[] | undefined]>;
    metaLoadingView?: Snippet;
    rowsLoadingView?: Snippet;
    emptyView?: Snippet;
    errorView?: Snippet;
    loadingMessage?: string;
    noRecordsMessage?: string;
  }

  let {
    basePath,
    service,
    storageKeyPrefix,
    syncChannel,
    errorScopeKey,
    errorScopeKeyInit,
    fixedFilters,
    onRowsLoaded,
    deletionFilter,
    persist,
    legacyPersist,
    searchGate,
    searchDebounceMs,
    navStrategy = 'popup',
    createPath,
    editPath,
    onCreateAction,
    onEditAction,
    onRowDblClick,
    customActionHandlers,
    rowActions = true,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    cell,
    extraDialogs,
    metaLoadingView,
    rowsLoadingView,
    emptyView,
    errorView,
    loadingMessage,
    noRecordsMessage
  }: EntityTablePageProps = $props();

  // Page-level config props are immutable per mount (the entity doesn't
  // change under a mounted page) — untrack marks the one-time capture.
  const list = untrack(() => useEntityList<TRow>({
    basePath,
    storageKeyPrefix,
    syncChannel,
    errorScopeKey,
    errorScopeKeyInit,
    fixedFilters,
    onRowsLoaded,
    deletionFilter,
    persist,
    legacyPersist,
    searchGate,
    searchDebounceMs,
    t: $t
  }));

  onMount(() => {
    void list.init();
  });

  const meta = $derived(list.meta);
  const entity = $derived(meta?.entity ?? basePath.split('/').filter(Boolean).pop() ?? '');
  const uid = $derived(meta?.uid ?? 'uuid');
  const translationKey = $derived(
    meta?.translation_key && isSnakeCaseSingular(meta.translation_key) ? meta.translation_key : entity || 'entity'
  );

  // datetime-IANA view toggles are local view state (not persisted) — owned
  // here and bound into the table.
  let datetimeIanaModeByKey = $state<Record<string, 'browser' | 'record'>>({});
  let datetimeIanaRenderTick = $state(0);

  /**
   * Meta-driven create: the module's route census declares `kind:"create"`
   * routes with `entity` — when the page doesn't pass `createPath`
   * explicitly, the census route supplies path + label_key + icon for the
   * toolbar CTA. Explicit props win (page-level override).
   */
  const censusCreateRoute = $derived(
    shellNav.moduleNav?.routes?.find((r) => r.kind === 'create' && r.entity === entity)
  );
  const effectiveCreatePath = $derived(createPath ?? censusCreateRoute?.route);

  /**
   * Meta-driven edit: census `kind:"detail"` routes end in a `[param]`
   * segment (e.g. `/system/job/job_triggers/[uuid]`) — convert to the `:uuid`
   * template `openEdit` substitutes. Explicit `editPath` still wins.
   */
  const censusDetailRoute = $derived(
    shellNav.moduleNav?.routes?.find((r) => r.kind === 'detail' && r.entity === entity)
  );
  const effectiveEditPath = $derived(
    editPath ?? censusDetailRoute?.route.replace(/\[[^\]]*\]/, ':uuid')
  );
  /**
   * Create CTA chrome — `label_key` rides the census `kind:"create"`
   * route (its `label_key` IS the authored "New <entity>" copy), `icon`
   * comes from the meta action `create.single` authored override only.
   * `censusCreateRoute.icon` is deliberately ignored — a route/page icon
   * is not a toolbar action icon (route materialization defaults like
   * `text-cursor-input` would leak into the CTA). No meta override → the
   * toolbar's generic `+` default renders.
   */
  const createCta = $derived.by(() => {
    const action = meta?.actions?.find((a) => a.op === 'create.single');
    const label_key = action?.label_key ?? censusCreateRoute?.label_key;
    const icon = action?.icon;
    return label_key || icon ? { label_key, icon } : undefined;
  });

  function openCreate() {
    if (!effectiveCreatePath) return;
    if (navStrategy === 'popup') {
      const w = window.open(effectiveCreatePath, '_blank');
      if (w) w.focus();
      else pushNotification({ impact: 'MEDIUM', messageKey: 'app.common.popup_blocked', toast: true });
    } else {
      void goto(resolve(effectiveCreatePath as '/'));
    }
  }

  function openEdit(row: TRow) {
    if (!effectiveEditPath) return;
    const url = effectiveEditPath.replace(':uuid', encodeURIComponent(toDisplayString(row[uid])));
    if (navStrategy === 'popup') {
      const w = window.open(url, '_blank');
      if (w) w.focus();
      else pushNotification({ impact: 'MEDIUM', messageKey: 'app.common.popup_blocked', toast: true });
    } else {
      void goto(resolve(url as '/'));
    }
  }

  /** Record-sheet fallback — entities without a `kind:"detail"` route
   *  (builtin registry lists publish `kind:"list"` only) still get a
   *  governed edit surface: `entity.record` opens in edit mode, gated
   *  on `update.single` by the sheet itself. Without it the Modifica
   *  CTA rendered but dispatched to a `undefined` handler — a silent
   *  no-op. */
  function openEditSheet(row: TRow) {
    void import('$lib/shell/sheets/sheet-manager.svelte').then(({ openSheet }) =>
      openSheet('entity.record', { entity, value: row[uid], service, edit: true }),
    );
  }

  /** Meta-driven create surface — `meta.create.surface === "sheet"`
   *  opens the SAME `entity.record` panel in create mode (no census
   *  `kind:"create"` route required: a sheet is never a nav leaf).
   *  The `form` default keeps resolving through the census route. */
  const createSurface = $derived(meta?.create?.surface);
  function openCreateSheet() {
    void import('$lib/shell/sheets/sheet-manager.svelte').then(({ openSheet }) =>
      openSheet('entity.record', { entity, service, mode: 'create' }),
    );
  }

  const effectiveOnCreateAction = $derived(
    onCreateAction ??
      (createSurface === 'sheet' ? openCreateSheet : effectiveCreatePath ? openCreate : undefined),
  );
  const effectiveOnEditAction = $derived(
    onEditAction ?? (effectiveEditPath ? openEdit : openEditSheet)
  );

  /** Row dblclick — "sheet se è previsto, altrimenti default è page":
   *  entities whose record surface is the sheet (no `kind:"detail"`
   *  census route) open `entity.record` in update mode (view→pencil,
   *  same target as ref-cell drill-through); entities with a detail
   *  page keep the built-in new-tab navigation. `service` threads
   *  through — builtin census-map lookups are last-wins ambiguous. */
  function openRecordSheet(row: TRow) {
    void import('$lib/shell/sheets/sheet-manager.svelte').then(({ openSheet }) =>
      openSheet('entity.record', { entity, value: row[uid], service }),
    );
  }
  const effectiveOnRowDblClick = $derived(
    onRowDblClick ?? (censusDetailRoute ? undefined : openRecordSheet)
  );
  const effectiveSelectionLabelKey = $derived(
    selectionLabelKey ?? (entity ? `${entitiesNs(meta)}.entities.${entity}.plural` : undefined)
  );
  const effectiveSelectionLabelSingularKey = $derived(
    selectionLabelSingularKey ?? (entity ? `${entitiesNs(meta)}.entities.${entity}.singular` : undefined)
  );
</script>

<EntityListTable
    {entity}
    {service}
    {translationKey}
    entities_ns={entitiesNs(meta)}
    bind:datetimeIanaModeByKey
    bind:datetimeIanaRenderTick
    {uid}
    columnOrderStorageKey={list.columnOrderStorageKey}
    columns={list.columns}
    rowActionsEnabled={rowActions}
    entityCustomActions={meta?.table?.row_custom_actions}
    entityBulkCustomActions={meta?.table?.bulk_custom_actions}
    entityActions={meta?.actions}
    {customActionHandlers}
    onCreateAction={effectiveOnCreateAction}
    create_cta={createCta}
    onEditAction={effectiveOnEditAction}
    onRowDblClick={effectiveOnRowDblClick}
    defaultView={list.viewMode}
    defaultSort={meta?.table?.default_sort}
    pageSizeOptions={meta?.table?.page_size_options}
    selectionLabelKey={effectiveSelectionLabelKey}
    selectionLabelSingularKey={effectiveSelectionLabelSingularKey}
    {selectionLabelText}
    {selectionLabelSingularText}
    rows={list.rows}
    total={list.total}
    metaLoading={list.metaLoading}
    rowsLoading={list.rowsLoading}
    error={list.error}
    page={list.page}
    pageSize={list.pageSize}
    onPageChange={list.onPageChange}
    onPageSizeChange={list.onPageSizeChange}
    search={list.search}
    onSearchInput={list.onSearchInput}
    searchInKeys={list.searchInKeys}
    onSearchInKeysChange={list.onSearchInKeysChange}
    sortKey={list.sortKey}
    sortDir={list.sortDir}
    onSortChange={list.onSortChange}
    visibleKeys={list.visibleKeys}
    onVisibleKeysChange={list.onVisibleKeysChange}
    onResetColumnVisibility={list.onResetColumnVisibility}
    bind:selectedKeys={() => list.selectedKeys, (v) => list.onSelectedKeysChange(v)}
    onSelectedKeysChange={list.onSelectedKeysChange}
    filterValues={list.filterValues}
    onFilterValuesChange={list.onFilterValuesChange}
    advancedFilters={list.advancedFilters}
    onAdvancedFiltersChange={list.onAdvancedFiltersChange}
    onResetFilters={list.onResetFilters}
    deletionFilterMode={list.deletionFilterMode}
    onDeletionFilterModeChange={list.onDeletionFilterModeChange}
    filterPresets={list.filterPresets}
    presetSelections={list.presetSelections}
    onPresetChange={list.onPresetChange}
    sparklineData={list.sparklineData}
    onRefresh={() => void list.refreshRows()}
    {cell}
    {metaLoadingView}
    {rowsLoadingView}
    {emptyView}
    {errorView}
    {loadingMessage}
    {noRecordsMessage}
  />

{#if extraDialogs}
  {@render extraDialogs(uid, meta?.table?.row_custom_actions)}
{/if}
