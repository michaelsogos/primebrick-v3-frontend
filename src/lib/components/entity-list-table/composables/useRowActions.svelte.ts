import { apiFetch } from '$lib/api';
import { pushImpactError, pushRFC7807Error } from '$lib/errors/app-errors';
import type { RFC7807Error } from '$lib/errors/rfc7807';
import type { MetaColumn } from '$lib/entity-list/types';

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
  dialogs?: {
    openDeleteDialog: () => void;
    closeDeleteDialog: () => void;
    openRestoreDialog: () => void;
    closeRestoreDialog: () => void;
    openDuplicateDialog: () => void;
    closeDuplicateDialog: () => void;
  };
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
  confirmDeleteRowWrapper: () => Promise<void>;
  confirmRestoreRowWrapper: () => Promise<void>;
  confirmDuplicateWrapper: () => Promise<void>;
  cancelDuplicate: () => void;
  loadVersionHistory: (row: TRow) => Promise<void>;
  rowToDelete: TRow | null;
  rowToRestore: TRow | null;
  singleRowToDuplicate: TRow | null;
  duplicateScope: 'selected' | 'single';
  isDeleting: boolean;
  isRestoring: boolean;
  isDuplicating: boolean;
}

export function useRowActions<TRow extends Record<string, unknown>>(
  options: RowActionsOptions<TRow>
): RowActionsReturn<TRow> {
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
    t: tFn = (key: string) => key // Default fallback
  } = options;

  let isDeleting = $state(false);
  let isRestoring = $state(false);
  let isDuplicating = $state(false);

  // Dialog state
  let rowToDelete = $state<TRow | null>(null);
  let rowToRestore = $state<TRow | null>(null);
  let singleRowToDuplicate = $state<TRow | null>(null);
  let duplicateScope = $state<'selected' | 'single'>('selected');

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
    rowToDelete = row;
    dialogs?.openDeleteDialog();
    closeRowDropdown?.();
  }

  function handleRestoreRow(row: TRow) {
    rowToRestore = row;
    dialogs?.openRestoreDialog();
    closeRowDropdown?.();
  }

  function handleDuplicateRow(row: TRow) {
    if (isRowDeleted?.(row)) {
      console.log('Cannot duplicate deleted row:', rowKey?.(row));
      return;
    }
    singleRowToDuplicate = row;
    duplicateScope = 'single';
    dialogs?.openDuplicateDialog();
    closeRowDropdown?.();
  }

  async function confirmDeleteRowImpl(row: TRow) {
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

  async function confirmRestoreRowImpl(row: TRow) {
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

  async function confirmDuplicateRowImpl(row: TRow) {
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

  // Wrapper functions that manage dialog state
  async function confirmDeleteRowWrapper() {
    if (!rowToDelete) return;
    await confirmDeleteRowImpl(rowToDelete);
    dialogs?.closeDeleteDialog();
    rowToDelete = null;
  }

  async function confirmRestoreRowWrapper() {
    if (!rowToRestore) return;
    await confirmRestoreRowImpl(rowToRestore);
    dialogs?.closeRestoreDialog();
    rowToRestore = null;
  }

  async function confirmDuplicateWrapper() {
    if (duplicateScope === 'single' && singleRowToDuplicate) {
      await confirmDuplicateRowImpl(singleRowToDuplicate);
    }
    dialogs?.closeDuplicateDialog();
    singleRowToDuplicate = null;
  }

  function cancelDuplicate() {
    dialogs?.closeDuplicateDialog();
    singleRowToDuplicate = null;
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

  // Keep original function names for backward compatibility, but they now call the impl versions
  async function confirmDeleteRow(row: TRow) {
    await confirmDeleteRowImpl(row);
  }

  async function confirmRestoreRow(row: TRow) {
    await confirmRestoreRowImpl(row);
  }

  async function confirmDuplicateRow(row: TRow) {
    await confirmDuplicateRowImpl(row);
  }

  return {
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
    get rowToDelete() { return rowToDelete; },
    get rowToRestore() { return rowToRestore; },
    get singleRowToDuplicate() { return singleRowToDuplicate; },
    get duplicateScope() { return duplicateScope; },
    get isDeleting() { return isDeleting; },
    get isRestoring() { return isRestoring; },
    get isDuplicating() { return isDuplicating; }
  };
}
