/**
 * useEntityList v2 — shared list-state machine for entity-list pages.
 *
 * Encapsulates the canonical (customers) page pattern: meta fetch (cached +
 * in-flight dedup per basePath) → default sort/page-size from meta →
 * server-side list with search/sort/pagination/filters → persistent prefs
 * (sort, visible columns, search scope) in a canonical storage medium with
 * legacy-medium read fallback.
 *
 * Fixes over v1:
 * - `sortRestored` bug: v1 set the flag even when no stored sort existed, so
 *   `meta.table.default_sort` was never applied on fresh profiles.
 * - Sort changes were persisted only incidentally (persistState ran only on
 *   visibleKeys change) — now an $effect writes all tracked prefs.
 * - AbortController on superseded list fetches + `clampPage` on total shrink.
 * - `deleted_records` sent explicitly (EXCLUDED/ONLY/INCLUDED — decision F.2)
 *   when `deletionFilter` is enabled (default), skipped entirely for entities
 *   without soft-delete (pass `deletionFilter: false`, e.g. job entities).
 * - Search gate (≥3 real chars OR escaped wildcard with ≥1 real char) +
 *   configurable debounce (canonical 350 ms).
 * - `bootstrapped` gate: `refreshRows` is a no-op before the first bootstrap
 *   completes, so persisted-filter restoration can't fire stale-meta calls.
 * - Sync-channel receiver + connectivity-restored re-bootstrap options.
 * - AGENTS.md composable contract: consolidated `_state` + `DeepReadonly`
 *   state getter + mutators + derived getters.
 *
 * Usage:
 *   const list = useEntityList({
 *     basePath: '/api/v1/entities/user_profile',
 *     storageKeyPrefix: 'pb:users:list:',
 *     syncChannel: 'primebrick_users_sync',
 *     errorScopeKey: 'app.common.errors.scope.usersList',
 *     t: $t,
 *   });
 *   onMount(() => void list.init());
 */
import { browser } from '$app/environment';
import { SvelteURLSearchParams } from 'svelte/reactivity';
import { apiFetchWithTimeout } from '$lib/api';
import { extJsonParse } from '$lib/api-ext';
import { pushNotification } from '$lib/errors/app-errors';
import type { AppErrorTag } from '$lib/errors/app-errors';
import {
  defaultVisibleColumnKeys,
  orderedColumns,
  sanitizeVisibleKeys,
  searchableTextColumns,
  fetchEntityMeta,
  ApiListError,
  readApiErrorDetails,
  asApiListError,
  isAbortError,
  isBackendGatewayUnreachable,
  backendOfflineTags,
  defaultSearchGate,
  resolvePresetSelection,
  resolvePresetConditions,
  serviceApiBase
} from '$lib/entity-list';
import type { EntityMeta, AdvancedFilter, DeletionFilterMode, ListResponse, FilterCondition } from '$lib/entity-list/types';
import { appendListFilterParams } from '$lib/entity-list/list-filter-params';
import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
import { onConnectivityRestored } from '$lib/app-connectivity-events';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export interface FixedFilter {
  field: string;
  op: string;
  value: string;
}

export type { DeletionFilterMode } from '$lib/entity-list/types';
export type PersistMedium = 'session' | 'local';

