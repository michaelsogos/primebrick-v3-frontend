import { apiFetch } from '$lib/api';
import { pushNotification } from '$lib/errors/app-errors';
import type { RFC7807Error } from '$lib/errors/rfc7807';
import type { DeepReadonly } from '$lib/types/deep-readonly';

export interface BulkActionsOptions {
  entity: () => string;
  selectedKeys: () => string[];
  onBulkActionStart?: () => void;
  onBulkActionComplete?: () => void;
  onBulkActionError?: (error: Error) => void;
  onSelectionChange?: (keys: string[]) => void;
  onRefresh?: () => () => void;
  onToolbarModeChange?: () => void;
  t?: (key: string, params?: Record<string, any>) => string;
  dialogs?: {
    openBulkDeleteDialog: () => void;
    closeBulkDeleteDialog: () => void;
    openBulkRestoreDialog: () => void;
    closeBulkRestoreDialog: () => void;
    openDuplicateDialog: () => void;
    closeDuplicateDialog: () => void;
  };
  setDuplicateScope?: (scope: 'selected' | 'single') => void;
}

export function useBulkActions(options: BulkActionsOptions) {
  const {
    entity: entityFn,
    selectedKeys: selectedKeysFn,
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

  const _state = $state({ isDeleting: false, isRestoring: false, isDuplicating: false });

  function handleBulkDelete() {
    dialogs?.openBulkDeleteDialog();
  }

  async function confirmBulkDeleteImpl() {
    const entity = entityFn();
    const selectedKeys = selectedKeysFn();
    if (selectedKeys.length === 0) return;
    try {
      _state.isDeleting = true;
      onBulkActionStart?.();

      const res = await apiFetch(`/api/v1/entities/${entity}/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uuids: selectedKeys })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ title: 'Unknown error', status: res.status, detail: 'Unknown error' })) as {
          title?: string;
          status?: number;
          detail?: string;
          instance?: string;
          internal_code?: string;
        };

        const toneForImpact = 'danger';
        throw {
          type: 'about:blank',
          title: data.title || 'Bulk delete failed',
          status: data.status || res.status,
          detail: data.detail || 'Unknown error',
          instance: data.instance,
          internal_code: data.internal_code,
          toneForImpact
        };
      }

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
          messageKey: 'system.entities.list.bulkDeleteFailed',
          scope: tFn('app.common.errors.scope.bulkDeleteApi'),
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
    dialogs?.openBulkRestoreDialog();
  }

  async function confirmBulkRestoreImpl() {
    const entity = entityFn();
    const selectedKeys = selectedKeysFn();
    if (selectedKeys.length === 0) return;
    try {
      _state.isRestoring = true;
      onBulkActionStart?.();

      const res = await apiFetch(`/api/v1/entities/${entity}/bulk-restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uuids: selectedKeys })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ title: 'Unknown error', status: res.status, detail: 'Unknown error' })) as {
          title?: string;
          status?: number;
          detail?: string;
          instance?: string;
          internal_code?: string;
        };

        const toneForImpact = 'warning';
        throw {
          type: 'about:blank',
          title: data.title || 'Bulk restore failed',
          status: data.status || res.status,
          detail: data.detail || 'Unknown error',
          instance: data.instance,
          internal_code: data.internal_code,
          toneForImpact
        };
      }

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
          messageKey: 'system.entities.list.bulkRestoreFailed',
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
        messageKey: 'system.entities.list.duplicateMaxLimit',
        scope: tFn('app.common.errors.scope.duplicateAction'),
        toast: true
      });
      return;
    }
    setDuplicateScope?.('selected');
    dialogs?.openDuplicateDialog();
  }

  async function confirmBulkDuplicateImpl() {
    const entity = entityFn();
    const selectedKeys = selectedKeysFn();
    try {
      _state.isDuplicating = true;
      onBulkActionStart?.();

      const response = await apiFetch(`/api/v1/entities/${entity}/duplicate`, {
        method: 'POST',
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
          messageKey: 'system.entities.list.duplicatePartialSuccess',
          messageParams: { count: result.uuids.length, failed: result.errors.length },
          scope: tFn('app.common.errors.scope.duplicateApi')
        });
      } else {
        pushNotification({
          impact: 'LOW',
          messageKey: 'system.entities.list.duplicateSuccess',
          messageParams: { count: result.uuids.length },
          scope: tFn('app.common.errors.scope.duplicateApi')
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

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
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
    confirmBulkDuplicateWrapper
  };
}
