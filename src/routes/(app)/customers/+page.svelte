<script lang="ts">
  import { page as appPage } from '$app/state';
  import { t, formatListCellValue } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import EntityListTable from '$lib/components/EntityListTable.svelte';
  import { badgeClassesFromToken } from '$lib/colors/badge';
  import { cn } from '$lib/utils';
  import { Plus } from 'lucide-svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import { browser } from '$app/environment';
  import { crmModuleMenuSegment } from '$lib/shell/crm-breadcrumb';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { onConnectivityRestored } from '$lib/app-connectivity-events';
  import { apiFetchWithTimeout, ApiDatabaseUnavailableError, ApiUnreachableError } from '$lib/api';
  import { pushImpactError } from '$lib/errors/app-errors';
  import type { AppErrorTag } from '$lib/errors/app-errors';
  import type { EntityListListMeta } from '$lib/entity-list';
  import {
    defaultVisibleColumnKeys,
    formatDatetimeCellDisplay,
    orderedColumnsFromListMeta,
    sanitizeVisibleKeys
  } from '$lib/entity-list';

  type MetaFilter = {
    key: string;
    labelKey: string;
    type: 'enum' | string;
    options?: string[];
  };

  type CustomerMeta = {
    entity: 'customer';
    titleKey?: string;
    titleText?: string;
    /** Column key for stable row identity in the UI (see API `uid`). */
    uid: string;
    list: EntityListListMeta & { filters?: MetaFilter[] };
  };

  type CustomerListRow = {
    uuid: string;
    code: string;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    updated_at: string;
    version: number;
  } & Record<string, unknown>;

  type ListResponse = {
    rows: CustomerListRow[];
    page: number;
    page_size: number;
    total: number;
  };

  let meta = $state<CustomerMeta | null>(null);
  let rows = $state<CustomerListRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let search = $state('');
  let appliedSearch = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  let sortKey = $state<string | null>(null);
  let sortDir = $state<'asc' | 'desc'>('asc');

  let page = $state(1);
  let pageSize = $state(25);
  let total = $state(0);

  let filtersOpen = $state(false);
  let statusFilter = $state<'ACTIVE' | 'INACTIVE' | null>(null);

  let visibleKeys = $state<string[]>([]);

  let selectedKeys = $state<string[]>([]);

  let searchInKeys = $state<string[] | null>(null);

  /** Shared with `EntityListTable` IANA header toggle (required when `{#snippet cell}` overrides defaults). */
  let datetimeIanaModeByKey = $state<Record<string, 'browser' | 'record'>>({});
  let datetimeIanaRenderTick = $state(0);

  const storageKeyPrefix = 'pb:customers:list:';
  const skVisibleKeys = `${storageKeyPrefix}visibleKeys`;
  const skSearchInKeys = `${storageKeyPrefix}searchInKeys`;

  const title = $derived(meta?.titleText ?? $t(meta?.titleKey ?? 'entities.customer.title'));
  const columns = $derived(orderedColumnsFromListMeta(meta?.list));
  const stickyColumns = $derived(meta?.list.stickyColumns ?? []);
  const dataColumns = $derived(meta?.list.stickyColumns || meta?.list.auditingColumns ? (meta?.list.columns ?? []) : []);
  const auditingColumns = $derived(meta?.list.auditingColumns ?? []);
  const metaLoaded = $derived(!!meta);
  const metaLoading = $derived(!metaLoaded && loading);
  const rowsLoading = $derived(metaLoaded && loading);
  const defaultSortKey = $derived(meta?.list.defaultSort?.key ?? 'uuid');
  const defaultSortDir = $derived(meta?.list.defaultSort?.dir ?? 'asc');

  function ensureVisibleKeys() {
    if (visibleKeys.length === 0 && columns.length) {
      visibleKeys = defaultVisibleColumnKeys(columns);
      return;
    }
    if (!columns.length) return;
    visibleKeys = sanitizeVisibleKeys(visibleKeys, columns);
  }

  function arrayEq(a: string[] | null, b: string[] | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // Meta is static UI configuration — avoid refetching or double-fetching.
  // Use globalThis so multiple mounts (dev/HMR) share cache + in-flight promise.
  const metaCacheKey = '__pbCustomerMetaCache';
  const metaInFlightKey = '__pbCustomerMetaInFlight';

  function getMetaCache(): CustomerMeta | null {
    return ((globalThis as any)[metaCacheKey] ?? null) as CustomerMeta | null;
  }
  function getMetaInFlight(): Promise<CustomerMeta> | null {
    return ((globalThis as any)[metaInFlightKey] ?? null) as Promise<CustomerMeta> | null;
  }
  function setMetaCache(next: CustomerMeta | null) {
    (globalThis as any)[metaCacheKey] = next;
  }
  function setMetaInFlight(next: Promise<CustomerMeta> | null) {
    (globalThis as any)[metaInFlightKey] = next;
  }

  async function loadMeta() {
    if (meta) return;
    const cached = getMetaCache();
    if (cached) {
      meta = cached;
      const defSort = meta.list.defaultSort;
      sortKey = null;
      sortDir = defSort?.dir ?? 'asc';
      pageSize = meta.list.defaultPageSize ?? pageSize;
      ensureVisibleKeys();
      return;
    }
    const inFlight = getMetaInFlight();
    if (inFlight) {
      meta = await inFlight;
      const defSort = meta.list.defaultSort;
      sortKey = null;
      sortDir = defSort?.dir ?? 'asc';
      pageSize = meta.list.defaultPageSize ?? pageSize;
      ensureVisibleKeys();
      return;
    }

    setMetaInFlight(
      (async () => {
        const metaRes = await apiFetchWithTimeout('/api/v1/entities/customer/meta', undefined, 30_000);
        if (!metaRes.ok) {
          const apiCode = await readApiErrorCode(metaRes);
          const code = apiCode ?? 'GET_METADATA_FAILED';
          throw new ApiListError(code, metaRes.status);
        }
        const next = (await metaRes.json()) as CustomerMeta;
        setMetaCache(next);
        return next;
      })()
    );

    try {
      const p = getMetaInFlight();
      meta = p ? await p : null;
    } finally {
      setMetaInFlight(null);
    }

    const m = meta as unknown as CustomerMeta | null;
    if (!m) return;
    const defSort = m.list.defaultSort;
    sortKey = null;
    sortDir = defSort?.dir ?? 'asc';
    pageSize = m.list.defaultPageSize ?? pageSize;
    ensureVisibleKeys();
  }

  function tryRestoreListUiStateFromSession() {
    try {
      const rawVisible = sessionStorage.getItem(skVisibleKeys);
      if (rawVisible) {
        const parsed = JSON.parse(rawVisible) as unknown;
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
          visibleKeys = parsed;
        }
      }

      const rawSearchIn = sessionStorage.getItem(skSearchInKeys);
      if (rawSearchIn) {
        const parsed = JSON.parse(rawSearchIn) as unknown;
        if (parsed === null) {
          searchInKeys = null;
        } else if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
          searchInKeys = parsed;
        }
      }
    } catch {
      // ignore bad storage payloads
    }
  }

  function persistListUiStateToSession() {
    try {
      sessionStorage.setItem(skVisibleKeys, JSON.stringify(visibleKeys));
      sessionStorage.setItem(skSearchInKeys, JSON.stringify(searchInKeys));
    } catch {
      // ignore quota / blocked storage
    }
  }

  let activeListController: AbortController | null = null;

  class ApiListError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(code: string, status: number) {
      super(code);
      this.code = code;
      this.status = status;
    }
  }

  async function readApiErrorCode(res: Response): Promise<string | null> {
    try {
      const data = (await res.json()) as { error?: unknown };
      return typeof data?.error === 'string' ? data.error : null;
    } catch {
      return null;
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

  /** Gateway / proxy / network — not application-level DB down (`ApiDatabaseUnavailableError`). */
  function isBackendGatewayUnreachable(code: string, status: number | null): boolean {
    if (code === 'DATABASE_UNAVAILABLE') return false;
    return (
      code === 'BACKEND_OFFLINE' ||
      (status !== null && (status === 502 || status === 503 || status === 504))
    );
  }

  /** When status is unknown (gated), show HTTP 502 as the agreed “proxy/offline” tag. */
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

  async function loadRows() {
    activeListController?.abort();
    const controller = new AbortController();
    activeListController = controller;

    const qs = new URLSearchParams();
    if (appliedSearch.trim()) qs.set('search', appliedSearch.trim());
    if (appliedSearch.trim() && searchInKeys && searchInKeys.length) qs.set('search_in', searchInKeys.join(','));
    if (statusFilter) qs.set('status', statusFilter);
    qs.set('page', String(page));
    qs.set('page_size', String(pageSize));
    const effSortKey = sortKey ?? defaultSortKey;
    const effSortDir = sortKey ? sortDir : defaultSortDir;
    qs.set('sort_key', effSortKey);
    qs.set('sort_dir', effSortDir);

    const listRes = await apiFetchWithTimeout(
      `/api/v1/entities/customer/list?${qs.toString()}`,
      { signal: controller.signal },
      30_000
    );
    if (!listRes.ok) {
      const apiCode = await readApiErrorCode(listRes);
      // Convention: prefer backend-provided error codes; otherwise use a stable enum-style code.
      const code = apiCode ?? 'GET_ENTITY_LIST_FAILED';
      throw new ApiListError(code, listRes.status);
    }
    const list = (await listRes.json()) as ListResponse;
    rows = list.rows;
    total = list.total;
  }

  async function refreshRows(opts?: { clampPage?: boolean }) {
    loading = true;
    error = null;
    try {
      await loadRows();
      if (opts?.clampPage) {
        const nextTotalPages = Math.max(1, Math.ceil(total / pageSize));
        if (page > nextTotalPages) {
          page = 1;
          await loadRows();
        }
      }
    } catch (e) {
      if (isAbortError(e)) return;
      const err = asApiListError(e);
      const code = err?.code ?? (e instanceof Error ? e.message : 'UNKNOWN_ERROR');
      const status = err?.status ?? null;

      const isDbDown = code === 'DATABASE_UNAVAILABLE';
      const isGateway = isBackendGatewayUnreachable(code, status);

      if (isGateway) {
        error = $t('shell.serverUnreachable');
        pushImpactError({
          impact: 'CRITICAL',
          messageKey: 'shell.serverUnreachable',
          scopeKey: 'errors.scope.customersList',
          tags: backendOfflineTags(status),
          toast: false,
        });
        return;
      }

      error = isDbDown ? $t('common.dbUnavailable') : $t('common.loadFailed');
      pushImpactError({
        impact: isDbDown ? 'CRITICAL' : 'HIGH',
        messageKey: isDbDown ? 'common.dbUnavailable' : 'common.loadFailed',
        scopeKey: 'errors.scope.customersList',
        tags: [
          { label: code, tone: isDbDown ? 'danger' : 'warning' },
          ...(status !== null
            ? [{ label: `HTTP ${status}`, tone: status >= 500 ? 'danger' : 'info' } as const]
            : []),
        ],
        toast: false,
      });
    } finally {
      loading = false;
    }
  }

  async function bootstrapCustomersList() {
    loading = true;
    error = null;

    tryRestoreListUiStateFromSession();

    try {
      // Sequential: if meta fails with gateway/offline, loadRows is not called (no second error, no extra fetch).
      await loadMeta();
      await loadRows();
      const nextTotalPages = Math.max(1, Math.ceil(total / pageSize));
      if (page > nextTotalPages) {
        page = 1;
        await loadRows();
      }
    } catch (e) {
      if (isAbortError(e)) return;

      const err = asApiListError(e);
      const code = err?.code ?? (e instanceof Error ? e.message : 'UNKNOWN_ERROR');
      const status = err?.status ?? null;

      const isDbDown = code === 'DATABASE_UNAVAILABLE';
      const isGateway = isBackendGatewayUnreachable(code, status);

      if (isGateway) {
        error = $t('shell.serverUnreachable');
        pushImpactError({
          impact: 'CRITICAL',
          messageKey: 'shell.serverUnreachable',
          scopeKey: 'errors.scope.customersPageInit',
          tags: backendOfflineTags(status),
          toast: false,
        });
        return;
      }

      error = isDbDown ? $t('common.dbUnavailable') : $t('common.loadFailed');
      pushImpactError({
        impact: isDbDown ? 'CRITICAL' : 'HIGH',
        messageKey: isDbDown ? 'common.dbUnavailable' : 'common.loadFailed',
        scopeKey: 'errors.scope.customersPageInit',
        tags: [
          { label: code, tone: isDbDown ? 'danger' : 'warning' },
          ...(status !== null
            ? [{ label: `HTTP ${status}`, tone: status >= 500 ? 'danger' : 'info' } as const]
            : []),
        ],
        toast: false,
      });
    } finally {
      loading = false;
    }
  }

  let didInit = $state(false);
  $effect(() => {
    if (didInit) return;
    didInit = true;
    void bootstrapCustomersList();
  });

  /** After BE/DB recovery: reload list with current filters, or full bootstrap if meta never loaded. */
  $effect(() => {
    if (!browser) return;
    return onConnectivityRestored(() => {
      void (async () => {
        if (meta) {
          await refreshRows({ clampPage: true });
        } else {
          await bootstrapCustomersList();
        }
      })();
    });
  });

  // Keep visibleKeys valid as meta/columns change (without infinite loops).
  $effect(() => {
    if (!columns.length) return;
    const next = sanitizeVisibleKeys(visibleKeys, columns);
    if (!arrayEq(next, visibleKeys)) visibleKeys = next;
  });

  // Persist UI state changes (write-only; never mutates state).
  $effect(() => {
    if (!metaLoaded) return;
    // track dependencies
    void visibleKeys;
    void searchInKeys;
    persistListUiStateToSession();
  });

  /** Mirrors backend list search gate: >=3 “real” chars, or escaped wildcard (`\*` / `\?`) with >=1 real char. */
  function customerSearchShouldQuery(trimmed: string): boolean {
    if (trimmed.length === 0) return false;
    if (trimmed.length >= 3) return true;
    let trueChars = 0;
    let hasEscapedWildcard = false;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i]!;
      const next = trimmed[i + 1];
      if (ch === '\\' && (next === '*' || next === '?')) {
        hasEscapedWildcard = true;
        i++;
        continue;
      }
      if (ch === '\\' && next !== undefined) {
        trueChars++;
        i++;
        continue;
      }
      trueChars++;
    }
    return hasEscapedWildcard && trueChars >= 1;
  }

  function onSearchInput(v: string) {
    search = v;

    if (searchTimer) clearTimeout(searchTimer);

    const trimmed = v.trim();
    const shouldReset = trimmed.length === 0;
    const shouldSearch = customerSearchShouldQuery(trimmed);
    if (!shouldReset && !shouldSearch) return;

    searchTimer = setTimeout(() => {
      appliedSearch = search.trim();
      page = 1;
      void refreshRows({ clampPage: true });
    }, 450);
  }

  function onSearchInKeysChange(keys: string[] | null) {
    searchInKeys = keys;
    page = 1;
    void refreshRows({ clampPage: true });
  }

  function onSortChange(key: string | null, dir: 'asc' | 'desc') {
    sortKey = key;
    sortDir = dir;
    page = 1;
    void refreshRows({ clampPage: true });
  }

  function onPageChange(p: number) {
    page = p;
    void refreshRows({ clampPage: true });
  }

  function onPageSizeChange(size: number) {
    pageSize = size;
    page = 1;
    void refreshRows({ clampPage: true });
  }

  function onVisibleKeysChange(keys: string[]) {
    visibleKeys = keys;
  }

  function onResetColumnVisibility() {
    visibleKeys = defaultVisibleColumnKeys(columns);
  }

  function onSelectedKeysChange(keys: string[]) {
    selectedKeys = keys;
  }
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="flex items-end justify-between gap-3">
      <div class="min-w-0 space-y-1">
        <AppPageBreadcrumb
          segments={[
            crmModuleMenuSegment({
              modules: shellNav.modules,
              pathname: appPage.url.pathname,
              t: (key) => $t(key)
            })
          ]}
        />
        <h1 class="truncate text-xl font-semibold leading-tight">{title}</h1>
      </div>

      <div class="flex shrink-0 items-center justify-end gap-2">
        <Button href="/customers/new">
          <Plus class="size-4" />
          {$t('common.new')}
        </Button>
      </div>
    </div>
  {/snippet}

  <EntityListTable
      bind:datetimeIanaModeByKey
      bind:datetimeIanaRenderTick
      uid={meta?.uid ?? 'uuid'}
      {stickyColumns}
      {dataColumns}
      {auditingColumns}
      columns={columns}
      rowDensity="compact"
      rowActionsEnabled
      defaultSort={meta?.list.defaultSort}
      pageSizeOptions={meta?.list.pageSizeOptions}
      searchPlaceholderKey={meta?.list.searchPlaceholderKey}
      selectionLabelSingularKey="entities.customer.singular"
      selectionLabelKey="entities.customer.plural"
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
      onRefresh={() => refreshRows({ clampPage: true })}
      bind:filtersOpen
    >
      {#snippet cell({ row, column })}
        {#if column.key === 'status'}
          {@const cfg = column.badge?.values?.[row.status]}
          <Badge
            variant="outline"
            class={cn(badgeClassesFromToken(cfg?.color ?? null), 'border-0 shadow-none')}
          >
            {cfg?.labelText ?? $t(cfg?.labelKey ?? `entities.customer.status.${row.status}`)}
          </Badge>
        {:else if column.type === 'datetime' && column.datetimeIanaToggle}
          {@const _ = datetimeIanaRenderTick}
          {@const mode = datetimeIanaModeByKey[column.key] ?? 'browser'}
          {@const parts = formatDatetimeCellDisplay(
            column,
            row as Record<string, unknown>,
            $uiLang,
            mode
          )}
          {#if mode === 'record' && parts.iana}
            <div class="flex min-w-0 flex-col gap-1">
              <span class="min-w-0 truncate">{parts.text}</span>
              <Badge
                variant="outline"
                class="w-fit max-w-full shrink truncate border-amber-300/90 bg-amber-100 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-950 shadow-none dark:border-amber-600/60 dark:bg-amber-950/50 dark:text-amber-100"
              >{parts.iana}</Badge>
            </div>
          {:else}
            <span class="min-w-0 truncate">{parts.text}</span>
          {/if}
        {:else}
          {formatListCellValue(column, row[column.key as keyof CustomerListRow], $uiLang)}
        {/if}
      {/snippet}

      {#snippet filters()}
        <div class="flex h-full flex-col">
          <div class="border-b p-2 sm:p-3">
            <div class="text-base font-semibold">{$t('entities.list.filters')}</div>
            <div class="text-sm text-muted-foreground">{$t('entities.list.filtersHint')}</div>
          </div>

          <div class="flex-1 overflow-auto p-2 sm:p-3">
            <div class="space-y-2">
              <div class="text-sm font-medium">{$t('entities.customer.fields.status')}</div>
              <div class="flex gap-2">
                <Button
                  variant={statusFilter === null ? 'secondary' : 'soft'}
                  size="sm"
                  onclick={() => {
                    statusFilter = null;
                    page = 1;
                    void refreshRows({ clampPage: true });
                  }}
                >
                  {$t('common.all')}
                </Button>
                <Button
                  variant={statusFilter === 'ACTIVE' ? 'secondary' : 'soft'}
                  size="sm"
                  onclick={() => {
                    statusFilter = 'ACTIVE';
                    page = 1;
                    void refreshRows({ clampPage: true });
                  }}
                >
                  {$t('entities.customer.status.active')}
                </Button>
                <Button
                  variant={statusFilter === 'INACTIVE' ? 'secondary' : 'soft'}
                  size="sm"
                  onclick={() => {
                    statusFilter = 'INACTIVE';
                    page = 1;
                    void refreshRows({ clampPage: true });
                  }}
                >
                  {$t('entities.customer.status.inactive')}
                </Button>
              </div>
            </div>
          </div>

          <div class="border-t p-2 sm:p-3">
            <div class="flex items-center justify-end gap-2">
              <Button
                variant="soft"
                onclick={() => {
                  statusFilter = null;
                  page = 1;
                  void refreshRows({ clampPage: true });
                }}
              >
                {$t('common.reset')}
              </Button>
              <Button onclick={() => (filtersOpen = false)}>{$t('common.done')}</Button>
            </div>
          </div>
        </div>
      {/snippet}
  </EntityListTable>
</AppPageScaffold>
