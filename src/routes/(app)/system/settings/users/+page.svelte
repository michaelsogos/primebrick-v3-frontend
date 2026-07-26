<script lang="ts">
  import { t } from '$lib/i18n';
  import { page as appPage } from '$app/state';
  import { EntityListTable } from '$lib/components/entity-list-table';
  import ChangePasswordDialog from '$lib/components/entity-list-table/dialogs/ChangePasswordDialog.svelte';
  import { apiFetchWithTimeout, ApiDatabaseUnavailableError, ApiUnreachableError } from '$lib/api';
  import { extJsonParse } from '$lib/api-ext';
  import { pushNotification } from '$lib/errors/app-errors';
  import type { AppErrorTag } from '$lib/errors/app-errors';
  import type { EntityListListMeta, ListMetaViewVisibility, MetaColumn, ViewName } from '$lib/entity-list';
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

  type UserProfileMeta = {
    entity: 'user_profiles';
    translationKey?: string;
    titleKey?: string;
    uid: string;
    list: EntityListListMeta;
  };

  type UserProfileListRow = {
    uuid: string;
    idp_code: string;
    display_name: string | null;
    email: string | null;
    is_active: boolean | null;
    is_admin: boolean | null;
    is_verified: boolean | null;
    created_at: string;
    updated_at: string;
    version: number;
    created_by?: string;
    updated_by?: string;
    deleted_at?: string;
    deleted_by?: string;
  } & Record<string, unknown>;

  type ListResponse = {
    rows: UserProfileListRow[];
    page: number;
    page_size: number;
    total: bigint;
  };

  let meta = $state<UserProfileMeta | null>(null);
  let rows = $state<UserProfileListRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Change password dialog state
  let changePasswordOpen = $state(false);
  let changePasswordRow = $state<UserProfileListRow | null>(null);

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
  let deletionFilterMode = $state<'non_deleted' | 'deleted' | 'all'>('non_deleted');

  let datetimeIanaModeByKey = $state<Record<string, 'browser' | 'record'>>({});
  let datetimeIanaRenderTick = $state(0);

  const storageKeyPrefix = 'pb:users:list:';
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
  const defaultSortKey = $derived(meta?.list.defaultSort?.key ?? 'uuid');
  const defaultSortDir = $derived(meta?.list.defaultSort?.dir ?? 'asc');

  // BroadcastChannel for sync with child windows
  const { notifyParentRefresh } = useSyncChannel('primebrick_users_sync', {
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

  const metaCacheKey = '__pbUserProfileMetaCache';
  const metaInFlightKey = '__pbUserProfileMetaInFlight';

  function getMetaCache(): UserProfileMeta | null {
    return ((globalThis as any)[metaCacheKey] ?? null) as UserProfileMeta | null;
  }
  function getMetaInFlight(): Promise<UserProfileMeta> | null {
    return ((globalThis as any)[metaInFlightKey] ?? null) as Promise<UserProfileMeta> | null;
  }
  function setMetaCache(next: UserProfileMeta | null) {
    (globalThis as any)[metaCacheKey] = next;
  }
  function setMetaInFlight(next: Promise<UserProfileMeta> | null) {
    (globalThis as any)[metaInFlightKey] = next;
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
        const metaRes = await apiFetchWithTimeout('/api/v1/entities/user_profiles/meta', undefined, 30_000);
        if (!metaRes.ok) {
          const apiDetails = await readApiErrorDetails(metaRes);
          const code = apiDetails.code ?? 'GET_METADATA_FAILED';
          throw new ApiListError(code, metaRes.status, apiDetails.internalCode ?? undefined, apiDetails.instance ?? undefined);
        }
        const next = (await metaRes.json()) as UserProfileMeta;
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

  class ApiListError extends Error {
    constructor(code: string, status: number, internalCode?: string, instance?: string) {
      super(code);
      this.code = code;
      this.status = status;
      this.internalCode = internalCode;
      this.instance = instance;
    }
    code: string;
    status: number;
    internalCode?: string;
    instance?: string;
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

  async function refreshRows(opts: { clampPage?: boolean } = {}) {
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
      if (deletionFilterMode === 'deleted') {
        params.set('deleted_records', 'ONLY');
      } else if (deletionFilterMode === 'all') {
        params.set('deleted_records', 'INCLUDED');
      } else {
        params.set('deleted_records', 'EXCLUDED');
      }

      const res = await apiFetchWithTimeout(`/api/v1/entities/user_profiles/list?${params.toString()}`, undefined, 30_000);
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
      const apiError = asApiListError(e);
      const isDbDown = apiError?.code === 'DATABASE_UNAVAILABLE';
      if (apiError && isBackendGatewayUnreachable(apiError.code, apiError.status)) {
        error = $t('shell.apiError.unreachable');
        pushNotification({
          impact: 'CRITICAL',
          messageKey: 'shell.serverUnreachable',
          scopeKey: 'errors.scope.usersList',
          tags: backendOfflineTags(apiError.status),
          toast: false
        });
      } else {
        error = $t('shell.apiError.generic');
        const impact = isDbDown ? 'CRITICAL' : 'HIGH';
        const toneForImpact = 'danger';
        const tags: AppErrorTag[] = apiError ? [
          { label: apiError.code, tone: toneForImpact },
          ...(apiError.status !== null ? [{ label: `HTTP ${apiError.status}`, tone: toneForImpact } as const] : []),
        ] : [];
        pushNotification({
          impact,
          messageKey: isDbDown ? 'common.dbUnavailable' : 'common.loadFailed',
          scopeKey: 'errors.scope.usersList',
          tags,
          toast: false
        });
      }
    } finally {
      loading = false;
    }
  }

  let sortRestored = $state(false);

  async function init() {
    try {
      await loadMeta();
      if (!sortRestored) {
        const storedSort = localStorage.getItem(skSort);
        if (storedSort) {
          try {
            const parsed = JSON.parse(storedSort);
            sortKey = parsed.key;
            sortDir = parsed.dir;
            sortRestored = true;
          } catch {
            // ignore parse errors
          }
        }
      }
      const storedVisibleKeys = localStorage.getItem(skVisibleKeys);
      if (storedVisibleKeys) {
        try {
          visibleKeys = JSON.parse(storedVisibleKeys);
          ensureVisibleKeys();
        } catch {
          // ignore parse errors
        }
      }
      const storedSearchInKeys = localStorage.getItem(skSearchInKeys);
      if (storedSearchInKeys) {
        try {
          searchInKeys = JSON.parse(storedSearchInKeys);
        } catch {
          // ignore parse errors
        }
      }
      await refreshRows();
    } catch (e) {
      console.error('Failed to initialize users list:', e);
      error = 'Failed to load users';
    }
  }

  function onSearchInput(v: string) {
    search = v;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      appliedSearch = search;
      page = 1;
      void refreshRows();
    }, 300);
  }

  function onSearchInKeysChange(keys: string[] | null) {
    searchInKeys = keys;
    localStorage.setItem(skSearchInKeys, JSON.stringify(keys));
    if (appliedSearch) {
      page = 1;
      void refreshRows();
    }
  }

  function onSortChange(key: string | null, dir: 'asc' | 'desc') {
    sortKey = key;
    sortDir = dir;
    localStorage.setItem(skSort, JSON.stringify({ key, dir }));
    page = 1;
    void refreshRows({ clampPage: true });
  }

  function onPageChange(p: number) {
    page = p;
    void refreshRows();
  }

  function onPageSizeChange(size: number) {
    pageSize = size;
    page = 1;
    void refreshRows({ clampPage: true });
  }

  function onVisibleKeysChange(keys: string[]) {
    visibleKeys = keys;
    localStorage.setItem(skVisibleKeys, JSON.stringify(keys));
  }

  function onResetColumnVisibility(view: ViewName) {
    visibleKeys = defaultVisibleColumnKeys(columns, view, viewVisibility);
  }

  function onSelectedKeysChange(keys: string[]) {
    selectedKeys = keys;
  }

  function onFilterValuesChange(values: Record<string, any>) {
    filterValues = values;
    page = 1;
    void refreshRows({ clampPage: true });
  }

  function onAdvancedFiltersChange(filters: AdvancedFilter[], connector: 'AND' | 'OR') {
    advancedFilters = filters;
    globalConnector = connector;
    page = 1;
    void refreshRows({ clampPage: true });
  }

  function onResetFilters() {
    filterValues = {};
    advancedFilters = [];
    page = 1;
    void refreshRows({ clampPage: true });
  }

  function onDeletionFilterModeChange(mode: 'non_deleted' | 'deleted' | 'all') {
    deletionFilterMode = mode;
    void refreshRows();
  }

  function openNewUser() {
    const url = '/system/settings/users/create';
    const childWindow = window.open(url, '_blank');
    if (childWindow) {
      childWindow.focus();
    } else {
      alert('Popup bloccato dal browser! Controlla le impostazioni.');
    }
  }

  function openEditUser(row: Record<string, unknown>) {
    const uuid = row.uuid as string;
    const url = `/system/settings/users/${uuid}`;
    const childWindow = window.open(url, '_blank');
    if (childWindow) {
      childWindow.focus();
    } else {
      alert('Popup bloccato dal browser! Controlla le impostazioni.');
    }
  }

  async function onDeleteRow(row: Record<string, unknown>) {
    const uuid = row.uuid as string;
    try {
      const res = await apiFetchWithTimeout(`/api/v1/auth/users/${uuid}`, {
        method: 'DELETE'
      }, 30_000);
      if (!res.ok) {
        const apiDetails = await readApiErrorDetails(res);
        const code = apiDetails.code ?? 'DELETE_FAILED';
        throw new ApiListError(code, res.status, apiDetails.internalCode ?? undefined, apiDetails.instance ?? undefined);
      }
      notifyParentRefresh();
      void refreshRows();
    } catch (err) {
      if (err instanceof ApiListError) {
        pushNotification({
          impact: 'HIGH',
          messageKey: 'common.deleteFailed',
          scopeKey: 'errors.scope.usersList',
          tags: [{ label: err.code, tone: 'danger' }],
          toast: false
        });
      }
    }
  }

  async function onRestoreRow(row: Record<string, unknown>) {
    const uuid = row.uuid as string;
    try {
      const res = await apiFetchWithTimeout(`/api/v1/entities/user_profiles/${uuid}/restore`, {
        method: 'POST'
      }, 30_000);
      if (!res.ok) {
        const apiDetails = await readApiErrorDetails(res);
        const code = apiDetails.code ?? 'RESTORE_FAILED';
        throw new ApiListError(code, res.status, apiDetails.internalCode ?? undefined, apiDetails.instance ?? undefined);
      }
      notifyParentRefresh();
      void refreshRows();
    } catch (err) {
      if (err instanceof ApiListError) {
        pushNotification({
          impact: 'HIGH',
          messageKey: 'common.restoreFailed',
          scopeKey: 'errors.scope.usersList',
          tags: [{ label: err.code, tone: 'danger' }],
          toast: false
        });
      }
    }
  }

  onMount(async () => {
    try {
      await init();
    } catch (err) {
      console.error("Failed to initialize users list:", err);
    } finally {
      loading = false;
    }
  });

  onConnectivityRestored(() => {
    void refreshRows();
  });
</script>

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
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.tabs.users')}</h1>
    </div>
  {/snippet}

  <EntityListTable
    entity="user_profiles"
    translationKey={meta?.translationKey && isSnakeCaseSingular(meta.translationKey) ? meta.translationKey : 'user_profile'}
    bind:datetimeIanaModeByKey
    bind:datetimeIanaRenderTick
    uid={meta?.uid ?? 'uuid'}
    {stickyColumns}
    {dataColumns}
    {auditingColumns}
    columnOrderStorageKey={skColumnOrder}
    columns={columns}
    rowActionsEnabled
    entityRowActions={meta?.list.rowActions}
    customActionHandlers={{
      changePassword: (row: UserProfileListRow) => {
        changePasswordRow = row;
        changePasswordOpen = true;
      },
    }}
    onCreateAction={openNewUser}
    onEditAction={openEditUser}
    defaultSort={meta?.list.defaultSort}
    pageSizeOptions={meta?.list.pageSizeOptions}
    searchPlaceholderKey={meta?.list.searchPlaceholderKey}
    selectionLabelSingularKey="entities.user_profile.singular"
    selectionLabelKey="entities.user_profile.plural"
    rows={rows}
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
    {onDeletionFilterModeChange}
    onRefresh={() => void refreshRows()}
  />

  <ChangePasswordDialog
    bind:open={changePasswordOpen}
    row={changePasswordRow}
    uid={meta?.uid ?? 'uuid'}
  />
</AppPageScaffold>
