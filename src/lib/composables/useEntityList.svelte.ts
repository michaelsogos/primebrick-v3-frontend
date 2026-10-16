/**
 * useEntityList — shared list-state machine for entity-list pages that
 * consume a microservice entity API through the BE `/ws/:service/*` proxy.
 *
 * Encapsulates the roles-page pattern: meta fetch → default sort/page-size
 * from meta → server-side list with search/sort/pagination/filters →
 * persistent sort+visible-column prefs in localStorage.
 *
 * Usage:
 *   const schedules = useEntityList({
 *     basePath: '/ws/job/api/v1/entities/job_schedule',
 *     storageKeyPrefix: 'pb:jobs:schedules:',
 *     fixedFilters: [{ field: 'schedule_type', op: '=', value: 'recurring' }],
 *     onRowsLoaded: (rows) => { ... }
 *   });
 */

import { apiFetchWithTimeout, ApiDatabaseUnavailableError, ApiUnreachableError } from '$lib/api';
import { extJsonParse } from '$lib/api-ext';
import type { EntityMeta } from '$lib/entity-list';
import {
  defaultVisibleColumnKeys,
  orderedColumns,
  sanitizeVisibleKeys,
  searchableTextColumns
} from '$lib/entity-list';
import { appendListFilterParams } from '$lib/entity-list/list-filter-params';
import type { AdvancedFilter } from '$lib/entity-list/types';

export interface FixedFilter {
  field: string;
  op: string;
  value: string;
}

export interface UseEntityListOptions<TRow extends Record<string, unknown>> {
  /** Full list/meta base, e.g. `/ws/job/api/v1/entities/job_schedule`. */
  basePath: string;
  /** localStorage prefix for persisted list preferences. */
  storageKeyPrefix: string;
  /** Always-on server filters (e.g. schedule_type=recurring). */
  fixedFilters?: FixedFilter[];
  /** Called after every successful rows load — used to enrich rows (sparkline stats). */
  onRowsLoaded?: (rows: TRow[]) => void;
}

export interface ListResponse<TRow> {
  rows: TRow[];
  page: number;
  page_size: number;
  total: bigint;
}

