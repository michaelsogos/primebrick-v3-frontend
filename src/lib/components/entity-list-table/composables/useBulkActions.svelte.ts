import { apiFetch, entityApiBase, serviceApiPrefix } from '$lib/api';
import { pushNotification } from '$lib/errors/app-errors';
import type { RFC7807Error } from '$lib/errors/rfc7807';
import type { EntityAction, BulkCustomAction, EntityMeta } from '$lib/entity-list/types';
import { findActionEndpoint, runEntityOp } from '$lib/entity-list';
import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
import { appendListFilterParams } from '$lib/entity-list/list-filter-params';
import type { MetaColumn } from '$lib/entity-list/types';
import type { DeepReadonly } from '@primebrick/ui';
import { extJsonParse, extJsonStringify } from '$lib/api-ext';
import { toDisplayString } from '@primebrick/ui';
import { SvelteURLSearchParams } from 'svelte/reactivity';

export interface BulkActionsOptions {
  entity: () => string;
  /** Owning service for builtin entities — census map is last-wins
   *  ambiguous for them; route context (`decl.module`) threads through
   *  or bulk ops land on the wrong schema. */
  service?: () => string | undefined;
  selectedKeys: () => string[];
  /** `meta.actions` — bulk ops dispatch to their declared `endpoint` when
   *  present instead of the `/api/v1/entities/{entity}` convention. */
  actions?: () => EntityAction[] | undefined;
  /** Resolve a selected key to its row (for the caller-observed `version`). */
  rowByKey?: (key: string) => Record<string, unknown> | undefined;
  /** Row key field (`meta.uid`) — uuid projection for scope=`all`. */
  uid?: () => string;
  /** Entity columns — needed to map `filterValues` to list operators. */
  columns?: () => readonly MetaColumn[];
  /** Current list query state — scope=`all` re-applies them verbatim to
   *  enumerate the matching `uuid+version` set (same wire as `/list`). */
  search?: () => string;
  searchInKeys?: () => string[] | null;
  filterValues?: () => Record<string, unknown>;
  advancedFilters?: () => readonly import('$lib/entity-list/types').AdvancedFilter[];
  /** Entity i18n namespace (`meta.entities_ns`) — dialog copy resolution. */
  entities_ns?: () => string | undefined;
  /** Rows matching the current filters — the 'all' scope count shown by
   *  the bulk dialogs' Choicebox. */
  total?: () => number | bigint;
  onBulkActionStart?: () => void;
  onBulkActionComplete?: () => void;
  onBulkActionError?: (error: Error) => void;
  onSelectionChange?: (keys: string[]) => void;
  onRefresh?: () => () => void;
  onToolbarModeChange?: () => void;
  t?: (key: string, params?: Record<string, unknown>) => string;
  dialogs?: {
    openDuplicateDialog: () => void;
    closeDuplicateDialog: () => void;
  };
  setDuplicateScope?: (scope: 'selected' | 'single') => void;
}

