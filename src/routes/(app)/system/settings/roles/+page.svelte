<script lang="ts">
  import { t } from '$lib/i18n';
  import { page as appPage } from '$app/state';
  import { goto } from '$app/navigation';
  import { EntityListTable } from '$lib/components/entity-list-table';
  import { apiFetchWithTimeout, ApiDatabaseUnavailableError, ApiUnreachableError } from '$lib/api';
  import { extJsonParse } from '$lib/api-ext';
  import { pushNotification } from '$lib/errors/app-errors';
  import type { AppErrorTag } from '$lib/errors/app-errors';
  import type { EntityListListMeta, MetaColumn, ViewName } from '$lib/entity-list';
  import type { AdvancedFilter } from '$lib/entity-list/types';
  import {
    defaultVisibleColumnKeys,
    orderedColumnsFromListMeta,
    sanitizeVisibleKeys,
    isSnakeCaseSingular
  } from '$lib/entity-list';
  import { onConnectivityRestored } from '$lib/app-connectivity-events';
  import { onMount } from 'svelte';
  import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';

  type RoleMappingMeta = {
    entity: 'role_mappings';
    translationKey?: string;
    titleKey?: string;
    uid: string;
    list: EntityListListMeta;
  };

  type RoleMappingListRow = {
    uuid: string;
    idp_role: string;
    idp_org?: string;
    label_key?: string;
    is_admin: boolean;
    permissions: string[];
    last_synced_at?: string;
    created_at: string;
    updated_at: string;
    version: number;
    created_by?: string;
    updated_by?: string;
  } & Record<string, unknown>;

  type ListResponse = {
    rows: RoleMappingListRow[];
    page: number;
    page_size: number;
    total: bigint;
  };

  let meta = $state<RoleMappingMeta | null>(null);
  let rows = $state<RoleMappingListRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let search = $state('');
  let appliedSearch = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  let sortKey = $state<string | null>(null);
  let sortDir = $state<'asc' | 'desc'>('asc');

  let page = $state(1);
  let pageSize = $state(25);
  let total = $state<bigint>(0n);

  let filtersOpen = $state(false);

  const viewMode: ViewName = 'table';
  const viewVisibility = $derived(meta?.list.viewVisibility);

  let filterValues = $state<Record<string, any>>({});
  let advancedFilters: AdvancedFilter[] = $state([]);
  let globalConnector: 'AND' | 'OR' = $state('AND');

  let visibleKeys = $state<string[]>([]);
  let selectedKeys = $state<string[]>([]);
  let searchInKeys = $state<string[] | null>(null);

  let datetimeIanaModeByKey = $state<Record<string, 'browser' | 'record'>>({});
  let datetimeIanaRenderTick = $state(0);

  const storageKeyPrefix = 'pb:role_mappings:list:';
  const skVisibleKeys = `${storageKeyPrefix}visibleKeys`;
  const skSearchInKeys = `${storageKeyPrefix}searchInKeys`;
  const skColumnOrder = `${storageKeyPrefix}columnOrder`;
  const skSort = `${storageKeyPrefix}sort`;

  const columns = $derived(orderedColumnsFromListMeta(meta?.list));
  const stickyColumns = $derived(meta?.list.stickyColumns ?? []);
  const dataColumns = $derived(
    (meta?.list.columns ?? []).filter((c: MetaColumn) => {
      const stickyKeys = new Set((meta?.list.stickyColumns ?? []).map((c) => c.key));
      const auditingKeys = new Set((meta?.list.auditingColumns ?? []).map((c) => c.key));
      return !stickyKeys.has(c.key) && !auditingKeys.has(c.key);
    })
  );
  const auditingColumns = $derived(meta?.list.auditingColumns ?? []);
  const metaLoaded = $derived(!!meta);
  const metaLoading = $derived(!metaLoaded && loading);
  const rowsLoading = $derived(metaLoaded && loading);
  const defaultSortKey = $derived(meta?.list.defaultSort?.key ?? 'idp_role');
  const defaultSortDir = $derived(meta?.list.defaultSort?.dir ?? 'asc');

  const { notifyParentRefresh } = useSyncChannel('primebrick_roles_sync', {
    mode: 'receiver',
    onRefresh: () => void refreshRows(),
  });

  function ensureVisibleKeys() {
    if (visibleKeys.length === 0 && columns.length) {
      visibleKeys = defaultVisibleColumnKeys(columns, viewMode, viewVisibility);
      return;
    }
    if (!columns.length) return;
    visibleKeys = sanitizeVisibleKeys(visibleKeys, columns, viewMode, viewVisibility);
  }

  function arrayEq(a: string[] | null, b: string[] | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  let sortRestored = $state(false);

  function restorePersistentState() {
    if (sortRestored) return;
    try {
      const sk = localStorage.getItem(skSort);
      if (sk) {
        const parsed = JSON.parse(sk) as { key: string; dir: 'asc' | 'desc' };
        sortKey = parsed.key;
        sortDir = parsed.dir;
      }
      const vk = localStorage.getItem(skVisibleKeys);
      if (vk) visibleKeys = JSON.parse(vk) as string[];
      const sik = localStorage.getItem(skSearchInKeys);
      if (sik) searchInKeys = JSON.parse(sik) as string[];
    } catch {
      // ignore
    }
    sortRestored = true;
  }

  function persistState() {
    try {
      if (sortKey) {
        localStorage.setItem(skSort, JSON.stringify({ key: sortKey, dir: sortDir }));
      }
      if (visibleKeys.length) {
        localStorage.setItem(skVisibleKeys, JSON.stringify(visibleKeys));
      }
      if (searchInKeys) {
        localStorage.setItem(skSearchInKeys, JSON.stringify(searchInKeys));
      }
    } catch {
      // ignore
    }
  }

  $effect(() => {
    // Track reads so persistence runs on changes
    void sortKey; void sortDir; void visibleKeys; void searchInKeys;
    persistState();
  });

  const metaCacheKey = '__pbRoleMappingsMetaCache';
  const metaInFlightKey = '__pbRoleMappingsMetaInFlight';

  function getMetaCache(): RoleMappingMeta | null {
    return ((globalThis as any)[metaCacheKey] ?? null) as RoleMappingMeta | null;
  }
  function getMetaInFlight(): Promise<RoleMappingMeta> | null {
    return ((globalThis as any)[metaInFlightKey] ?? null) as Promise<RoleMappingMeta> | null;
  }
  function setMetaCache(next: RoleMappingMeta | null) {
    (globalThis as any)[metaCacheKey] = next;
  }
  function setMetaInFlight(next: Promise<RoleMappingMeta> | null) {
    (globalThis as any)[metaInFlightKey] = next;
  }

  class ApiListError extends Error {
    code: string;
    status: number;
    internalCode?: string;
    instance?: string;
    constructor(code: string, status: number, internalCode?: string, instance?: string) {
      super(code);
      this.code = code;
      this.status = status;
      this.internalCode = internalCode;
      this.instance = instance;
    }
  }

  async function readApiErrorDetails(res: Response): Promise<{ code: string | null; internalCode: string | null; instance: string | null; status: number | null }> {
    try {
      const data = (await res.json()) as { error?: unknown; title?: unknown; internal_code?: unknown; instance?: unknown; status?: unknown };
      const code = typeof data?.error === 'string' ? data.error : typeof data?.title === 'string' ? data.title : null;
      const internalCode = typeof data?.internal_code === 'string' ? data.internal_code : null;
      const instance = typeof data?.instance === 'string' ? data.instance : null;
      const status = typeof data?.status === 'number' ? data.status : res.status;
      return { code, internalCode, instance, status };
    } catch {
      return { code: null, internalCode: null, instance: null, status: res.status };
    }
  }

  function isAbortError(e: unknown): boolean {
    return (
      (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') ||
      (e instanceof Error && e.name === 'AbortError')
    );
  }

  function asApiListError(e: unknown): { code: string; status: number | null } | null {
    if (e instanceof ApiDatabaseUnavailableError) {
      return { code: 'DATABASE_UNAVAILABLE', status: e.status };
    }
    if (e instanceof ApiUnreachableError) {
      return { code: 'BACKEND_OFFLINE', status: e.status };
    }
    if (!e || typeof e !== 'object') return null;
    const anyE = e as { name?: string; code?: string; message?: string; status?: number | null };
    const code =
      typeof anyE.code === 'string' ? anyE.code : typeof anyE.message === 'string' ? anyE.message : null;
    const status = typeof anyE.status === 'number' ? anyE.status : null;
    if (!code) return null;
    return { code, status };
  }

  function isBackendGatewayUnreachable(code: string, status: number | null): boolean {
    if (code === 'DATABASE_UNAVAILABLE') return false;
    return (
      code === 'BACKEND_OFFLINE' ||
      (status === 502 || status === 503 || status === 504)
    );
  }

  function httpTagForGatewayFailure(status: number | null): number {
    return typeof status === 'number' ? status : 502;
  }

  function backendOfflineTags(status: number | null): AppErrorTag[] {
    const http = httpTagForGatewayFailure(status);
    return [
      { label: 'BACKEND_OFFLINE', tone: 'danger' },
      { label: `HTTP ${http}`, tone: 'danger' },
    ];
  }

  async function loadMeta() {
    if (meta) return;
    const cached = getMetaCache();
    if (cached) {
      meta = cached;
      const defSort = meta.list.defaultSort;
      if (!sortRestored && sortKey === null) {
        sortKey = defSort?.key ?? null;
        sortDir = defSort?.dir ?? 'asc';
      }
      pageSize = meta.list.defaultPageSize ?? pageSize;
      ensureVisibleKeys();
      return;
    }
    const inFlight = getMetaInFlight();
    if (inFlight) {
      meta = await inFlight;
      const defSort = meta.list.defaultSort;
      if (!sortRestored && sortKey === null) {
        sortKey = defSort?.key ?? null;
        sortDir = defSort?.dir ?? 'asc';
      }
      pageSize = meta.list.defaultPageSize ?? pageSize;
      ensureVisibleKeys();
      return;
    }

    setMetaInFlight(
      (async () => {
        const metaRes = await apiFetchWithTimeout('/api/v1/entities/role_mappings/meta', undefined, 30_000);
        if (!metaRes.ok) {
          const apiDetails = await readApiErrorDetails(metaRes);
          const code = apiDetails.code ?? 'GET_METADATA_FAILED';
          throw new ApiListError(code, metaRes.status, apiDetails.internalCode ?? undefined, apiDetails.instance ?? undefined);
        }
        const next = (await metaRes.json()) as RoleMappingMeta;
        setMetaCache(next);
        return next;
      })()
    );

    try {
      const p = getMetaInFlight();
      meta = p ? await p : null;
      const defSort = meta?.list.defaultSort;
      if (!sortRestored && sortKey === null) {
        sortKey = defSort?.key ?? null;
        sortDir = defSort?.dir ?? 'asc';
      }
      pageSize = meta?.list.defaultPageSize ?? pageSize;
      ensureVisibleKeys();
    } catch (e) {
      setMetaInFlight(null);
      throw e;
    }
  }

  async function refreshRows() {
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams();
      if (appliedSearch) params.set('search', appliedSearch);
      if (searchInKeys && searchInKeys.length > 0) params.set('search_in', searchInKeys.join(','));
      if (sortKey) params.set('sort_key', sortKey);
      if (sortDir) params.set('sort_dir', sortDir);
      params.set('page', page.toString());
      params.set('page_size', pageSize.toString());
      if (advancedFilters.length > 0) {
        params.set('filters', JSON.stringify(advancedFilters));
        params.set('connector', globalConnector);
      }

      const res = await apiFetchWithTimeout(`/api/v1/entities/role_mappings/list?${params.toString()}`, undefined, 30_000);
      if (!res.ok) {
        const apiDetails = await readApiErrorDetails(res);
        const code = apiDetails.code ?? 'LIST_FAILED';
        throw new ApiListError(code, res.status, apiDetails.internalCode ?? undefined, apiDetails.instance ?? undefined);
      }
      const data = extJsonParse<ListResponse>(await res.text());
      rows = data.rows;
      page = data.page;
      pageSize = data.page_size;
      total = data.total;
    } catch (e) {
      if (isAbortError(e)) {
        return;
      }
      const apiErr = asApiListError(e);
      if (apiErr) {
        error = apiErr.code;
        if (isBackendGatewayUnreachable(apiErr.code, apiErr.status)) {
          pushNotification({
            impact: 'HIGH',
            message: $t('shell.settings.roles.title') + ': ' + apiErr.code,
            scope: 'role_mappings.list',
            tags: backendOfflineTags(apiErr.status),
          });
        } else {
          pushNotification({
            impact: 'MEDIUM',
            message: apiErr.code,
            scope: 'role_mappings.list',
          });
        }
      } else if (e instanceof Error) {
        error = e.message;
      } else {
        error = 'Unknown error';
      }
    } finally {
      loading = false;
    }
  }

  async function init() {
    restorePersistentState();
    await loadMeta();
    await refreshRows();
  }

  // --- Event handlers for EntityListTable ---

  function onPageChange(p: number) {
    page = p;
    void refreshRows();
  }

  function onPageSizeChange(ps: number) {
    pageSize = ps;
    page = 1;
    void refreshRows();
  }

  function onSearchInput(value: string) {
    search = value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      appliedSearch = value;
      page = 1;
      void refreshRows();
    }, 350);
  }

  function onSearchInKeysChange(keys: string[] | null) {
    searchInKeys = keys;
    page = 1;
    void refreshRows();
  }

  function onSortChange(key: string | null, dir: 'asc' | 'desc') {
    sortKey = key;
    sortDir = dir;
    page = 1;
    void refreshRows();
  }

  function onVisibleKeysChange(keys: string[]) {
    visibleKeys = keys;
  }

  function onResetColumnVisibility() {
    if (columns.length) {
      visibleKeys = defaultVisibleColumnKeys(columns, viewMode, viewVisibility);
    }
  }

  function onSelectedKeysChange(keys: string[]) {
    selectedKeys = keys;
  }

  function onFilterValuesChange(values: Record<string, any>) {
    filterValues = values;
  }

  function onAdvancedFiltersChange(filters: AdvancedFilter[]) {
    advancedFilters = filters;
    page = 1;
    void refreshRows();
  }

  function onResetFilters() {
    filterValues = {};
    advancedFilters = [];
    globalConnector = 'AND';
    filtersOpen = false;
    page = 1;
    void refreshRows();
  }

  function openCreate() {
    void goto('/system/settings/roles/create');
    notifyParentRefresh();
  }

  function openEdit(row: RoleMappingListRow) {
    void goto(`/system/settings/roles/${encodeURIComponent(row.uuid)}`);
    notifyParentRefresh();
  }

  onMount(async () => {
    try {
      await init();
    } catch (err) {
      console.error('Failed to initialize roles list:', err);
    } finally {
      loading = false;
    }
  });

  onConnectivityRestored(() => {
    void refreshRows();
  });
