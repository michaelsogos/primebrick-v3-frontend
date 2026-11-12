import { apiFetch, entityApiBase, serviceApiPrefix } from '$lib/api';
import { pushNotification } from '$lib/errors/app-errors';
import type { RFC7807Error } from '$lib/errors/rfc7807';
import type { EntityAction, BulkCustomAction } from '$lib/entity-list/types';
import { findActionEndpoint } from '$lib/entity-list';
import { appendListFilterParams } from '$lib/entity-list/list-filter-params';
import type { MetaColumn } from '$lib/entity-list/types';
import type { DeepReadonly } from '@primebrick/ui';

/** Step-up MFA driver shape (useMfaStepUp) — injected by the table so
 *  endpoint-dispatched bulk actions transparently pass through the
 *  403 mfa_step_up_required → dialog → retry flow. */
interface MfaStepUpDriver {
  executeWithToken: (
    requestFn: (token: string | null) => Promise<Response>,
    context: { action: string; target_resource: string }
  ) => Promise<Response>;
}

export interface BulkActionsOptions {
  entity: () => string;
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
  onBulkActionStart?: () => void;
  onBulkActionComplete?: () => void;
  onBulkActionError?: (error: Error) => void;
  onSelectionChange?: (keys: string[]) => void;
  onRefresh?: () => () => void;
  onToolbarModeChange?: () => void;
  t?: (key: string, params?: Record<string, unknown>) => string;
  dialogs?: {
    openBulkDeleteDialog: () => void;
    closeBulkDeleteDialog: () => void;
    openBulkRestoreDialog: () => void;
    closeBulkRestoreDialog: () => void;
    openDuplicateDialog: () => void;
    closeDuplicateDialog: () => void;
  };
  setDuplicateScope?: (scope: 'selected' | 'single') => void;
  /** Host step-up driver — wraps endpoint-dispatched bulk custom actions. */
  mfaStepUp?: () => MfaStepUpDriver | undefined;
}