export function useBulkActions(options: BulkActionsOptions) {
  const {
    entity: entityFn,
    service: serviceFn,
    selectedKeys: selectedKeysFn,
    actions: getActions,
    rowByKey,
    uid: uidFn,
    columns: columnsFn,
    search: searchFn,
    searchInKeys: searchInKeysFn,
    filterValues: filterValuesFn,
    advancedFilters: advancedFiltersFn,
    entities_ns: entitiesNsFn,
    total: totalFn,
    onBulkActionStart,
    onBulkActionComplete,
    onBulkActionError,
    onSelectionChange,
    onRefresh: getOnRefresh,
    onToolbarModeChange,
    dialogs,
    setDuplicateScope,
    t: tFn = (key: string) => key // Default fallback
  } = options;

  const _state = $state({
    isDeleting: false,
    isRestoring: false,
    isDuplicating: false,
    /** Bulk scope — 'selected' = checked rows; 'all' = every row matching
     *  the current list filters (enumerated via `/list`, same wire). */
    deleteScope: 'selected' as 'selected' | 'all',
    restoreScope: 'selected' as 'selected' | 'all',
  });

  /**
   * scope='all' — enumerate `{uuid, version}` for EVERY row matching the
   * current list filters (search, quick filters, advanced filters). Rides
   * the same `/list` wire format the table uses, so the affected set is
   * exactly what the user sees. `deleted_records` is forced by the op:
   * delete→EXCLUDED (undeleted rows), restore→ONLY (deleted rows).
   */
  async function enumerateMatchingItems(
    deletedRecords: 'EXCLUDED' | 'ONLY',
  ): Promise<Array<{ uuid: string; version: bigint }>> {
    const uid = uidFn?.() ?? 'uuid';
    const items: Array<{ uuid: string; version: bigint }> = [];
    for (let page = 1; ; page++) {
      const params = new SvelteURLSearchParams();
      params.set('page', String(page));
      params.set('page_size', '200');
      const search = searchFn?.();
      if (search) params.set('search', search);
      const searchInKeys = searchInKeysFn?.();
      if (searchInKeys?.length) params.set('search_in', searchInKeys.join(','));
      appendListFilterParams(params, {
        filterValues: filterValuesFn?.(),
        columns: columnsFn?.(),
        advancedFilters: advancedFiltersFn?.(),
      });
      params.set('deleted_records', deletedRecords);
      const res = await apiFetch(`${entityApiBase(entityFn(), serviceFn?.())}/list?${params.toString()}`);
      if (!res.ok) {
        const data = (await res.text().then((t) => extJsonParse<unknown>(t)).catch(() => null)) as RFC7807Error | null;
        throw { ...(data ?? {}), title: data?.title || 'Bulk scope enumeration failed', status: data?.status || res.status };
      }
      const data = (await res.text().then((t) => extJsonParse<unknown>(t))) as { rows?: Array<Record<string, unknown>>; total?: number | bigint };
      const rows = data.rows ?? [];
      for (const row of rows) items.push({ uuid: toDisplayString(row[uid]), version: row.version as bigint });
      if (rows.length === 0 || items.length >= Number(data.total ?? 0)) break;
    }
    return items;
  }

  /** Declared endpoint for `op` — falls back to the entity convention. */
  function resolveOpUrl(op: string, fallbackSuffix: string): { url: string; method: string } {
    const ep = findActionEndpoint(getActions?.(), op);
    // Declared paths are service-local — `/svc/<svc>` prefix required.
    if (ep) return { url: serviceApiPrefix(entityFn(), serviceFn?.()) + ep.path, method: ep.method };
    return { url: `${entityApiBase(entityFn(), serviceFn?.())}${fallbackSuffix}`, method: '' };
  }

  /** Minimal meta the invoker needs — the table carries the fields as
   *  separate getters, not a meta object. */
  function metaForOp(): EntityMeta {
    return { actions: getActions?.(), entities_ns: entitiesNsFn?.(), uid: uidFn?.() } as EntityMeta;
  }

  /** Selected rows for the bulk dialog's count + the invoker's bulk scope. */
  function selectedRows(): Record<string, unknown>[] {
    return selectedKeysFn()
      .map((k) => rowByKey?.(k))
      .filter((r): r is Record<string, unknown> => r !== undefined);
  }

  const mfaHeader = (token: string | null): Record<string, string> =>
    token ? { 'x-mfa-action-authorization': token } : {};

  function handleBulkDelete() {
    // Fresh scope per open (export precedent): 'selected' when rows are
    // checked, 'all' when the user opens the dialog without a selection.
    _state.deleteScope = selectedKeysFn().length > 0 ? 'selected' : 'all';
    void runEntityOp({
      op: 'delete.bulk',
      entity: entityFn(),
      meta: metaForOp(),
      rows: selectedRows(),
      service: serviceFn?.(),
      scopeChoice: {
        get value() {
          return _state.deleteScope;
        },
        onChange: (v) => {
          _state.deleteScope = v;
        },
      },
      totalCount: totalFn?.() != null ? BigInt(totalFn()!) : undefined,
      execute: async (token) => {
        _state.isDeleting = true;
        onBulkActionStart?.();
        try {
          // {items: [{uuid, version}]} — each record carries the
          // caller-observed version for the optimistic-concurrency guard.
          const items = _state.deleteScope === 'all'
            ? await enumerateMatchingItems('EXCLUDED')
            : selectedKeysFn().map((k) => ({ uuid: k, version: rowByKey?.(k)?.version as number }));
          const { url, method } = resolveOpUrl('delete.bulk', '/bulk-delete');
          return await apiFetch(url, {
            method: method || 'POST',
            headers: { 'Content-Type': 'application/json', ...mfaHeader(token) },
            body: extJsonStringify({ items })
          });
        } finally {
          _state.isDeleting = false;
        }
      },
      onDone: () => {
        onSelectionChange?.([]);
        onToolbarModeChange?.();
        getOnRefresh?.()?.();
        onBulkActionComplete?.();
      },
    }).catch((error) => {
      console.error('Bulk delete failed:', error);
      onBulkActionError?.(error as Error);
    });
  }

  function handleBulkRestore() {
    _state.restoreScope = selectedKeysFn().length > 0 ? 'selected' : 'all';
    void runEntityOp({
      op: 'restore.bulk',
      entity: entityFn(),
      meta: metaForOp(),
      rows: selectedRows(),
      service: serviceFn?.(),
      scopeChoice: {
        get value() {
          return _state.restoreScope;
        },
        onChange: (v) => {
          _state.restoreScope = v;
        },
      },
      totalCount: totalFn?.() != null ? BigInt(totalFn()!) : undefined,
      execute: async (token) => {
        _state.isRestoring = true;
        onBulkActionStart?.();
        try {
          const items = _state.restoreScope === 'all'
            ? await enumerateMatchingItems('ONLY')
            : selectedKeysFn().map((k) => ({ uuid: k, version: rowByKey?.(k)?.version as number }));
          const { url, method } = resolveOpUrl('restore.bulk', '/bulk-restore');
          return await apiFetch(url, {
            method: method || 'POST',
            headers: { 'Content-Type': 'application/json', ...mfaHeader(token) },
            body: extJsonStringify({ items })
          });
        } finally {
          _state.isRestoring = false;
        }
      },
      onDone: () => {
        onSelectionChange?.([]);
        onToolbarModeChange?.();
        getOnRefresh?.()?.();
        onBulkActionComplete?.();
      },
    }).catch((error) => {
      console.error('Bulk restore failed:', error);
      onBulkActionError?.(error as Error);
    });
  }

  function handleBulkDuplicate() {
    if (selectedKeysFn().length > 50) {
      pushNotification({
        impact: 'MEDIUM',
        messageKey: 'system.entities.list.duplicate_max_limit',
        scope: tFn('app.common.errors.scope.duplicate_action'),
        toast: true
      });
      return;
    }
    setDuplicateScope?.('selected');
    dialogs?.openDuplicateDialog();
  }

  async function confirmBulkDuplicateImpl() {
    const selectedKeys = selectedKeysFn();
    try {
      _state.isDuplicating = true;
      onBulkActionStart?.();

      const { url, method } = resolveOpUrl('duplicate.bulk', '/duplicate');
      const response = await apiFetch(url, {
        method: method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: extJsonStringify({ uuids: selectedKeys })
      });

      if (!response.ok) {
        const errorData = await response.text().then((t) => extJsonParse<unknown>(t)) as RFC7807Error & { duplicateResults?: { successful: string[]; failed: Array<{ uuid: string; error: string }> } };
        const enhancedError = { ...errorData, duplicateResults: errorData.duplicateResults };
        pushNotification(enhancedError);
        throw enhancedError;
      }

      const result = await response.text().then((t) => extJsonParse<unknown>(t)) as { uuids: string[]; errors: Array<{ uuid: string; error: string }> };
      if (result.errors.length > 0) {
        pushNotification({
          impact: 'MEDIUM',
          messageKey: 'system.entities.list.duplicate_partial_success',
          messageParams: { count: result.uuids.length, failed: result.errors.length },
          scope: tFn('app.common.errors.scope.duplicate_api')
        });
      } else {
        pushNotification({
          impact: 'LOW',
          messageKey: 'system.entities.list.duplicate_success',
          messageParams: { count: result.uuids.length },
          scope: tFn('app.common.errors.scope.duplicate_api')
        });
      }

      // Refresh the list
      getOnRefresh?.()?.();
      onBulkActionComplete?.();
    } catch (error) {
      console.error('Duplicate failed:', error);
      onBulkActionError?.(error as Error);
    } finally {
      _state.isDuplicating = false;
    }
  }

  async function confirmBulkDuplicateWrapper() {
    await confirmBulkDuplicateImpl();
    dialogs?.closeDuplicateDialog();
  }

  function cancelBulkDuplicate() {
    dialogs?.closeDuplicateDialog();
  }

  /**
   * Dispatch a `meta.table.bulk_custom_actions` CTA — the op endpoint is
   * declared in `meta.actions` (`entity_op` on the owning RPC route).
   * `requires_selection` rows ride as `{uuids}`; `confirm_key`/DELETE
   * ops are confirm-gated by the governed invoker — step-up wraps the
   * call uniformly.
   */
  async function handleBulkCustomAction(action: BulkCustomAction) {
    const ep = findActionEndpoint(getActions?.(), action.action_name);
    if (!ep) {
      pushNotification({
        type: '/errors/not-implemented',
        title: tFn('app.common.errors.not_implemented.title'),
        status: 501,
        detail: tFn('app.common.errors.not_implemented.detail', { action: action.action_name }),
        instance: `bulkCustomAction:${action.action_name}`,
        internal_code: 'CUSTOM_ACTION_NO_ENDPOINT',
        severity: 'LOW',
      });
      return;
    }
    if (action.requires_selection !== false && selectedKeysFn().length === 0) return;
    try {
      const url = serviceApiPrefix(entityFn(), serviceFn?.()) + ep.path;
      const selection = action.requires_selection !== false ? selectedKeysFn() : [];
      await runEntityOp({
        op: action.action_name,
        entity: entityFn(),
        meta: metaForOp(),
        rows: selectedRows(),
        service: serviceFn?.(),
        execute: (token) => {
          onBulkActionStart?.();
          return apiFetch(url, {
            method: ep.method || 'POST',
            headers: { 'Content-Type': 'application/json', ...mfaHeader(token) },
            body: selection.length > 0 ? extJsonStringify({ uuids: selection }) : undefined
          });
        },
        onDone: () => {
          onSelectionChange?.([]);
          onToolbarModeChange?.();
          getOnRefresh?.()?.();
          onBulkActionComplete?.();
          pushNotification({
            impact: 'LOW',
            messageKey: 'app.common.done',
            scope: tFn('app.common.errors.scope.custom_action_api'),
            toast: true
          });
        },
      });
    } catch (error) {
      console.error('Bulk custom action failed:', error);
      onBulkActionError?.(error as Error);
    }
  }

  /**
   * `update.bulk` — the apply-to-all editor sheet. Guard: 1..100 selected
   * rows (the route's own cap). The panel gets a FROZEN snapshot — the
   * "source of truth" its distribution forecast reads — plus the served
   * meta (actions + columns) for the editable partition and the governed
   * submit. Selection-clear + refresh ride `onApplied` like every bulk.
   */
  function handleBulkEdit() {
    const rows = selectedRows();
    if (rows.length < 1 || rows.length > 100) return;
    openSheet('entity.bulkEditor', {
      entity: entityFn(),
      service: serviceFn?.(),
      meta: {
        actions: getActions?.(),
        entities_ns: entitiesNsFn?.(),
        uid: uidFn?.(),
        columns: columnsFn?.() ?? [],
      } as EntityMeta,
      rows,
      onApplied: () => {
        onSelectionChange?.([]);
        onToolbarModeChange?.();
        getOnRefresh?.()?.();
        onBulkActionComplete?.();
      },
    });
  }

  async function confirmBulkDuplicate() {
    await confirmBulkDuplicateImpl();
  }

  function setDeleteScope(scope: 'selected' | 'all') { _state.deleteScope = scope; }
  function setRestoreScope(scope: 'selected' | 'all') { _state.restoreScope = scope; }

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    setDeleteScope,
    setRestoreScope,
    handleBulkDelete,
    handleBulkRestore,
    handleBulkDuplicate,
    confirmBulkDuplicate,
    cancelBulkDuplicate,
    confirmBulkDuplicateWrapper,
    handleBulkCustomAction,
    handleBulkEdit
  };
}
