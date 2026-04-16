<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import EntityListTable from '$lib/components/EntityListTable.svelte';
  import { badgeClassesFromToken } from '$lib/colors/badge';
  import { Plus } from 'lucide-svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { pushAppError } from '$lib/errors/app-errors';
  import type { EntityListListMeta } from '$lib/entity-list';
  import { defaultVisibleColumnKeys, sanitizeVisibleKeys } from '$lib/entity-list';

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

  const storageKeyPrefix = 'pb:customers:list:';
  const skVisibleKeys = `${storageKeyPrefix}visibleKeys`;
  const skSearchInKeys = `${storageKeyPrefix}searchInKeys`;

  const title = $derived(meta?.titleText ?? $t(meta?.titleKey ?? 'entities.customer.title'));
  const columns = $derived(meta?.list.columns ?? []);
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

  async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 30_000) {
    const timeoutController = new AbortController();
    const tmo = setTimeout(() => timeoutController.abort(), timeoutMs);

    const externalSignal = init?.signal;
    if (externalSignal) {
      if (externalSignal.aborted) timeoutController.abort();
      else externalSignal.addEventListener('abort', () => timeoutController.abort(), { once: true });
    }

    try {
      const res = await fetch(input, { ...init, signal: timeoutController.signal });
      return res;
    } finally {
      clearTimeout(tmo);
    }
  }

  async function loadMeta() {
    const metaRes = await fetchWithTimeout('/api/v1/entities/customer/meta');
    if (!metaRes.ok) throw new Error(`meta failed (${metaRes.status})`);
    meta = (await metaRes.json()) as CustomerMeta;

    const defSort = meta.list.defaultSort;
    sortKey = null;
    sortDir = defSort?.dir ?? 'asc';
    pageSize = meta.list.defaultPageSize ?? pageSize;
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

    const listRes = await fetchWithTimeout(`/api/v1/entities/customer/list?${qs.toString()}`, {
      signal: controller.signal
    });
    if (!listRes.ok) throw new Error(`list failed (${listRes.status})`);
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
      error = $t('common.loadFailed');
      pushAppError({
        message: $t('common.loadFailed'),
        scope: 'Customers list',
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      loading = false;
    }
  }

  let didInit = $state(false);
  $effect(() => {
    if (didInit) return;
    didInit = true;
    (async () => {
      loading = true;
      error = null;
      try {
        tryRestoreListUiStateFromSession();
        await loadMeta();
        await loadRows();
        const nextTotalPages = Math.max(1, Math.ceil(total / pageSize));
        if (page > nextTotalPages) {
          page = 1;
          await loadRows();
        }
      } catch (e) {
        error = $t('common.loadFailed');
        pushAppError({
          message: $t('common.loadFailed'),
          scope: 'Customers page init',
          detail: e instanceof Error ? e.message : String(e),
        });
      } finally {
        loading = false;
      }
    })();
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

  function onSearchInput(v: string) {
    search = v;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      appliedSearch = search;
      page = 1;
      void refreshRows({ clampPage: true });
    }, 350);
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
            {
              label:
                shellNav.modules.find((mod) => mod.id === 'crm')?.name ?? $t('shell.nav.crmFallback')
            }
          ]}
        />
        <h1 class="truncate text-xl font-semibold leading-tight">{title}</h1>
      </div>

      <div class="flex shrink-0 items-center justify-end gap-2">
        <Button href="/customers/new" variant="parallax">
          <Plus class="size-4" />
          {$t('common.new')}
        </Button>
      </div>
    </div>
  {/snippet}

  <EntityListTable
      uid={meta?.uid ?? 'uuid'}
      columns={columns}
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
          <span class={badgeClassesFromToken(cfg?.color ?? null)}>
            {cfg?.labelText ?? $t(cfg?.labelKey ?? `entities.customer.status.${row.status}`)}
          </span>
        {:else}
          {String(row[column.key as keyof CustomerListRow] ?? '')}
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
