import { apiFetch, entityApiBase, serviceApiPrefix } from '$lib/api';
import { pushNotification } from '$lib/errors/app-errors';
import type { RFC7807Error } from '$lib/errors/rfc7807';
import type { MetaColumn, EntityAction, RowCustomAction } from '$lib/entity-list/types';
import { findActionEndpoint, fillActionPath } from '$lib/entity-list';
import type { DeepReadonly } from '@primebrick/ui';

/** Step-up MFA driver shape (useMfaStepUp) — injected by the table so
 *  endpoint-dispatched custom actions transparently pass through the
 *  403 mfa_step_up_required → dialog → retry flow. */
interface MfaStepUpDriver {
  executeWithToken: (
    requestFn: (token: string | null) => Promise<Response>,
    context: { action: string; target_resource: string }
  ) => Promise<Response>;
}

export interface RowActionsOptions<TRow extends Record<string, unknown>> {
  entity: () => string;
  translationKey?: () => string;
  /** Entity-label i18n namespace (`meta.entities_ns`) — forwarded to the version-history sheet. */
  entities_ns?: () => string | undefined;
  uid: () => string;
  columns: () => MetaColumn[];
  /** `meta.actions` — when present, write ops dispatch to their declared
   *  `endpoint` (`{method, path}` from the BE route scan) instead of the
   *  `/api/v1/entities/{entity}` convention. Required for entities whose
   *  write ops live under non-standard prefixes (e.g. `/api/v1/auth/users`). */
  actions?: () => EntityAction[] | undefined;
  onEditAction?: () => ((row: TRow) => void) | undefined;
  onRowActionComplete?: () => void;
  onRowActionError?: (error: Error) => void;
  onRefresh?: () => (() => void) | undefined;
  isRowDeleted?: (row: TRow) => boolean;
  /**
   * When true, row delete targets the hard-delete endpoint
   * `DELETE /entities/{entity}/:uuid/purge?version=` instead of the soft
   * `DELETE /entities/{entity}/:uuid?version=`. Derived from `meta.actions`:
   * `purge.single` enabled ⇒ hard-delete-only entity (e.g. role_mapping).
   */
  usePurgeDelete?: () => boolean;
  rowKey?: (row: TRow) => string;
  onPreviewRow?: (row: TRow) => void;
  closeRowDropdown?: () => void;
  t?: (key: string, params?: Record<string, unknown>) => string;
  customActionHandlers?: () => (Record<string, (row: TRow) => void> | undefined);
  /** Host step-up driver — wraps endpoint-dispatched custom actions. */
  mfaStepUp?: () => MfaStepUpDriver | undefined;
  dialogs?: {
    openDeleteDialog: () => void;
    closeDeleteDialog: () => void;
    openRestoreDialog: () => void;
    closeRestoreDialog: () => void;
    openDuplicateDialog: () => void;
    closeDuplicateDialog: () => void;
    setDuplicateScope: (scope: 'selected' | 'single') => void;
    setRowToDelete: (row: TRow | null) => void;
    setRowToRestore: (row: TRow | null) => void;
    setSingleRowToDuplicate: (row: TRow | null) => void;
  };
}

