import { apiFetch } from '$lib/api';
import { pushNotification } from '$lib/errors/app-errors';
import type { RFC7807Error } from '$lib/errors/rfc7807';
import type { MetaColumn } from '$lib/entity-list/types';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export interface RowActionsOptions<TRow extends Record<string, unknown>> {
  entity: () => string;
  uid: () => string;
  columns: () => MetaColumn[];
  onEditAction?: (row: TRow) => void;
  onRowActionComplete?: () => void;
  onRowActionError?: (error: Error) => void;
  onRefresh?: () => void;
  isRowDeleted?: (row: TRow) => boolean;
  rowKey?: (row: TRow) => string;
  onPreviewRow?: (row: TRow) => void;
  closeRowDropdown?: () => void;
  t?: (key: string, params?: Record<string, any>) => string;
  customActionHandlers?: Record<string, (row: TRow) => void>;
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
    uid: uidFn,
    columns: columnsFn,
    onEditAction,
    onRowActionComplete,
    onRowActionError,
    onRefresh,
    isRowDeleted,
    rowKey,
    onPreviewRow,
    closeRowDropdown,
    dialogs,
    customActionHandlers,
    t: tFn = (key: string) => key // Default fallback
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
    if (onEditAction) {
      onEditAction(row);
    }
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

  async function confirmDeleteRowImpl(row: TRow) {
    const entity = entityFn();
    const uid = uidFn();
    if (!row) return;
    try {
      _state.isDeleting = true;
      const uuidValue = row[uid] as string;
      await apiFetch(`/api/v1/entities/${entity}/${uuidValue}`, {
        method: 'DELETE'
      });
      // Refresh the list after successful deletion
      onRefresh?.();
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
          messageKey: 'entities.list.deleteFailed',
          scope: tFn('errors.scope.deleteApi'),
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
    const entity = entityFn();
    const uid = uidFn();
    if (!row) return;
    try {
      _state.isRestoring = true;
      const uuidValue = row[uid] as string;
      await apiFetch(`/api/v1/entities/${entity}/${uuidValue}/restore`, {
        method: 'POST'
      });
      // Refresh the list after successful restore
      onRefresh?.();
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
          messageKey: 'entities.list.restoreFailed',
          scope: tFn('errors.scope.restoreApi'),
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
    const entity = entityFn();
    const uid = uidFn();
    if (!row) return;
    try {
      _state.isDuplicating = true;
      const uuidValue = row[uid] as string;
      const response = await apiFetch(`/api/v1/entities/${entity}/duplicate`, {
        method: 'POST',
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
          messageKey: 'entities.list.duplicatePartialSuccess',
          messageParams: { count: result.uuids.length, failed: result.errors.length },
          scope: tFn('errors.scope.duplicateApi')
        });
      } else {
        pushNotification({
          impact: 'LOW',
          messageKey: 'entities.list.duplicateSuccess',
          messageParams: { count: result.uuids.length },
          scope: tFn('errors.scope.duplicateApi')
        });
      }

      // Refresh the list
      onRefresh?.();
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
    const uid = uidFn();
    const columns = columnsFn();
    const rowUuid = String((row as Record<string, unknown>)[uid]);
    const { openSheet } = await import('$lib/shell/sheets/sheet-manager.svelte');
    openSheet('entity.versionHistory', {
      entity,
      rowUuid,
      columns
    });
  }

  function handleCustomAction(action: { actionName: string; translationKey: string }, row: TRow) {
    const handler = customActionHandlers?.[action.actionName];
    if (handler) {
      handler(row);
    } else {
      // No handler registered for this action — show a "not implemented"
      // toast so the user sees the action exists but isn't wired yet.
      pushNotification({
        type: '/errors/not-implemented',
        title: tFn('errors.notImplemented.title'),
        status: 501,
        detail: tFn('errors.notImplemented.detail', { action: action.actionName }),
        instance: `customAction:${action.actionName}`,
        internal_code: 'CUSTOM_ACTION_NO_HANDLER',
        severity: 'LOW',
      });
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
