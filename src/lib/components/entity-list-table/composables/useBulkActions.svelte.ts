import { apiFetch } from '$lib/api';
import { pushImpactError, pushRFC7807Error } from '$lib/errors/app-errors';
import type { RFC7807Error } from '$lib/errors/rfc7807';

export interface BulkActionsOptions {
  entity: () => string;
  selectedKeys: () => string[];
  onBulkActionStart?: () => void;
  onBulkActionComplete?: () => void;
  onBulkActionError?: (error: Error) => void;
  onSelectionChange?: (keys: string[]) => void;
  onRefresh?: () => void;
  onToolbarModeChange?: () => void;
  t?: (key: string, params?: Record<string, any>) => string;
}

export interface BulkActionsReturn {
  isDeleting: boolean;
  isRestoring: boolean;
  isDuplicating: boolean;
  handleBulkDelete: () => void;
  confirmBulkDelete: () => Promise<void>;
  cancelBulkDelete: () => void;
  handleBulkRestore: () => void;
  confirmBulkRestore: () => Promise<void>;
  cancelBulkRestore: () => void;
  handleBulkDuplicate: () => void;
  confirmBulkDuplicate: () => Promise<void>;
  cancelBulkDuplicate: () => void;
}

export function useBulkActions(options: BulkActionsOptions): BulkActionsReturn {
  const {
    entity: entityFn,
    selectedKeys: selectedKeysFn,
    onBulkActionStart,
    onBulkActionComplete,
    onBulkActionError,
    onSelectionChange,
    onRefresh,
    onToolbarModeChange,
    t: tFn = (key: string) => key // Default fallback
  } = options;

  let isDeleting = $state(false);
  let isRestoring = $state(false);
  let isDuplicating = $state(false);

  function handleBulkDelete() {
    // This just opens the dialog - the actual deletion is in confirmBulkDelete
    // Dialog state is managed by the parent component
  }

  async function confirmBulkDelete() {
    const entity = entityFn();
    const selectedKeys = selectedKeysFn();
    if (selectedKeys.length === 0) return;
    try {
      isDeleting = true;
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
      onRefresh?.();
      onBulkActionComplete?.();
    } catch (error) {
      console.error('Bulk delete failed:', error);

      if (error && typeof error === 'object' && 'title' in error) {
        const err = error as RFC7807Error;
        pushRFC7807Error(err, { showToast: true });
      } else {
        pushImpactError({
          impact: 'MEDIUM',
          messageKey: 'entities.list.bulkDeleteFailed',
          scope: tFn('errors.scope.bulkDeleteApi'),
          detail: error instanceof Error ? error.message : String(error),
          toast: true,
        });
      }
      onBulkActionError?.(error as Error);
    } finally {
      isDeleting = false;
    }
  }

  function cancelBulkDelete() {
    // Dialog state is managed by the parent component
  }

  function handleBulkRestore() {
    // This just opens the dialog - the actual restoration is in confirmBulkRestore
    // Dialog state is managed by the parent component
  }

  async function confirmBulkRestore() {
    const entity = entityFn();
    const selectedKeys = selectedKeysFn();
    if (selectedKeys.length === 0) return;
    try {
      isRestoring = true;
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
      onRefresh?.();
      onBulkActionComplete?.();
    } catch (error) {
      console.error('Bulk restore failed:', error);

      if (error && typeof error === 'object' && 'title' in error) {
        const err = error as RFC7807Error;
        pushRFC7807Error(err, { showToast: true });
      } else {
        pushImpactError({
          impact: 'MEDIUM',
          messageKey: 'entities.list.bulkRestoreFailed',
          scope: tFn('errors.scope.bulkRestoreApi'),
          detail: error instanceof Error ? error.message : String(error),
          toast: true,
        });
      }
      onBulkActionError?.(error as Error);
    } finally {
      isRestoring = false;
    }
  }

  function cancelBulkRestore() {
    // Dialog state is managed by the parent component
  }

  function handleBulkDuplicate() {
    if (selectedKeysFn().length > 50) {
      pushImpactError({
        impact: 'MEDIUM',
        messageKey: 'entities.list.duplicateMaxLimit',
        scope: tFn('errors.scope.duplicateAction'),
        toast: true
      });
      return;
    }
    // This just opens the dialog - the actual duplication is in confirmBulkDuplicate
    // Dialog state is managed by the parent component
  }

  async function confirmBulkDuplicate() {
    const entity = entityFn();
    const selectedKeys = selectedKeysFn();
    try {
      isDuplicating = true;
      onBulkActionStart?.();

      const response = await apiFetch(`/api/v1/entities/${entity}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuids: selectedKeys })
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
      onBulkActionComplete?.();
    } catch (error) {
      console.error('Duplicate failed:', error);
      onBulkActionError?.(error as Error);
    } finally {
      isDuplicating = false;
    }
  }

  function cancelBulkDuplicate() {
    // Dialog state is managed by the parent component
  }

  return {
    get isDeleting() { return isDeleting; },
    get isRestoring() { return isRestoring; },
    get isDuplicating() { return isDuplicating; },
    handleBulkDelete,
    confirmBulkDelete,
    cancelBulkDelete,
    handleBulkRestore,
    confirmBulkRestore,
    cancelBulkRestore,
    handleBulkDuplicate,
    confirmBulkDuplicate,
    cancelBulkDuplicate
  };
}