export function useRowActions<TRow extends Record<string, unknown>>(
  options: RowActionsOptions<TRow>
) {
  const {
    entity: entityFn,
    translationKey: translationKeyFn,
    entities_ns: entitiesNsFn,
    uid: uidFn,
    columns: columnsFn,
    actions: getActions,
    onEditAction: getOnEditAction,
    onRowActionComplete,
    onRowActionError,
    onRefresh: getOnRefresh,
    isRowDeleted,
    usePurgeDelete,
    rowKey,
    onPreviewRow,
    closeRowDropdown,
    dialogs,
    customActionHandlers: getCustomActionHandlers,
    t: tFn = (key: string) => key, // Default fallback
    mfaStepUp: getMfaStepUp
  } = options;

  const _state = $state({
    isDeleting: false,
    isRestoring: false,
    isDuplicating: false,
    rowToDelete: null as TRow | null,
    rowToRestore: null as TRow | null,
    singleRowToDuplicate: null as TRow | null,
    duplicateScope: 'selected' as 'selected' | 'single'
  });

  function handleEditRow(row: TRow) {
    if (isRowDeleted?.(row)) {
      console.log('Cannot edit deleted row:', rowKey?.(row));
      return;
    }
    getOnEditAction?.()?.(row);
    closeRowDropdown?.();
  }

  function handlePreviewRow(row: TRow) {
    onPreviewRow?.(row);
    closeRowDropdown?.();
  }

  function handleDeleteRow(row: TRow) {
    dialogs?.setRowToDelete?.(row);
    dialogs?.openDeleteDialog();
    closeRowDropdown?.();
  }

  function handleRestoreRow(row: TRow) {
    dialogs?.setRowToRestore?.(row);
    dialogs?.openRestoreDialog();
    closeRowDropdown?.();
  }

  function handleDuplicateRow(row: TRow) {
    if (isRowDeleted?.(row)) {
      console.log('Cannot duplicate deleted row:', rowKey?.(row));
      return;
    }
    dialogs?.setSingleRowToDuplicate?.(row);
    dialogs?.setDuplicateScope?.('single');
    dialogs?.openDuplicateDialog();
    closeRowDropdown?.();
  }

  /** Declared endpoint for `op` resolved to a concrete URL for `row` —
   *  falls back to the `/entities/{entity}` convention when absent. */
  function resolveOpUrl(op: string, row: TRow, fallbackSuffix: string): { url: string; method: string } {
    const ep = findActionEndpoint(getActions?.(), op);
    if (ep) {
      return { url: fillActionPath(ep.path, row, uidFn()), method: ep.method };
    }
    return { url: `${entityApiBase(entityFn())}${fallbackSuffix}`, method: '' };
  }

  async function confirmDeleteRowImpl(row: TRow) {
    const uid = uidFn();
    if (!row) return;
    try {
      _state.isDeleting = true;
      const uuidValue = row[uid] as string;
      const purge = usePurgeDelete?.() ? '/purge' : '';
      const { url, method } = resolveOpUrl(
        usePurgeDelete?.() ? 'purge.single' : 'delete.single',
        row,
        `/${uuidValue}${purge}`
      );
      await apiFetch(`${url}?version=${(row as Record<string, unknown>).version}`, {
        method: method || 'DELETE'
      });
      // Refresh the list after successful deletion
      getOnRefresh?.()?.();
      onRowActionComplete?.();
    } catch (error) {
      console.error('Delete failed:', error);
      if (error && typeof error === 'object' && 'title' in error) {
        const err = error as RFC7807Error;
        const rfcError: RFC7807Error = {
          type: err.type || 'about:blank',
          title: err.title || 'Delete failed',
          status: err.status || 500,
          detail: err.detail || 'Unknown error',
          internal_code: err.internal_code,
          instance: err.instance,
          severity: err.severity
        };
        pushNotification(rfcError);
      } else {
        pushNotification({
          impact: 'MEDIUM',
          messageKey: 'system.entities.list.deleteFailed',
          scope: tFn('app.common.errors.scope.deleteApi'),
          detail: error instanceof Error ? error.message : String(error),
          toast: true,
        });
      }
      onRowActionError?.(error as Error);
    } finally {
      _state.isDeleting = false;
    }
  }

  async function confirmRestoreRowImpl(row: TRow) {
    const uid = uidFn();
    if (!row) return;
    try {
      _state.isRestoring = true;
      const uuidValue = row[uid] as string;
      const { url, method } = resolveOpUrl('restore.single', row, `/${uuidValue}/restore`);
      await apiFetch(`${url}?version=${(row as Record<string, unknown>).version}`, {
        method: method || 'POST'
      });
      // Refresh the list after successful restore
      getOnRefresh?.()?.();
      onRowActionComplete?.();
    } catch (error) {
      console.error('Restore failed:', error);
      if (error && typeof error === 'object' && 'title' in error) {
        const err = error as RFC7807Error;
        const rfcError: RFC7807Error = {
          type: err.type || 'about:blank',
          title: err.title || 'Restore failed',
          status: err.status || 500,
          detail: err.detail || 'Unknown error',
          internal_code: err.internal_code,
          instance: err.instance,
          severity: err.severity
        };
        pushNotification(rfcError);
      } else {
        pushNotification({
          impact: 'MEDIUM',
          messageKey: 'system.entities.list.restoreFailed',
          scope: tFn('app.common.errors.scope.restoreApi'),
          detail: error instanceof Error ? error.message : String(error),
          toast: true,
        });
      }
      onRowActionError?.(error as Error);
    } finally {
      _state.isRestoring = false;
    }
  }

  async function confirmDuplicateRowImpl(row: TRow) {
    const uid = uidFn();
    if (!row) return;
    try {
      _state.isDuplicating = true;
      const uuidValue = row[uid] as string;
      const { url, method } = resolveOpUrl('duplicate.bulk', row, '/duplicate');
      const response = await apiFetch(url, {
        method: method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuids: [uuidValue] })
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
      onRowActionComplete?.();
    } catch (error) {
      console.error('Duplicate failed:', error);
      onRowActionError?.(error as Error);
    } finally {
      _state.isDuplicating = false;
    }
  }

  // Wrapper functions that manage dialog state
  async function confirmDeleteRowWrapper() {
    if (!_state.rowToDelete) return;
    await confirmDeleteRowImpl(_state.rowToDelete);
    dialogs?.closeDeleteDialog();
    _state.rowToDelete = null;
  }

  async function confirmRestoreRowWrapper() {
    if (!_state.rowToRestore) return;
    await confirmRestoreRowImpl(_state.rowToRestore);
    dialogs?.closeRestoreDialog();
    _state.rowToRestore = null;
  }

  async function confirmDuplicateWrapper() {
    if (_state.duplicateScope === 'single' && _state.singleRowToDuplicate) {
      await confirmDuplicateRowImpl(_state.singleRowToDuplicate);
    }
    dialogs?.closeDuplicateDialog();
    _state.singleRowToDuplicate = null;
  }

  function cancelDuplicate() {
    dialogs?.closeDuplicateDialog();
    _state.singleRowToDuplicate = null;
  }

  async function loadVersionHistory(row: TRow) {
    const entity = entityFn();
    const translationKey = translationKeyFn?.() ?? entity;
    const uid = uidFn();
    const columns = columnsFn();
    const rowUuid = String((row as Record<string, unknown>)[uid]);
    const { openSheet } = await import('$lib/shell/sheets/sheet-manager.svelte');
    openSheet('entity.versionHistory', {
      entity,
      translationKey,
      entities_ns: entitiesNsFn?.(),
      rowUuid,
      columns
    });
  }

  /**
   * Generic endpoint dispatch for `meta.table.row_custom_actions` — the op
   * is declared in `meta.actions` (`entity_op` on the owning RPC route), so
   * the write rides its declared endpoint instead of a page-side handler.
   * `row_key` binds the row identity into the POST body. Returns false when
   * the op has no declared endpoint (misdeclared meta → 501 toast).
   */
  async function runEndpointAction(action: RowCustomAction, row: TRow): Promise<boolean> {
    const ep = findActionEndpoint(getActions?.(), action.action_name);
    if (!ep) return false;
    const url = serviceApiPrefix(entityFn()) + fillActionPath(ep.path, row, uidFn());
    const body = action.row_key
      ? JSON.stringify({ [action.row_key]: row[action.row_key] })
      : undefined;
    const request = (token: string | null) =>
      apiFetch(url, {
        method: ep.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-MFA-Action-Authorization': token } : {})
        },
        body
      });
    const stepUp = getMfaStepUp?.();
    const res = stepUp
      ? await stepUp.executeWithToken(request, { action: action.action_name, target_resource: entityFn() })
      : await request(null);
    // RFC7807 failures are already surfaced by apiFetch — only refresh+toast
    // on success.
    if (!res.ok) return true;
    getOnRefresh?.()?.();
    onRowActionComplete?.();
    pushNotification({
      impact: 'LOW',
      messageKey: 'app.common.done',
      scope: tFn('app.common.errors.scope.customActionApi'),
      toast: true
    });
    return true;
  }

  async function handleCustomAction(action: RowCustomAction, row: TRow) {
    const handler = getCustomActionHandlers?.()?.[action.action_name];
    if (handler) {
      handler(row);
    } else {
      let dispatched = false;
      try {
        dispatched = await runEndpointAction(action, row);
      } catch (error) {
        console.error('Custom action failed:', error);
        onRowActionError?.(error as Error);
        dispatched = true; // surfaced — don't double-notify with the 501
      }
      if (!dispatched) {
        // No handler and no declared endpoint — the action exists in meta
        // but isn't wired anywhere (contract violation).
        pushNotification({
          type: '/errors/not-implemented',
          title: tFn('app.common.errors.not_implemented.title'),
          status: 501,
          detail: tFn('app.common.errors.not_implemented.detail', { action: action.action_name }),
          instance: `customAction:${action.action_name}`,
          internal_code: 'CUSTOM_ACTION_NO_HANDLER',
          severity: 'LOW',
        });
      }
    }
    closeRowDropdown?.();
  }

  // Keep original function names for backward compatibility, but they now call the impl versions
  async function confirmDeleteRow(row: DeepReadonly<TRow>) {
    await confirmDeleteRowImpl(row as TRow);
  }

  async function confirmRestoreRow(row: DeepReadonly<TRow>) {
    await confirmRestoreRowImpl(row as TRow);
  }

  async function confirmDuplicateRow(row: DeepReadonly<TRow>) {
    await confirmDuplicateRowImpl(row as TRow);
  }

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    handleEditRow,
    handleDeleteRow,
    handleRestoreRow,
    handleDuplicateRow,
    handlePreviewRow,
    confirmDeleteRow,
    confirmRestoreRow,
    confirmDuplicateRow,
    confirmDeleteRowWrapper,
    confirmRestoreRowWrapper,
    confirmDuplicateWrapper,
    cancelDuplicate,
    loadVersionHistory,
    handleCustomAction
  };
}
