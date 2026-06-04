import { apiFetch } from '$lib/api';
import { pushImpactError, pushRFC7807Error } from '$lib/errors/app-errors';
import type { RFC7807Error } from '$lib/errors/rfc7807';

export interface RowActionsOptions<TRow extends Record<string, unknown>> {
  entity: () => string;
  uid: () => string;
  onEditAction?: (row: TRow) => void;
  onRowActionComplete?: () => void;
  onRowActionError?: (error: Error) => void;
  onRefresh?: () => void;
  isRowDeleted?: (row: TRow) => boolean;
  rowKey?: (row: TRow) => string;
  onPreviewRow?: (row: TRow) => void;
  closeRowDropdown?: () => void;
  t?: (key: string, params?: Record<string, any>) => string;
}

export interface RowActionsReturn<TRow extends Record<string, unknown>> {
  handleEditRow: (row: TRow) => void;
  handleDeleteRow: (row: TRow) => void;
  handleRestoreRow: (row: TRow) => void;
  handleDuplicateRow: (row: TRow) => void;
  handlePreviewRow: (row: TRow) => void;
  confirmDeleteRow: (row: TRow) => Promise<void>;
  confirmRestoreRow: (row: TRow) => Promise<void>;
  confirmDuplicateRow: (row: TRow) => Promise<void>;
}

export function useRowActions<TRow extends Record<string, unknown>>(
  options: RowActionsOptions<TRow>
): RowActionsReturn<TRow> {
  const {
    entity: entityFn,
    uid: uidFn,
    onEditAction,
    onRowActionComplete,
    onRowActionError,
    onRefresh,
    isRowDeleted,
    rowKey,
    onPreviewRow,
    closeRowDropdown,
    t: tFn = (key: string) => key // Default fallback
  } = options;

  let isDeleting = $state(false);
  let isRestoring = $state(false);
  let isDuplicating = $state(false);

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
    // This just sets the row to delete - dialog state is managed by parent
    closeRowDropdown?.();
  }

  function handleRestoreRow(row: TRow) {
    // This just sets the row to restore - dialog state is managed by parent
    closeRowDropdown?.();
  }

  function handleDuplicateRow(row: TRow) {
    if (isRowDeleted?.(row)) {
      console.log('Cannot duplicate deleted row:', rowKey?.(row));
      return;
    }
    // This just sets the row to duplicate - dialog state is managed by parent
    closeRowDropdown?.();
  }

  async function confirmDeleteRow(row: TRow) {
    const entity = entityFn();
    const uid = uidFn();
    if (!row) return;
    try {
      isDeleting = true;
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
        pushRFC7807Error(rfcError, { showToast: true });
      } else {
        pushImpactError({
          impact: 'MEDIUM',
          messageKey: 'entities.list.deleteFailed',
          scope: tFn('errors.scope.deleteApi'),
          detail: error instanceof Error ? error.message : String(error),
          toast: true,
        });
      }
      onRowActionError?.(error as Error);
    } finally {
      isDeleting = false;
    }
  }

  async function confirmRestoreRow(row: TRow) {
    const entity = entityFn();
    const uid = uidFn();
    if (!row) return;
    try {
      isRestoring = true;
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
        pushRFC7807Error(rfcError, { showToast: true });
      } else {
        pushImpactError({
          impact: 'MEDIUM',
          messageKey: 'entities.list.restoreFailed',
          scope: tFn('errors.scope.restoreApi'),
          detail: error instanceof Error ? error.message : String(error),
          toast: true,
        });
      }
      onRowActionError?.(error as Error);
    } finally {
      isRestoring = false;
    }
  }

  async function confirmDuplicateRow(row: TRow) {
    const entity = entityFn();
    const uid = uidFn();
    if (!row) return;
    try {
      isDuplicating = true;
      const uuidValue = row[uid] as string;
      const response = await apiFetch(`/api/v1/entities/${entity}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuids: [uuidValue] })
      });

      if (!response.ok) {
        const errorData = await response.json() as RFC7807Error & { duplicateResults?: { successful: string[]; failed: Array<{ uuid: string; error: string }> } };
        const enhancedError = { ...errorData, duplicateResults: errorData.duplicateResults };
        pushRFC7807Error(enhancedError, { showToast: true });
        throw enhancedError;
      }

      const result = await response.json() as { uuids: string[]; errors: Array<{ uuid: string; error: string }> };
      if (result.errors.length > 0) {
        pushImpactError({
          impact: 'MEDIUM',
          messageKey: 'entities.list.duplicatePartialSuccess',
          messageParams: { count: result.uuids.length, failed: result.errors.length },
          scope: tFn('errors.scope.duplicateApi')
        });
      } else {
        pushImpactError({
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
      isDuplicating = false;
    }
  }

  return {
    handleEditRow,
    handleDeleteRow,
    handleRestoreRow,
    handleDuplicateRow,
    handlePreviewRow,
    confirmDeleteRow,
    confirmRestoreRow,
    confirmDuplicateRow
  };
}
