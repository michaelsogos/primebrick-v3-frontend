<script lang="ts">
  import { page as appPage } from '$app/state';
  import { t, formatListCellValue } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { EntityListTable } from '$lib/components/entity-list-table';
  import { badgeClassesFromToken } from '$lib/colors/badge';
  import { cn } from '$lib/utils';
  import Plus from '@lucide/svelte/icons/plus';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import FiltersPanel from '$lib/entity-list/sheets/panels/FiltersPanel.svelte';
  import { browser } from '$app/environment';
  import { crmModuleMenuSegment } from '$lib/breadcrumb/crm-breadcrumb';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { onConnectivityRestored } from '$lib/app-connectivity-events';
  import { apiFetchWithTimeout, ApiDatabaseUnavailableError, ApiUnreachableError } from '$lib/api';
  import { extJsonParse } from '$lib/api-ext';
  import { pushNotification } from '$lib/errors/app-errors';
  import type { AppErrorTag } from '$lib/errors/app-errors';
  import type { EntityListListMeta, ListMetaViewVisibility, MetaColumn, ViewName } from '$lib/entity-list';
  import type { AdvancedFilter } from '$lib/entity-list/types';
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
    total: bigint;
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
  let total = $state<bigint>(0n);

  let filtersOpen = $state(false);

  const viewMode: ViewName = 'table';
  const viewVisibility = $derived(meta?.list.viewVisibility);
  let statusFilter = $state<'ACTIVE' | 'INACTIVE' | null>(null);
  
  // Filter values for all filterable columns
  let filterValues = $state<Record<string, any>>({});

  // Advanced filters
  let advancedFilters: AdvancedFilter[] = $state([]);
  let globalConnector: 'AND' | 'OR' = $state('AND');

  let visibleKeys = $state<string[]>([]);

  let selectedKeys = $state<string[]>([]);

  let searchInKeys = $state<string[] | null>(null);

  let deletionFilterMode = $state<'non_deleted' | 'deleted' | 'all'>('non_deleted');

  /** Shared with `EntityListTable` IANA header toggle (required when `{#snippet cell}` overrides defaults). */
  let datetimeIanaModeByKey = $state<Record<string, 'browser' | 'record'>>({});
  let datetimeIanaRenderTick = $state(0);

  const storageKeyPrefix = 'pb:customers:list:';
  const skVisibleKeys = `${storageKeyPrefix}visibleKeys`;
  const skSearchInKeys = `${storageKeyPrefix}searchInKeys`;
  const skColumnOrder = `${storageKeyPrefix}columnOrder`;
  const skSort = `${storageKeyPrefix}sort`;

  const title = $derived(meta?.titleText ?? $t(meta?.titleKey ?? 'entities.customer.title'));
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
      // Only reset sort if not already restored from session storage
      if (!sortRestored && sortKey === null) {
        sortKey = defSort?.key ?? null;
        sortDir = defSort?.dir ?? 'asc';
      }
      pageSize = Number(meta.list.defaultPageSize ?? pageSize);
      ensureVisibleKeys();
      return;
    }
    const inFlight = getMetaInFlight();
    if (inFlight) {
      meta = await inFlight;
      const defSort = meta.list.defaultSort;
      // Only reset sort if not already restored from session storage
      if (!sortRestored && sortKey === null) {
        sortKey = defSort?.key ?? null;
        sortDir = defSort?.dir ?? 'asc';
      }
      pageSize = Number(meta.list.defaultPageSize ?? pageSize);
      ensureVisibleKeys();
      return;
    }

    setMetaInFlight(
      (async () => {
        const metaRes = await apiFetchWithTimeout('/api/v1/entities/customer/meta', undefined, 30_000);
        if (!metaRes.ok) {
          const apiDetails = await readApiErrorDetails(metaRes);
          const code = apiDetails.code ?? 'GET_METADATA_FAILED';
          throw new ApiListError(code, metaRes.status, apiDetails.internalCode ?? undefined, apiDetails.instance ?? undefined);
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
    // Only reset sort if not already restored from session storage
    if (sortKey === null) {
      sortKey = null;
      sortDir = defSort?.dir ?? 'asc';
    }
    pageSize = Number(m.list.defaultPageSize ?? pageSize);
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

      const rawSort = sessionStorage.getItem(skSort);
      if (rawSort) {
        const parsed = JSON.parse(rawSort) as unknown;
        if (parsed && typeof parsed === 'object') {
          const obj = parsed as { key: string | null; dir: 'asc' | 'desc' };
          if (obj.key === null || typeof obj.key === 'string') {
            if (obj.dir === 'asc' || obj.dir === 'desc') {
              sortKey = obj.key;
              sortDir = obj.dir;
              sortRestored = true;
            }
          }
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
      sessionStorage.setItem(skSort, JSON.stringify({ key: sortKey, dir: sortDir }));
    } catch {
      // ignore quota / blocked storage
    }
  }

  let activeListController: AbortController | null = null;
  let bootstrapped = $state(false);

  class ApiListError extends Error {
    readonly status: number;
    readonly code: string;
    readonly internalCode?: string;
    readonly instance?: string;

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
      // Support both legacy format and RFC 7807
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
    // Convert filterValues to backend filters array format using bracket notation
    // Format: filters[0][field]=status&filters[0][op]==&filters[0][value]=ACTIVE
    // For multi-select (badge) fields, values should be in OR among themselves
    // Different fields should be in AND
    let filterIdx = 0;
    for (const [field, value] of Object.entries(filterValues)) {
      if (value !== undefined && value !== null && value !== '') {
        const col = columns.find(c => c.key === field);
        const op = col?.type === 'text' ? 'ILIKE' : '=';

        // Handle multi-select (array) values for badge fields
        if (col?.type === 'badge' && Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            qs.set(`filters[${filterIdx}][field]`, field);
            qs.set(`filters[${filterIdx}][op]`, op);
            qs.set(`filters[${filterIdx}][value]`, String(value[i]));
            // Use OR for values within the same field, AND for the last one to connect to next field
            const connector = i < value.length - 1 ? 'OR' : 'AND';
            qs.set(`filters[${filterIdx}][connector]`, connector);
            filterIdx++;
          }
        } else {
          qs.set(`filters[${filterIdx}][field]`, field);
          qs.set(`filters[${filterIdx}][op]`, op);
          qs.set(`filters[${filterIdx}][value]`, String(value));
          qs.set(`filters[${filterIdx}][connector]`, 'AND');
          filterIdx++;
        }
      }
    }
    // Add advanced filters to the same filters structure
    const advancedFiltersArray = Array.isArray(advancedFilters) ? advancedFilters : [];
    for (const filter of advancedFiltersArray) {
      if (filter.field && filter.value !== undefined && filter.value !== null && filter.value !== '') {
        qs.set(`filters[${filterIdx}][field]`, filter.field);

        let operator: string = filter.operator;
        let value = filter.value;

        // Handle BETWEEN operator with start/end values
        if (operator === 'BETWEEN' && typeof value === 'object' && 'start' in value && 'end' in value) {
          qs.set(`filters[${filterIdx}][op]`, operator);
          qs.set(`filters[${filterIdx}][value][start]`, String(value.start));
          qs.set(`filters[${filterIdx}][value][end]`, String(value.end));
          filterIdx++;
          continue;
        }

        // Map frontend operators to backend-supported operators
        if (Array.isArray(value)) {
          operator = operator === '!=' ? 'NOT IN' : 'IN';
        } else if (operator === 'startsWith') {
          operator = 'ILIKE';
          value = `${value}%`;
        } else if (operator === 'endsWith') {
          operator = 'ILIKE';
          value = `%${value}`;
        } else if (operator === 'contains') {
          operator = 'ILIKE';
          value = `%${value}%`;
        }

        qs.set(`filters[${filterIdx}][op]`, operator);

        // Handle array values for badge fields
        if (Array.isArray(value)) {
          for (const val of value) {
            qs.append(`filters[${filterIdx}][value][]`, String(val));
          }
        } else {
          qs.set(`filters[${filterIdx}][value]`, String(value));
        }

        filterIdx++;
      }
    }

    // Add global connector parameter
    if (advancedFiltersArray.length > 0) {
      qs.set('connector', globalConnector);
    }

    // Add deletion filter parameter
    if (deletionFilterMode === 'deleted') {
      qs.set('deleted_records', 'ONLY');
    } else if (deletionFilterMode === 'all') {
      qs.set('deleted_records', 'INCLUDED');
    }
    // 'non_deleted' is default (EXCLUDED), so no param needed

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
      const apiDetails = await readApiErrorDetails(listRes);
      // Convention: prefer backend-provided error codes; otherwise use a stable enum-style code.
      const code = apiDetails.code ?? 'GET_ENTITY_LIST_FAILED';
      throw new ApiListError(code, listRes.status, apiDetails.internalCode ?? undefined, apiDetails.instance ?? undefined);
    }
    const list = extJsonParse<ListResponse>(await listRes.text());
    rows = list.rows;
    total = list.total;
  }

  async function refreshRows(opts?: { clampPage?: boolean }) {
    // Skip refresh during initial bootstrap; bootstrapCustomersList performs the first loadRows
    // after meta is loaded. This prevents stale-meta calls from filterValues/advancedFilters
    // restoration in EntityListTable.onMount firing while loadMeta() is still pending.
    if (!bootstrapped) return;
    loading = true;
    error = null;
    try {
      await loadRows();
      if (opts?.clampPage) {
        const nextTotalPages = Math.max(1, Math.ceil(Number(total) / pageSize));
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
        pushNotification({
          impact: 'CRITICAL',
          messageKey: 'shell.serverUnreachable',
          scopeKey: 'errors.scope.customersList',
          tags: backendOfflineTags(status),
          toast: false,
        });
        return;
      }

      error = isDbDown ? $t('common.dbUnavailable') : $t('common.loadFailed');
      const impact = isDbDown ? 'CRITICAL' : 'HIGH';
      const toneForImpact = 'danger'; // CRITICAL and HIGH both use danger
      const tags: import('$lib/errors/app-errors').AppErrorTag[] = [
        { label: code, tone: toneForImpact },
        ...(status !== null
          ? [{ label: `HTTP ${status}`, tone: toneForImpact } as const]
          : []),
      ];
      // Add RFC 7807 fields if available from error details
      if (err instanceof ApiListError && err.internalCode) {
        tags.push({ label: err.internalCode, tone: toneForImpact });
      }
      if (err instanceof ApiListError && err.instance) {
        tags.push({ label: err.instance, tone: toneForImpact });
      }
      pushNotification({
        impact: isDbDown ? 'CRITICAL' : 'HIGH',
        messageKey: isDbDown ? 'common.dbUnavailable' : 'common.loadFailed',
        scopeKey: 'errors.scope.customersList',
        tags,
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
      const nextTotalPages = Math.max(1, Math.ceil(Number(total) / pageSize));
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
        pushNotification({
          impact: 'CRITICAL',
          messageKey: 'shell.serverUnreachable',
          scopeKey: 'errors.scope.customersPageInit',
          tags: backendOfflineTags(status),
          toast: false,
        });
        return;
      }

      error = isDbDown ? $t('common.dbUnavailable') : $t('common.loadFailed');
      const impact = isDbDown ? 'CRITICAL' : 'HIGH';
      const toneForImpact = 'danger'; // CRITICAL and HIGH both use danger
      const tags: import('$lib/errors/app-errors').AppErrorTag[] = [
        { label: code, tone: toneForImpact },
        ...(status !== null
          ? [{ label: `HTTP ${status}`, tone: toneForImpact } as const]
          : []),
      ];
      // Add RFC 7807 fields if available from error details
      if (err instanceof ApiListError && err.internalCode) {
        tags.push({ label: err.internalCode, tone: toneForImpact });
      }
      if (err instanceof ApiListError && err.instance) {
        tags.push({ label: err.instance, tone: toneForImpact });
      }
      pushNotification({
        impact: isDbDown ? 'CRITICAL' : 'HIGH',
        messageKey: isDbDown ? 'common.dbUnavailable' : 'common.loadFailed',
        scopeKey: 'errors.scope.customersPageInit',
        tags,
        toast: false,
      });
    } finally {
      loading = false;
      bootstrapped = true;
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
          await refreshRows();
        } else {
          await bootstrapCustomersList();
        }
      })();
    });
  });

  // Keep visibleKeys valid as meta/columns change (without infinite loops).
  $effect(() => {
    if (!columns.length) return;
    const next = sanitizeVisibleKeys(visibleKeys, columns, viewMode, viewVisibility);
    if (!arrayEq(next, visibleKeys)) visibleKeys = next;
  });

  // Persist UI state changes (write-only; never mutates state).
  let sortRestored = $state(false);
  $effect(() => {
    if (!metaLoaded) return;
    // track dependencies
    void visibleKeys;
    void searchInKeys;
    void sortKey;
    void sortDir;
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
    // Only refresh if there's an actual search value
    if (appliedSearch.trim()) {
      page = 1;
      void refreshRows({ clampPage: true });
    }
  }

  function onSortChange(key: string | null, dir: 'asc' | 'desc') {
    sortKey = key;
    sortDir = dir;
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
    statusFilter = null;
    page = 1;
    void refreshRows({ clampPage: true });
  }

  function onDeletionFilterModeChange(mode: 'non_deleted' | 'deleted' | 'all') {
    deletionFilterMode = mode;
    void refreshRows();
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
      entity="customer"
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
      {filterValues}
      onFilterValuesChange={onFilterValuesChange}
      onResetFilters={onResetFilters}
      {advancedFilters}
      onAdvancedFiltersChange={onAdvancedFiltersChange}
      {deletionFilterMode}
      onDeletionFilterModeChange={onDeletionFilterModeChange}
      viewVisibility={viewVisibility}
    >

        </EntityListTable>
</AppPageScaffold>