export interface UseEntityListOptions<TRow extends Record<string, unknown>> {
  /** Full list/meta base, e.g. `/api/v1/entities/user_profile` or `/ws/job/api/v1/entities/job_schedule`. */
  basePath: string;
  /** Storage prefix for persisted list preferences (e.g. `pb:users:list:`). */
  storageKeyPrefix: string;
  /** Canonical storage medium for prefs — default `session` (per-tab, fits popup workflows). */
  persist?: PersistMedium;
  /** Legacy medium consulted only for reads when the canonical medium lacks
   *  a key — default `local` (migrates users/roles/jobs localStorage prefs
   *  transparently; stale legacy keys are orphaned, never rewritten). */
  legacyPersist?: PersistMedium | null;
  /** Always-on server filters occupying filters[0..n-1] (e.g. schedule_type=recurring). */
  fixedFilters?: FixedFilter[];
  /** Called after every successful rows load — used to enrich rows (sparkline stats). */
  onRowsLoaded?: (rows: TRow[]) => void;
  /** Search gate — default {@link defaultSearchGate}. Receives the trimmed input. */
  searchGate?: (trimmed: string) => boolean;
  /** Search debounce — default 350 ms (canonical). */
  searchDebounceMs?: number;
  /** Own `deletionFilterMode` + send `deleted_records` explicitly — default
   *  true. Pass false for entities without soft-delete (job entities). */
  deletionFilter?: boolean;
  /** Legacy family BroadcastChannel name — receiver mode refreshes rows on
   *  'refresh' messages (child form pages are the senders). */
  syncChannel?: string;
  /** Re-fetch on connectivity-restored — default true (re-bootstrap variant:
   *  full init when meta never loaded, plain refresh otherwise). */
  refetchOnConnectivity?: boolean;
  /** i18n scope key for list-fetch error notifications. */
  errorScopeKey?: string;
  /** i18n scope key for bootstrap-failure notifications — defaults to errorScopeKey. */
  errorScopeKeyInit?: string;
  /** Translate fn for inline error strings — callers pass `$t`. */
  t?: (key: string, params?: Record<string, unknown>) => string;
}

export type { ListResponse };