export function useEntityList<TRow extends Record<string, unknown>>(opts: UseEntityListOptions<TRow>) {
  let meta = $state<EntityMeta | null>(null);
  let rows = $state<TRow[]>([]);
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

  let filterValues = $state<Record<string, unknown>>({});
  let advancedFilters = $state<AdvancedFilter[]>([]);
  let globalConnector = $state<'AND' | 'OR'>('AND');
  let filtersOpen = $state(false);

  let visibleKeys = $state<string[]>([]);
  let selectedKeys = $state<string[]>([]);
  let searchInKeys = $state<string[] | null>(null);

  let datetimeIanaModeByKey = $state<Record<string, 'browser' | 'record'>>({});
  let datetimeIanaRenderTick = $state(0);

  const columns = $derived(orderedColumns(meta?.columns));
  const metaLoaded = $derived(!!meta);
  const metaLoading = $derived(!metaLoaded && loading);
  const rowsLoading = $derived(metaLoaded && loading);
  const viewMode = $derived(meta?.table?.default_view ?? 'table');

  const effectiveSearchInKeys = $derived(
    searchInKeys && searchInKeys.length
      ? searchInKeys
      : searchableTextColumns(columns)
          .filter((c) => visibleKeys.includes(c.key))
          .map((c) => c.key)
  );

  const skVisibleKeys = `${opts.storageKeyPrefix}visibleKeys`;
  const skSearchInKeys = `${opts.storageKeyPrefix}searchInKeys`;
  const skColumnOrder = `${opts.storageKeyPrefix}columnOrder`;
  const skSort = `${opts.storageKeyPrefix}sort`;

  let sortRestored = false;

  function ensureVisibleKeys() {
    if (visibleKeys.length === 0 && columns.length) {
      visibleKeys = defaultVisibleColumnKeys(columns);
      return;
    }
    if (!columns.length) return;
    visibleKeys = sanitizeVisibleKeys(visibleKeys, columns);
  }

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
      if (sortKey) localStorage.setItem(skSort, JSON.stringify({ key: sortKey, dir: sortDir }));
      if (visibleKeys.length) localStorage.setItem(skVisibleKeys, JSON.stringify(visibleKeys));
      if (searchInKeys) localStorage.setItem(skSearchInKeys, JSON.stringify(searchInKeys));
    } catch {
      // ignore
    }
  }

  function applyMetaDefaults() {
    const defSort = meta?.table?.default_sort;
    if (!sortRestored && sortKey === null) {
      sortKey = defSort?.key ?? null;
      sortDir = defSort?.dir ?? 'asc';
    }
    pageSize = meta?.table?.default_page_size ?? pageSize;
    ensureVisibleKeys();
  }

  async function loadMeta() {
    if (meta) return;
    const res = await apiFetchWithTimeout(`${opts.basePath}/meta`, undefined, 30_000);
    if (!res.ok) throw new Error(`meta failed: ${res.status}`);
    meta = (await res.json()) as EntityMeta;
    applyMetaDefaults();
  }

  async function refreshRows() {
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams();
      if (appliedSearch) params.set('search', appliedSearch);
      if (appliedSearch && effectiveSearchInKeys.length > 0) {
        params.set('search_in', effectiveSearchInKeys.join(','));
      }
      if (sortKey) params.set('sort_key', sortKey);
      if (sortDir) params.set('sort_dir', sortDir);
      params.set('page', page.toString());
      params.set('page_size', pageSize.toString());

      // Fixed scope filters (section split) occupy filters[0..n-1].
      let fi = 0;
      for (const f of opts.fixedFilters ?? []) {
        params.set(`filters[${fi}][field]`, f.field);
        params.set(`filters[${fi}][op]`, f.op);
        params.set(`filters[${fi}][value]`, f.value);
        params.set(`filters[${fi}][connector]`, 'AND');
        fi++;
      }
      appendListFilterParams(
        params,
        { filterValues, columns, advancedFilters, connector: globalConnector },
        fi
      );

      const res = await apiFetchWithTimeout(`${opts.basePath}/list?${params.toString()}`, undefined, 30_000);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string; title?: string } | null;
        throw new Error(data?.error ?? data?.title ?? `list failed: ${res.status}`);
      }
      const data = extJsonParse<ListResponse<TRow>>(await res.text());
      rows = data.rows;
      page = data.page;
      pageSize = data.page_size;
      total = data.total;
      opts.onRowsLoaded?.(rows);
    } catch (e) {
      if (e instanceof ApiDatabaseUnavailableError) error = 'DATABASE_UNAVAILABLE';
      else if (e instanceof ApiUnreachableError) error = 'BACKEND_OFFLINE';
      else if (e instanceof Error) error = e.message;
      else error = 'Unknown error';
    } finally {
      loading = false;
    }
  }

  async function init() {
    restorePersistentState();
    await loadMeta();
    await refreshRows();
  }

  return {
    get meta() { return meta; },
    get rows() { return rows; },
    set rows(v: TRow[]) { rows = v; },
    get loading() { return loading; },
    get error() { return error; },
    get columns() { return columns; },
    get metaLoading() { return metaLoading; },
    get rowsLoading() { return rowsLoading; },
    get viewMode() { return viewMode; },

    get search() { return search; },
    get sortKey() { return sortKey; },
    get sortDir() { return sortDir; },
    get page() { return page; },
    get pageSize() { return pageSize; },
    get total() { return total; },
    get visibleKeys() { return visibleKeys; },
    get selectedKeys() { return selectedKeys; },
    get searchInKeys() { return searchInKeys; },
    get filterValues() { return filterValues; },
    get advancedFilters() { return advancedFilters; },
    get filtersOpen() { return filtersOpen; },
    get datetimeIanaModeByKey() { return datetimeIanaModeByKey; },
    set datetimeIanaModeByKey(v: Record<string, 'browser' | 'record'>) { datetimeIanaModeByKey = v; },
    get datetimeIanaRenderTick() { return datetimeIanaRenderTick; },
    set datetimeIanaRenderTick(v: number) { datetimeIanaRenderTick = v; },

    init,
    refreshRows,

    onPageChange(p: number) { page = p; void refreshRows(); },
    onPageSizeChange(ps: number) { pageSize = ps; page = 1; void refreshRows(); },
    onSearchInput(value: string) {
      search = value;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { appliedSearch = value; page = 1; void refreshRows(); }, 350);
    },
    onSearchInKeysChange(keys: string[] | null) { searchInKeys = keys; page = 1; void refreshRows(); },
    onSortChange(key: string | null, dir: 'asc' | 'desc') { sortKey = key; sortDir = dir; page = 1; void refreshRows(); },
    onVisibleKeysChange(keys: string[]) { visibleKeys = keys; persistState(); },
    onResetColumnVisibility() { if (columns.length) visibleKeys = defaultVisibleColumnKeys(columns); },
    onSelectedKeysChange(keys: string[]) { selectedKeys = keys; },
    onFilterValuesChange(values: Record<string, unknown>) { filterValues = values; page = 1; void refreshRows(); },
    onAdvancedFiltersChange(filters: AdvancedFilter[]) { advancedFilters = filters; page = 1; void refreshRows(); },
    onResetFilters() {
      filterValues = {}; advancedFilters = []; globalConnector = 'AND'; filtersOpen = false;
      page = 1; void refreshRows();
    },
    toggleFilters() { filtersOpen = !filtersOpen; },
    persistState,

    columnOrderStorageKey: skColumnOrder
  };
}

export type EntityListState<TRow extends Record<string, unknown>> = ReturnType<typeof useEntityList<TRow>>;
