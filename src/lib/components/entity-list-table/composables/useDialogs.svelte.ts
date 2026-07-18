import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useDialogs<TRow extends Record<string, unknown>>() {
  const _state = $state({
    deleteDialogOpen: false,
    restoreDialogOpen: false,
    duplicateDialogOpen: false,
    bulkDeleteDialogOpen: false,
    bulkRestoreDialogOpen: false,
    rowToDelete: null as TRow | null,
    rowToRestore: null as TRow | null,
    singleRowToDuplicate: null as TRow | null,
    duplicateScope: 'selected' as 'selected' | 'single',
  });

  function openDeleteDialog() { _state.deleteDialogOpen = true; }
  function closeDeleteDialog() { _state.deleteDialogOpen = false; }
  function openRestoreDialog() { _state.restoreDialogOpen = true; }
  function closeRestoreDialog() { _state.restoreDialogOpen = false; }
  function openDuplicateDialog() { _state.duplicateDialogOpen = true; }
  function closeDuplicateDialog() { _state.duplicateDialogOpen = false; }
  function openBulkDeleteDialog() { _state.bulkDeleteDialogOpen = true; }
  function closeBulkDeleteDialog() { _state.bulkDeleteDialogOpen = false; }
  function openBulkRestoreDialog() { _state.bulkRestoreDialogOpen = true; }
  function closeBulkRestoreDialog() { _state.bulkRestoreDialogOpen = false; }
  function setRowToDelete(row: TRow | null) { _state.rowToDelete = row; }
  function setRowToRestore(row: TRow | null) { _state.rowToRestore = row; }
  function setSingleRowToDuplicate(row: TRow | null) { _state.singleRowToDuplicate = row; }
  function setDuplicateScope(scope: 'selected' | 'single') { _state.duplicateScope = scope; }

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    openDeleteDialog,
    closeDeleteDialog,
    openRestoreDialog,
    closeRestoreDialog,
    openDuplicateDialog,
    closeDuplicateDialog,
    openBulkDeleteDialog,
    closeBulkDeleteDialog,
    openBulkRestoreDialog,
    closeBulkRestoreDialog,
    setRowToDelete,
    setRowToRestore,
    setSingleRowToDuplicate,
    setDuplicateScope,
  };
}