</script>

<svelte:head>
  <title>{$t('shell.settings.roles.title')} · Primebrick</title>
</svelte:head>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: appPage.url.pathname,
            searchParams: appPage.url.searchParams,
            t: (key) => $t(key)
          })
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.roles.title')}</h1>
    </div>
  {/snippet}

  <EntityListTable
    entity="role_mappings"
    translationKey={meta?.translationKey && isSnakeCaseSingular(meta.translationKey) ? meta.translationKey : 'role_mapping'}
    bind:datetimeIanaModeByKey
    bind:datetimeIanaRenderTick
    uid={meta?.uid ?? 'uuid'}
    {stickyColumns}
    {dataColumns}
    {auditingColumns}
    columnOrderStorageKey={skColumnOrder}
    {columns}
    rowActionsEnabled
    entityRowActions={meta?.list.rowActions}
    onCreateAction={openCreate}
    onEditAction={openEdit}
    defaultSort={meta?.list.defaultSort}
    pageSizeOptions={meta?.list.pageSizeOptions}
    searchPlaceholderKey={meta?.list.searchPlaceholderKey}
    selectionLabelSingularKey="entities.role_mapping.singular"
    selectionLabelKey="entities.role_mapping.plural"
    {rows}
    {total}
    {metaLoading}
    {rowsLoading}
    {error}
    {page}
    {pageSize}
    {onPageChange}
    {onPageSizeChange}
    search={search}
    {onSearchInput}
    searchInKeys={searchInKeys}
    {onSearchInKeysChange}
    {sortKey}
    {sortDir}
    {onSortChange}
    visibleKeys={visibleKeys}
    {onVisibleKeysChange}
    {onResetColumnVisibility}
    selectedKeys={selectedKeys}
    {onSelectedKeysChange}
    {onFilterValuesChange}
    {onAdvancedFiltersChange}
    {onResetFilters}
    onRefresh={() => void refreshRows()}
  />
</AppPageScaffold>
