<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { t } from '$lib/i18n';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount, type Snippet } from 'svelte';
  import { entityPageTitle } from '$lib/utils/entity-meta';
  import { isSnakeCaseSingular } from '$lib/entity-list';
  import { EntityListTable } from '$lib/components/entity-list-table';
  import type { CellArgs } from '$lib/components/entity-list-table/types';
  import type { EntityMeta } from '$lib/entity-list/types';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import {
    useEntityList,
    type FixedFilter,
    type PersistMedium
  } from '$lib/composables/useEntityList.svelte';

  interface EntityTablePageProps {
    /** Full entity API base (`/api/v1/entities/<entity>` or `/ws/<svc>/api/v1/entities/<entity>`). */
    basePath: string;
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

    /** Navigation strategy for create/edit — `goto` (default) or `popup` (new window + focus). */
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
    /** Handlers for `meta.table.row_custom_actions` entries (keyed by action_name). */
    customActionHandlers?: Record<string, (row: TRow) => void>;
    /** Row-actions column — default true. */
    rowActions?: boolean;
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;

    /** Breadcrumb rendered above the title — page-level route position, not meta-derived. */
    breadcrumb?: Snippet;
    /** Extra header content after the title. */
    headerExtras?: Snippet;
    /** Right-side header actions (e.g. page-level create CTA gated on meta.actions). */
    headerActions?: Snippet<[meta: EntityMeta | null]>;
    /** Per-cell render override — forwarded verbatim to EntityListTable. */
    cell?: Snippet<[CellArgs<TRow>]>;
    /** Page-specific dialogs — rendered after the table; receives the meta uid. */
    extraDialogs?: Snippet<[uid: string]>;
    metaLoadingView?: Snippet;
    rowsLoadingView?: Snippet;
    emptyView?: Snippet;
    errorView?: Snippet;
    loadingMessage?: string;
    noRecordsMessage?: string;
  }

  let {
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
    navStrategy = 'goto',
    createPath,
    editPath,
    onCreateAction,
    onEditAction,
    customActionHandlers,
    rowActions = true,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    breadcrumb,
    headerExtras,
    headerActions,
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
  // change under a mounted page) — the composable captures them at init.
  // svelte-ignore state_referenced_locally
  const list = useEntityList<TRow>({
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
  });

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

  function openCreate() {
    if (!createPath) return;
    if (navStrategy === 'popup') {
      const w = window.open(createPath, '_blank');
      if (w) w.focus();
      else alert('Popup bloccato dal browser! Controlla le impostazioni.');
    } else {
      void goto(resolve(createPath as '/'));
    }
  }

  function openEdit(row: TRow) {
    if (!editPath) return;
    const url = editPath.replace(':uuid', encodeURIComponent(String(row[uid])));
    if (navStrategy === 'popup') {
      const w = window.open(url, '_blank');
      if (w) w.focus();
      else alert('Popup bloccato dal browser! Controlla le impostazioni.');
    } else {
      void goto(resolve(url as '/'));
    }
  }

  const effectiveOnCreateAction = $derived(onCreateAction ?? (createPath ? openCreate : undefined));
  const effectiveOnEditAction = $derived(onEditAction ?? (editPath ? openEdit : undefined));
  const effectiveSelectionLabelKey = $derived(
    selectionLabelKey ?? (entity ? `system.entities.${entity}.plural` : undefined)
  );
  const effectiveSelectionLabelSingularKey = $derived(
    selectionLabelSingularKey ?? (entity ? `system.entities.${entity}.singular` : undefined)
  );
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="flex items-end justify-between gap-3">
      <div class="min-w-0 space-y-1">
        {#if breadcrumb}
          {@render breadcrumb()}
        {/if}
        <h1 class="truncate text-xl font-semibold leading-tight">{entityPageTitle(meta, 'list', $t)}</h1>
        {#if headerExtras}
          {@render headerExtras()}
        {/if}
      </div>
      {#if headerActions}
        <div class="flex shrink-0 items-center justify-end gap-2">
          {@render headerActions(meta)}
        </div>
      {/if}
    </div>
  {/snippet}

  <EntityListTable
    {entity}
    {translationKey}
    bind:datetimeIanaModeByKey
    bind:datetimeIanaRenderTick
    {uid}
    columnOrderStorageKey={list.columnOrderStorageKey}
    columns={list.columns}
    rowActionsEnabled={rowActions}
    entityCustomActions={meta?.table?.row_custom_actions}
    entityActions={meta?.actions}
    {customActionHandlers}
    onCreateAction={effectiveOnCreateAction}
    onEditAction={effectiveOnEditAction}
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
    bind:filtersOpen={() => list.filtersOpen, (v) => list.setFiltersOpen(v)}
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
    {@render extraDialogs(uid)}
  {/if}
</AppPageScaffold>