export function useBulkActions(options: BulkActionsOptions) {
  const {
    entity: entityFn,
    selectedKeys: selectedKeysFn,
    actions: getActions,
    rowByKey,
    uid: uidFn,
    columns: columnsFn,
    search: searchFn,
    searchInKeys: searchInKeysFn,
    filterValues: filterValuesFn,
    advancedFilters: advancedFiltersFn,
    onBulkActionStart,
    onBulkActionComplete,
    onBulkActionError,
    onSelectionChange,
    onRefresh: getOnRefresh,
    onToolbarModeChange,
    dialogs,
    setDuplicateScope,
    t: tFn = (key: string) => key, // Default fallback
    mfaStepUp: getMfaStepUp
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
  ): Promise<Array<{ uuid: string; version: number }>> {
    const uid = uidFn?.() ?? 'uuid';
    const items: Array<{ uuid: string; version: number }> = [];
    for (let page = 1; ; page++) {
      const params = new URLSearchParams();
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
      const res = await apiFetch(`${entityApiBase(entityFn())}/list?${params.toString()}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as RFC7807Error | null;
        throw { ...(data ?? {}), title: data?.title || 'Bulk scope enumeration failed', status: data?.status || res.status };
      }
      const data = (await res.json()) as { rows?: Array<Record<string, unknown>>; total?: number | bigint };
      const rows = data.rows ?? [];
      for (const row of rows) items.push({ uuid: String(row[uid]), version: row.version as number });
      if (rows.length === 0 || items.length >= Number(data.total ?? 0)) break;
    }
    return items;
  }

  /** Declared endpoint for `op` — falls back to the entity convention. */
  function resolveOpUrl(op: string, fallbackSuffix: string): { url: string; method: string } {
    const ep = findActionEndpoint(getActions?.(), op);
    if (ep) return { url: ep.path, method: ep.method };
    return { url: `${entityApiBase(entityFn())}${fallbackSuffix}`, method: '' };
  }

  function handleBulkDelete() {
    // Fresh scope per open (export precedent): 'selected' when rows are
    // checked, 'all' when the user opens the dialog without a selection.
    _state.deleteScope = selectedKeysFn().length > 0 ? 'selected' : 'all';
    dialogs?.openBulkDeleteDialog();
  }

  async function confirmBulkDeleteImpl() {
    const selectedKeys = selectedKeysFn();
    if (_state.deleteScope === 'selected' && selectedKeys.length === 0) return;
    try {
      _state.isDeleting = true;
      onBulkActionStart?.();

      // {items: [{uuid, version}]} — each record carries the caller-observed
      // version for the per-row optimistic-concurrency guard.
      const items = _state.deleteScope === 'all'
        ? await enumerateMatchingItems('EXCLUDED')
        : selectedKeys.map((k) => {
        const row = rowByKey?.(k);
        return { uuid: k, version: row?.version as number };
      });
      const { url, method } = resolveOpUrl('delete.bulk', '/bulk-delete');
      const res = await apiFetch(url, {
        method: method || 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items })
      });

      if (!res.ok) {
        // Propagate the RFC 7807 body verbatim — `extra.issues` carries the
        // per-row bulk detail (≤10 offenders) rendered by RfcErrorDialog.
        const data = (await res.json().catch(() => null)) as RFC7807Error & Record<string, unknown> | null;
        throw {
          type: 'about:blank',
          toneForImpact: 'danger',
          ...(data ?? {}),
          title: data?.title || 'Bulk delete failed',
          status: data?.status || res.status,
          detail: data?.detail || 'Unknown error',
        };
      }

      // 200 {received, affected} — success toast via the shell (no event card)
      const result = (await res.json().catch(() => null)) as { received?: number; affected?: number } | null;
      pushNotification({
        impact: 'NONE',
        messageKey: 'app.common.delete_success',
        messageParams: { count: result?.affected ?? items.length },
        scope: tFn('app.common.errors.scope.bulk_delete_api'),
      });

      // Clear selection after successful deletion
      onSelectionChange?.([]);
      // Switch back to filters mode
      onToolbarModeChange?.();
      // Refresh the list after successful deletion
      getOnRefresh?.()?.();
      onBulkActionComplete?.();
    } catch (error) {
      console.error('Bulk delete failed:', error);

      if (error && typeof error === 'object' && 'title' in error) {
        const err = error as RFC7807Error;
        pushNotification(err);
      } else {
        pushNotification({
          impact: 'MEDIUM',
          messageKey: 'system.entities.list.bulk_delete_failed',
          scope: tFn('app.common.errors.scope.bulk_delete_api'),
          detail: error instanceof Error ? error.message : String(error),
          toast: true,
        });
      }
      onBulkActionError?.(error as Error);
    } finally {
      _state.isDeleting = false;
    }
  }

  async function confirmBulkDeleteWrapper() {
    await confirmBulkDeleteImpl();
    dialogs?.closeBulkDeleteDialog();
  }

  function cancelBulkDelete() {
    dialogs?.closeBulkDeleteDialog();
  }

  function handleBulkRestore() {
    _state.restoreScope = selectedKeysFn().length > 0 ? 'selected' : 'all';
    dialogs?.openBulkRestoreDialog();
  }

  async function confirmBulkRestoreImpl() {
    const selectedKeys = selectedKeysFn();
    if (_state.restoreScope === 'selected' && selectedKeys.length === 0) return;
    try {
      _state.isRestoring = true;
      onBulkActionStart?.();

      const items = _state.restoreScope === 'all'
        ? await enumerateMatchingItems('ONLY')
        : selectedKeys.map((k) => {
        const row = rowByKey?.(k);
        return { uuid: k, version: row?.version as number };
      });
      const { url, method } = resolveOpUrl('restore.bulk', '/bulk-restore');
      const res = await apiFetch(url, {
        method: method || 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items })
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as RFC7807Error & Record<string, unknown> | null;
        throw {
          type: 'about:blank',
          toneForImpact: 'warning',
          ...(data ?? {}),
          title: data?.title || 'Bulk restore failed',
          status: data?.status || res.status,
          detail: data?.detail || 'Unknown error',
        };
      }

      const result = (await res.json().catch(() => null)) as { received?: number; affected?: number } | null;
      pushNotification({
        impact: 'NONE',
        messageKey: 'system.entities.version_history.record_restored',
        messageParams: { count: result?.affected ?? items.length },
        scope: tFn('app.common.errors.scope.bulkRestoreApi'),
      });

      // Clear selection after successful restore
      onSelectionChange?.([]);
      // Switch back to filters mode
      onToolbarModeChange?.();
      // Refresh the list after successful restore
      getOnRefresh?.()?.();
      onBulkActionComplete?.();
    } catch (error) {
      console.error('Bulk restore failed:', error);

      if (error && typeof error === 'object' && 'title' in error) {
        const err = error as RFC7807Error;
        pushNotification(err);
      } else {
        pushNotification({
          impact: 'MEDIUM',
          messageKey: 'system.entities.list.bulk_restore_failed',
          scope: tFn('app.common.errors.scope.bulkRestoreApi'),
          detail: error instanceof Error ? error.message : String(error),
          toast: true,
        });
      }
      onBulkActionError?.(error as Error);
    } finally {
      _state.isRestoring = false;
    }
  }

  async function confirmBulkRestoreWrapper() {
    await confirmBulkRestoreImpl();
    dialogs?.closeBulkRestoreDialog();
  }

  function cancelBulkRestore() {
    dialogs?.closeBulkRestoreDialog();
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
        body: JSON.stringify({ uuids: selectedKeys })
      });

      if (!response.ok) {
        const errorData = await response.json() as RFC7807Error & { duplicateResults?: { successful: string[]; failed: Array<{ uuid: string; error: string }> } };
        const enhancedError = { ...errorData, duplicateResults: errorData.duplicateResults };
        pushNotification(enhancedError);
        throw enhancedError;
      }

      const result = await response.json() as { uuids: string[]; errors: Array<{ uuid: string; error: string }> };
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
   * `requires_selection` rows ride as `{uuids}`; `confirm_key` gates on a
   * browser confirm; step-up wraps the call when the BE asks for it.
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
    if (action.confirm_key && !confirm(tFn(action.confirm_key))) return;
    try {
      onBulkActionStart?.();
      const url = serviceApiPrefix(entityFn()) + ep.path;
      const selection = action.requires_selection !== false ? selectedKeysFn() : [];
      const request = (token: string | null) =>
        apiFetch(url, {
          method: ep.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'X-MFA-Action-Authorization': token } : {})
          },
          body: selection.length > 0 ? JSON.stringify({ uuids: selection }) : undefined
        });
      const stepUp = getMfaStepUp?.();
      const res = stepUp
        ? await stepUp.executeWithToken(request, { action: action.action_name, target_resource: entityFn() })
        : await request(null);
      if (!res.ok) return; // RFC7807 already surfaced by apiFetch
      onSelectionChange?.([]);
      onToolbarModeChange?.();
      getOnRefresh?.()?.();
      onBulkActionComplete?.();
      pushNotification({
        impact: 'LOW',
        messageKey: 'app.common.done',
        scope: tFn('app.common.errors.scope.customActionApi'),
        toast: true
      });
    } catch (error) {
      console.error('Bulk custom action failed:', error);
      onBulkActionError?.(error as Error);
    }
  }

  // Keep original function names for backward compatibility
  async function confirmBulkDelete() {
    await confirmBulkDeleteImpl();
  }

  async function confirmBulkRestore() {
    await confirmBulkRestoreImpl();
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
    confirmBulkDelete,
    cancelBulkDelete,
    handleBulkRestore,
    confirmBulkRestore,
    cancelBulkRestore,
    handleBulkDuplicate,
    confirmBulkDuplicate,
    cancelBulkDuplicate,
    confirmBulkDeleteWrapper,
    confirmBulkRestoreWrapper,
    confirmBulkDuplicateWrapper,
    handleBulkCustomAction
  };
}
