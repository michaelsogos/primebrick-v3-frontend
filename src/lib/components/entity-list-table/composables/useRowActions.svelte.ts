import { apiFetch, entityApiBase, serviceApiPrefix } from '$lib/api';
import { pushNotification } from '$lib/errors/app-errors';
import type { RFC7807Error } from '$lib/errors/rfc7807';
import type { MetaColumn, EntityAction, EntityMeta, RowCustomAction } from '$lib/entity-list/types';
import { findActionEndpoint, fillActionPath, runEntityOp } from '$lib/entity-list';
import type { DeepReadonly } from '@primebrick/ui';
import { extJsonParse, extJsonStringify } from '$lib/api-ext';

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
  closeRowDropdown?: () => void;
  t?: (key: string, params?: Record<string, unknown>) => string;
  customActionHandlers?: () => (Record<string, (row: TRow) => void> | undefined);
  dialogs?: {
    openDuplicateDialog: () => void;
    closeDuplicateDialog: () => void;
    setDuplicateScope: (scope: 'selected' | 'single') => void;
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
    closeRowDropdown,
    dialogs,
    customActionHandlers: getCustomActionHandlers,
    t: tFn = (key: string) => key // Default fallback
  } = options;

  const _state = $state({
    isDuplicating: false,
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


  /** Minimal meta the invoker needs — the table carries the fields as
   *  separate getters, not a meta object. */
  function metaForOp(): EntityMeta {
    return { actions: getActions?.(), entities_ns: entitiesNsFn?.(), uid: uidFn() } as EntityMeta;
  }

  function handleDeleteRow(row: TRow) {
    // Hard-delete-only entities (meta.actions: purge.single enabled,
    // delete.single disabled) target `DELETE /:uuid/purge` automatically.
    void runEntityOp({
      op: usePurgeDelete?.() ? 'purge.single' : 'delete.single',
      entity: entityFn(),
      meta: metaForOp(),
      row,
      onDone: () => {
        getOnRefresh?.()?.();
        onRowActionComplete?.();
      }
    }).catch((error) => {
      console.error('Delete failed:', error);
      onRowActionError?.(error as Error);
    });
    closeRowDropdown?.();
  }

  function handleRestoreRow(row: TRow) {
    void runEntityOp({
      op: 'restore.single',
      entity: entityFn(),
      meta: metaForOp(),
      row,
      onDone: () => {
        getOnRefresh?.()?.();
        onRowActionComplete?.();
      }
    }).catch((error) => {
      console.error('Restore failed:', error);
      onRowActionError?.(error as Error);
    });
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
        body: extJsonStringify({ uuids: [uuidValue] })
      });

      if (!response.ok) {
        const errorData = await response.text().then((t) => extJsonParse<any>(t)) as RFC7807Error & { duplicateResults?: { successful: string[]; failed: Array<{ uuid: string; error: string }> } };
        const enhancedError = { ...errorData, duplicateResults: errorData.duplicateResults };
        pushNotification(enhancedError);
        throw enhancedError;
      }

      const result = await response.text().then((t) => extJsonParse<any>(t)) as { uuids: string[]; errors: Array<{ uuid: string; error: string }> };
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
    // Optimistic-lock convention: endpoints that gate on `requireVersionQuery`
    // (suspend/reactivate/restore-style writes) get the caller-observed
    // version exactly like delete/restore do. Endpoints that ignore query
    // params are unaffected.
    const versionQs = row.version !== undefined && row.version !== null ? `?version=${row.version}` : '';
    const url = serviceApiPrefix(entityFn()) + fillActionPath(ep.path, row, uidFn()) + versionQs;
    const body = action.row_key
      ? extJsonStringify({ [action.row_key]: row[action.row_key] })
      : undefined;
    // The governed invoker owns the gate (confirm_key / DELETE method ⇒
    // mandatory anatomy dialog), the step-up wrap, and RFC7807 →
    // notification mapping.
    return runEntityOp({
      op: action.action_name,
      entity: entityFn(),
      meta: metaForOp(),
      row,
      execute: (token) =>
        apiFetch(url, {
          method: ep.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-mfa-action-authorization': token } : {})
          },
          body
        }),
      onDone: () => {
        getOnRefresh?.()?.();
        onRowActionComplete?.();
        pushNotification({
          impact: 'LOW',
          messageKey: 'app.common.done',
          scope: tFn('app.common.errors.scope.custom_action_api'),
          toast: true
        });
      }
    });
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

  async function confirmDuplicateRow(row: DeepReadonly<TRow>) {
    await confirmDuplicateRowImpl(row as TRow);
  }

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    handleEditRow,
    handleDeleteRow,
    handleRestoreRow,
    handleDuplicateRow,
    confirmDuplicateRow,
    confirmDuplicateWrapper,
    cancelDuplicate,
    loadVersionHistory,
    handleCustomAction
  };
}