export function useEntityList<TRow extends Record<string, unknown>>(opts: UseEntityListOptions<TRow>) {
  const tFn = opts.t ?? ((key: string) => key);
  const searchGate = opts.searchGate ?? defaultSearchGate;
  const searchDebounceMs = opts.searchDebounceMs ?? 350;
  const persistMedium: PersistMedium = opts.persist ?? 'session';
  const legacyMedium: PersistMedium | null =
    opts.legacyPersist === undefined ? 'local' : opts.legacyPersist;

  const _state = $state({
    meta: null as EntityMeta | null,
    rows: [] as TRow[],
    loading: true,
    error: null as string | null,

    search: '',
    appliedSearch: '',

    sortKey: null as string | null,
    sortDir: 'asc' as 'asc' | 'desc',

    page: 1,
    pageSize: 25,
    total: 0n as bigint,

    filterValues: {} as Record<string, unknown>,
    advancedFilters: [] as AdvancedFilter[],
    globalConnector: 'AND' as 'AND' | 'OR',
    filtersOpen: false,

    visibleKeys: [] as string[],
    selectedKeys: [] as string[],
    searchInKeys: null as string[] | null,

    deletionFilterMode: 'non_deleted' as DeletionFilterMode,

    /** Active option id per declared filter preset (`preset.id → option.id`). */
    presetSelections: {} as Record<string, string>,
    /** Batch-loaded sparkline buckets: `column.key → {by_key, bucket_unit}`. */
    sparklineData: {} as Record<string, { by_key: Record<string, unknown[]>; bucket_unit?: string }>,

    bootstrapped: false
  });

  const columns = $derived(orderedColumns(_state.meta?.columns));
  const metaLoaded = $derived(!!_state.meta);
  const metaLoading = $derived(!metaLoaded && _state.loading);
  const rowsLoading = $derived(metaLoaded && _state.loading);
  const viewMode = $derived(_state.meta?.table?.default_view ?? 'table');
  const defaultSortKey = $derived(_state.meta?.table?.default_sort?.key ?? null);
  const defaultSortDir = $derived(_state.meta?.table?.default_sort?.dir ?? 'asc' as const);
  const effectiveSearchInKeys = $derived(
    _state.searchInKeys && _state.searchInKeys.length
      ? _state.searchInKeys
      : searchableTextColumns(columns)
          .filter((c) => _state.visibleKeys.includes(c.key))
          .map((c) => c.key)
  );

  const skVisibleKeys = `${opts.storageKeyPrefix}visibleKeys`;
  const skSearchInKeys = `${opts.storageKeyPrefix}searchInKeys`;
  const skColumnOrder = `${opts.storageKeyPrefix}columnOrder`;
  const skSort = `${opts.storageKeyPrefix}sort`;
  // Filter persistence keys follow the historical useFilterPersistence
  // derivation (`${columnOrderStorageKey}:<field>`) so stored filters from
  // the pre-regression era are still picked up.
  const skFilterValues = `${skColumnOrder}:filterValues`;
  const skAdvancedFilters = `${skColumnOrder}:advancedFilters`;
  const skFilterPresets = `${opts.storageKeyPrefix}filterPresets`;

  // ── persistence (canonical medium + legacy read fallback) ────────────

  function medium(m: PersistMedium): Storage {
    return m === 'local' ? window.localStorage : window.sessionStorage;
  }

  function storageGet(key: string): string | null {
    if (!browser) return null;
    try {
      const v = medium(persistMedium).getItem(key);
      if (v !== null) return v;
      if (legacyMedium && legacyMedium !== persistMedium) {
        return medium(legacyMedium).getItem(key);
      }
      return null;
    } catch {
      return null;
    }
  }

  function storageSet(key: string, value: string): void {
    if (!browser) return;
    try {
      medium(persistMedium).setItem(key, value);
    } catch {
      // ignore quota / blocked storage
    }
  }

  let stateRestored = false;
  let sortRestored = false;

  function restorePersistentState() {
    if (stateRestored) return;
    stateRestored = true;
    try {
      const sk = storageGet(skSort);
      if (sk) {
        const parsed = JSON.parse(sk) as { key?: unknown; dir?: unknown };
        if (
          parsed &&
          typeof parsed === 'object' &&
          (parsed.key === null || typeof parsed.key === 'string') &&
          (parsed.dir === 'asc' || parsed.dir === 'desc')
        ) {
          _state.sortKey = parsed.key as string | null;
          _state.sortDir = parsed.dir;
          // Set ONLY when a stored sort was actually applied — v1 set this
          // unconditionally, which suppressed meta.table.default_sort forever.
          sortRestored = true;
        }
      }
      const vk = storageGet(skVisibleKeys);
      if (vk) {
        const parsed = JSON.parse(vk) as unknown;
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
          _state.visibleKeys = parsed;
        }
      }
      const sik = storageGet(skSearchInKeys);
      if (sik) {
        const parsed = JSON.parse(sik) as unknown;
        if (parsed === null || (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string'))) {
          _state.searchInKeys = parsed;
        }
      }
      // Restored filters land in state BEFORE bootstrap — the very first
      // loadRows already ships them (this was the useFilterPersistence
      // feature, silently orphaned by the Phase-10 refactor: rewired here).
      const fv = storageGet(skFilterValues);
      if (fv) {
        const parsed = JSON.parse(fv) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          _state.filterValues = parsed as Record<string, unknown>;
        }
      }
      const af = storageGet(skAdvancedFilters);
      if (af) {
        const parsed = JSON.parse(af) as unknown;
        if (Array.isArray(parsed)) {
          _state.advancedFilters = parsed as AdvancedFilter[];
        }
      }
      const fp = storageGet(skFilterPresets);
      if (fp) {
        const parsed = JSON.parse(fp) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          _state.presetSelections = parsed as Record<string, string>;
        }
      }
    } catch {
      // ignore bad storage payloads
    }
  }

  function persistState() {
    storageSet(skSort, JSON.stringify({ key: _state.sortKey, dir: _state.sortDir }));
    storageSet(skVisibleKeys, JSON.stringify(_state.visibleKeys));
    storageSet(skSearchInKeys, JSON.stringify(_state.searchInKeys));
    storageSet(skFilterValues, JSON.stringify(_state.filterValues));
    storageSet(skAdvancedFilters, JSON.stringify(_state.advancedFilters));
    storageSet(skFilterPresets, JSON.stringify(_state.presetSelections));
  }

  // Persist UI state changes (write-only; gated on meta so restoration-time
  // writes can't clobber stored prefs before they are applied).
  $effect(() => {
    if (!metaLoaded) return;
    void _state.visibleKeys;
    void _state.searchInKeys;
    void _state.sortKey;
    void _state.sortDir;
    void _state.filterValues;
    void _state.advancedFilters;
    void _state.presetSelections;
    persistState();
  });

  // ── fetch pipeline ───────────────────────────────────────────────────

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let activeListController: AbortController | null = null;

  function ensureVisibleKeys() {
    if (_state.visibleKeys.length === 0 && columns.length) {
      _state.visibleKeys = defaultVisibleColumnKeys(columns);
      return;
    }
    if (!columns.length) return;
    _state.visibleKeys = sanitizeVisibleKeys(_state.visibleKeys, columns);
  }

  function applyMetaDefaults() {
    const defSort = _state.meta?.table?.default_sort;
    if (!sortRestored && _state.sortKey === null) {
      _state.sortKey = defSort?.key ?? null;
      _state.sortDir = defSort?.dir ?? 'asc';
    }
    _state.pageSize = _state.meta?.table?.default_page_size ?? _state.pageSize;
    ensureVisibleKeys();
  }

  async function loadMeta() {
    if (_state.meta) return;
    _state.meta = await fetchEntityMeta(opts.basePath);
    applyMetaDefaults();
    // Sanitize persisted selections against the served meta: unknown preset
    // ids are dropped, missing/invalid ones fall back to default_option —
    // a declared preset always resolves to exactly one active option.
    for (const preset of _state.meta?.table?.filter_presets ?? []) {
      _state.presetSelections[preset.id] = resolvePresetSelection(
        preset,
        _state.presetSelections[preset.id]
      );
    }
  }

  async function loadRows() {
    activeListController?.abort();
    const controller = new AbortController();
    activeListController = controller;

    const qs = new SvelteURLSearchParams();
    const applied = _state.appliedSearch.trim();
    if (applied) qs.set('search', applied);
    if (applied && effectiveSearchInKeys.length > 0) {
      qs.set('search_in', effectiveSearchInKeys.join(','));
    }

    // Explicit user sort wins; otherwise the meta default applies (always
    // sent when resolvable — the BE must know the intended order).
    const effSortKey = _state.sortKey ?? defaultSortKey;
    const effSortDir = _state.sortKey ? _state.sortDir : defaultSortDir;
    if (effSortKey) qs.set('sort_key', effSortKey);
    if (effSortKey || _state.sortKey) qs.set('sort_dir', effSortDir);

    qs.set('page', String(_state.page));
    qs.set('page_size', String(_state.pageSize));

    // Fixed scope filters + ACTIVE filter-preset conditions occupy
    // filters[0..n-1] — the preset where ANDs into every call (refresh,
    // pagination, sort, user filters — all combine).
    const scopeConditions: (FixedFilter | FilterCondition)[] = [
      ...(opts.fixedFilters ?? []),
      ...resolvePresetConditions(
        _state.meta?.table?.filter_presets,
        _state.presetSelections
      )
    ];
    let fi = 0;
    for (const f of scopeConditions) {
      qs.set(`filters[${fi}][field]`, f.field);
      qs.set(`filters[${fi}][op]`, f.op);
      if (Array.isArray(f.value)) {
        for (const v of f.value) {
          qs.append(`filters[${fi}][value][]`, String(v));
        }
      } else {
        qs.set(`filters[${fi}][value]`, String(f.value));
      }
      qs.set(`filters[${fi}][connector]`, 'AND');
      fi++;
    }
    appendListFilterParams(
      qs,
      {
        filterValues: _state.filterValues,
        columns,
        advancedFilters: _state.advancedFilters,
        connector: _state.globalConnector
      },
      fi
    );

    // `deleted_records` always explicit (decision F.2) — unless the entity
    // has no soft-delete support (job entities), where the param is skipped.
    if (opts.deletionFilter !== false) {
      qs.set(
        'deleted_records',
        _state.deletionFilterMode === 'deleted'
          ? 'ONLY'
          : _state.deletionFilterMode === 'all'
            ? 'INCLUDED'
            : 'EXCLUDED'
      );
    }

    const res = await apiFetchWithTimeout(`${opts.basePath}/list?${qs.toString()}`, { signal: controller.signal }, 30_000);
    if (!res.ok) {
      const apiDetails = await readApiErrorDetails(res);
      throw new ApiListError(
        apiDetails.code ?? 'LIST_FAILED',
        res.status,
        apiDetails.internalCode ?? undefined,
        apiDetails.instance ?? undefined
      );
    }
    const data = extJsonParse<ListResponse<TRow>>(await res.text());
    _state.rows = data.rows;
    _state.total = data.total;
    // Apply the echoed page/page_size — the BE may clamp out-of-range pages.
    _state.page = Number(data.page);
    _state.pageSize = Number(data.page_size);
    void loadSparklines();
    opts.onRowsLoaded?.(_state.rows);
  }

  /**
   * Batch-fetch the per-row bucket series for every `type:"sparkline"`
   * column — declared in meta, no per-page wiring. One POST per column per
   * load; failures are best-effort (cells render the empty placeholder).
   */
  async function loadSparklines() {
    const cols = (columns ?? []).filter((c) => c.type === 'sparkline' && c.sparkline);
    for (const col of cols) {
      const cfg = col.sparkline!;
      const keys = _state.rows
        .map((r) => r[cfg.row_key])
        .filter((k): k is string => typeof k === 'string' && k.length > 0);
      if (!keys.length) {
        _state.sparklineData[col.key] = { by_key: {} };
        continue;
      }
      try {
        const res = await apiFetchWithTimeout(
          `${serviceApiBase(opts.basePath)}${cfg.endpoint}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ [cfg.request_field]: keys })
          },
          15_000
        );
        if (!res.ok) continue;
        const data = (await res.json()) as Record<string, unknown>;
        const map = data[cfg.response_field ?? 'stats'];
        _state.sparklineData[col.key] = {
          by_key: (map ?? {}) as Record<string, unknown[]>,
          bucket_unit: data[cfg.bucket_unit_field ?? 'bucket_unit'] as string | undefined
        };
      } catch {
        // sparkline is best-effort — the cell renders the empty placeholder
      }
    }
  }

  function handleLoadError(e: unknown, scopeKey: string | undefined) {
    const err = asApiListError(e);
    const code = err?.code ?? (e instanceof Error ? e.message : 'UNKNOWN_ERROR');
    const status = err?.status ?? null;
    const isDbDown = code === 'DATABASE_UNAVAILABLE';

    if (isBackendGatewayUnreachable(code, status)) {
      _state.error = tFn('app.serverUnreachable');
      pushNotification({
        impact: 'CRITICAL',
        messageKey: 'app.serverUnreachable',
        scopeKey,
        tags: backendOfflineTags(status),
        toast: false
      });
      return;
    }

    _state.error = isDbDown ? tFn('app.common.dbUnavailable') : tFn('app.common.loadFailed');
    const tags: AppErrorTag[] = [
      { label: code, tone: 'danger' },
      ...(status !== null ? [{ label: `HTTP ${status}`, tone: 'danger' } as const] : [])
    ];
    if (e instanceof ApiListError && e.internalCode) tags.push({ label: e.internalCode, tone: 'danger' });
    if (e instanceof ApiListError && e.instance) tags.push({ label: e.instance, tone: 'danger' });
    pushNotification({
      impact: isDbDown ? 'CRITICAL' : 'HIGH',
      messageKey: isDbDown ? 'app.common.dbUnavailable' : 'app.common.loadFailed',
      scopeKey,
      tags,
      toast: false
    });
  }

  async function refreshRows(refreshOpts?: { clampPage?: boolean }) {
    // Gate: filter/prefs restoration inside EntityListTable can fire change
    // callbacks while the first bootstrap is still in flight — those must
    // not trigger stale-meta list calls (canonical customers guard).
    if (!_state.bootstrapped) return;
    _state.loading = true;
    _state.error = null;
    try {
      await loadRows();
      if (refreshOpts?.clampPage) {
        const maxPages = Math.max(1, Math.ceil(Number(_state.total) / _state.pageSize));
        if (_state.page > maxPages) {
          _state.page = 1;
          await loadRows();
        }
      }
    } catch (e) {
      if (isAbortError(e)) return;
      handleLoadError(e, opts.errorScopeKey);
    } finally {
      _state.loading = false;
    }
  }

  async function init() {
    _state.loading = true;
    _state.error = null;
    restorePersistentState();
    try {
      // Sequential: if meta fails (gateway/offline), loadRows never runs.
      await loadMeta();
      await loadRows();
      const maxPages = Math.max(1, Math.ceil(Number(_state.total) / _state.pageSize));
      if (_state.page > maxPages) {
        _state.page = 1;
        await loadRows();
      }
    } catch (e) {
      if (!isAbortError(e)) handleLoadError(e, opts.errorScopeKeyInit ?? opts.errorScopeKey);
    } finally {
      _state.loading = false;
      _state.bootstrapped = true;
    }
  }

  // ── channels ─────────────────────────────────────────────────────────

  if (opts.syncChannel) {
    useSyncChannel(opts.syncChannel, {
      mode: 'receiver',
      onRefresh: () => {
        if (_state.bootstrapped) void refreshRows();
      }
    });
  }

  $effect(() => {
    if (!browser || opts.refetchOnConnectivity === false) return;
    // Re-bootstrap variant (canonical): full init when meta never loaded,
    // plain refresh otherwise — connectivity loss may have killed the first
    // bootstrap before meta arrived.
    return onConnectivityRestored(() => {
      void (async () => {
        if (_state.meta) await refreshRows();
        else await init();
      })();
    });
  });

  // ── public surface ───────────────────────────────────────────────────

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as unknown as DeepReadonly<typeof _state>;
    },
    // Prop-facing getters with natural (non-readonly) types — the
    // `DeepReadonly` state getter is the AGENTS-conformant read contract;
    // these exist so list-consuming props (`rows: TRow[]`, `meta.actions`,
    // bindables) get the mutable shapes they declare without boundary casts.
    get meta() {
      return _state.meta;
    },
    get rows() {
      return _state.rows;
    },
    get error() {
      return _state.error;
    },
    get search() {
      return _state.search;
    },
    // get appliedSearch() — read contract kept on `state`; no consumer reads it directly.
    // get appliedSearch() {
    //   return _state.appliedSearch;
    // },
    get sortKey() {
      return _state.sortKey;
    },
    get sortDir() {
      return _state.sortDir;
    },
    get page() {
      return _state.page;
    },
    get pageSize() {
      return _state.pageSize;
    },
    get total() {
      return _state.total;
    },
    get filterValues() {
      return _state.filterValues;
    },
    get advancedFilters() {
      return _state.advancedFilters;
    },
    // get globalConnector() — no external consumer; `_state.globalConnector` stays internal.
    // get globalConnector() {
    //   return _state.globalConnector;
    // },
    get filtersOpen() {
      return _state.filtersOpen;
    },
    get visibleKeys() {
      return _state.visibleKeys;
    },
    get selectedKeys() {
      return _state.selectedKeys;
    },
    get searchInKeys() {
      return _state.searchInKeys;
    },
    get deletionFilterMode() {
      return _state.deletionFilterMode;
    },
    // get bootstrapped() — internal bootstrap flag; no consumer reads it.
    // get bootstrapped() {
    //   return _state.bootstrapped;
    // },
    get columns() {
      return columns;
    },
    // get metaLoaded() — consumers use `meta`/`metaLoading`; no one reads it.
    // get metaLoaded() {
    //   return metaLoaded;
    // },
    get metaLoading() {
      return metaLoading;
    },
    get rowsLoading() {
      return rowsLoading;
    },
    get viewMode() {
      return viewMode;
    },
    /** Declared toolbar filter presets (`meta.table.filter_presets`). */
    get filterPresets() {
      return _state.meta?.table?.filter_presets ?? [];
    },
    /** Active option id per preset — always resolves (default_option fallback). */
    get presetSelections() {
      return _state.presetSelections;
    },
    /** Batch-loaded sparkline buckets keyed `column.key → {by_key, bucket_unit}`. */
    get sparklineData() {
      return _state.sparklineData;
    },
    // get defaultSortKey()/defaultSortDir()/effectiveSearchInKeys() —
    // info getters with zero readers; `state` remains the AGENTS read contract.
    // get defaultSortKey() {
    //   return defaultSortKey;
    // },
    // get defaultSortDir() {
    //   return defaultSortDir;
    // },
    // get effectiveSearchInKeys() {
    //   return effectiveSearchInKeys;
    // },

    init,
    refreshRows,
    // persistState — internal $effect calls it directly; not part of the public surface.

    onPageChange(p: number) {
      _state.page = p;
      void refreshRows();
    },
    onPageSizeChange(ps: number) {
      _state.pageSize = ps;
      _state.page = 1;
      void refreshRows({ clampPage: true });
    },
    onSearchInput(value: string) {
      _state.search = value;
      if (searchTimer) clearTimeout(searchTimer);
      const trimmed = value.trim();
      const shouldReset = trimmed.length === 0;
      const shouldSearch = searchGate(trimmed);
      if (!shouldReset && !shouldSearch) return;
      searchTimer = setTimeout(() => {
        _state.appliedSearch = _state.search.trim();
        _state.page = 1;
        void refreshRows({ clampPage: true });
      }, searchDebounceMs);
    },
    onSearchInKeysChange(keys: string[] | null) {
      _state.searchInKeys = keys;
      if (_state.appliedSearch.trim()) {
        _state.page = 1;
        void refreshRows({ clampPage: true });
      }
    },
    onSortChange(key: string | null, dir: 'asc' | 'desc') {
      _state.sortKey = key;
      _state.sortDir = dir;
      _state.page = 1;
      void refreshRows({ clampPage: true });
    },
    onVisibleKeysChange(keys: string[]) {
      _state.visibleKeys = keys;
    },
    onResetColumnVisibility() {
      if (columns.length) _state.visibleKeys = defaultVisibleColumnKeys(columns);
    },
    onSelectedKeysChange(keys: string[]) {
      _state.selectedKeys = keys;
    },
    onFilterValuesChange(values: Record<string, unknown>) {
      _state.filterValues = values;
      _state.page = 1;
      void refreshRows({ clampPage: true });
    },
    onAdvancedFiltersChange(filters: AdvancedFilter[], connector: 'AND' | 'OR' = 'AND') {
      _state.advancedFilters = filters;
      _state.globalConnector = connector;
      _state.page = 1;
      void refreshRows({ clampPage: true });
    },
    onResetFilters() {
      _state.filterValues = {};
      _state.advancedFilters = [];
      _state.globalConnector = 'AND';
      _state.filtersOpen = false;
      _state.page = 1;
      void refreshRows({ clampPage: true });
    },
    onDeletionFilterModeChange(mode: DeletionFilterMode) {
      _state.deletionFilterMode = mode;
      void refreshRows();
    },
    /** Switch a filter preset's active option — one is always selected;
     *  re-selecting the active option is a no-op. */
    onPresetChange(presetId: string, optionId: string) {
      const preset = (_state.meta?.table?.filter_presets ?? []).find((p) => p.id === presetId);
      if (!preset || !preset.options.some((o) => o.id === optionId)) return;
      if (_state.presetSelections[presetId] === optionId) return;
      _state.presetSelections[presetId] = optionId;
      _state.page = 1;
      void refreshRows({ clampPage: true });
    },
    setFiltersOpen(open: boolean) {
      _state.filtersOpen = open;
    },
    // toggleFilters — superseded by setFiltersOpen; never called.
    // toggleFilters() {
    //   _state.filtersOpen = !_state.filtersOpen;
    // },
    // setRows — external-enrichment hook superseded by the `onRowsLoaded`
    // option; never called.
    // setRows(rows: TRow[]) {
    //   _state.rows = rows;
    // },

    columnOrderStorageKey: skColumnOrder
  };
}

export type EntityListState<TRow extends Record<string, unknown>> = ReturnType<typeof useEntityList<TRow>>;
