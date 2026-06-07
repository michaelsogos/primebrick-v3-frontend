export interface DialogsReturn<TRow extends Record<string, unknown>> {
  deleteDialogOpen: boolean;
  restoreDialogOpen: boolean;
  duplicateDialogOpen: boolean;
  bulkDeleteDialogOpen: boolean;
  bulkRestoreDialogOpen: boolean;
  rowToDelete: TRow | null;
  rowToRestore: TRow | null;
  singleRowToDuplicate: TRow | null;
  duplicateScope: 'selected' | 'single';
  openDeleteDialog: () => void;
  closeDeleteDialog: () => void;
  openRestoreDialog: () => void;
  closeRestoreDialog: () => void;
  openDuplicateDialog: () => void;
  closeDuplicateDialog: () => void;
  openBulkDeleteDialog: () => void;
  closeBulkDeleteDialog: () => void;
  openBulkRestoreDialog: () => void;
  closeBulkRestoreDialog: () => void;
  setRowToDelete: (row: TRow | null) => void;
  setRowToRestore: (row: TRow | null) => void;
  setSingleRowToDuplicate: (row: TRow | null) => void;
  setDuplicateScope: (scope: 'selected' | 'single') => void;
}

export function useDialogs<TRow extends Record<string, unknown>>(): DialogsReturn<TRow> {
  let deleteDialogOpen = $state(false);
  let restoreDialogOpen = $state(false);
  let duplicateDialogOpen = $state(false);
  let bulkDeleteDialogOpen = $state(false);
  let bulkRestoreDialogOpen = $state(false);
  let rowToDelete: TRow | null = $state(null);
  let rowToRestore: TRow | null = $state(null);
  let singleRowToDuplicate: TRow | null = $state(null);
  let duplicateScope = $state<'selected' | 'single'>('selected');

  function openDeleteDialog() {
    deleteDialogOpen = true;
  }

  function closeDeleteDialog() {
    deleteDialogOpen = false;
  }

  function openRestoreDialog() {
    restoreDialogOpen = true;
  }

  function closeRestoreDialog() {
    restoreDialogOpen = false;
  }

  function openDuplicateDialog() {
    duplicateDialogOpen = true;
  }

  function closeDuplicateDialog() {
    duplicateDialogOpen = false;
  }

  function openBulkDeleteDialog() {
    bulkDeleteDialogOpen = true;
  }

  function closeBulkDeleteDialog() {
    bulkDeleteDialogOpen = false;
  }

  function openBulkRestoreDialog() {
    bulkRestoreDialogOpen = true;
  }

  function closeBulkRestoreDialog() {
    bulkRestoreDialogOpen = false;
  }

  function setRowToDelete(row: TRow | null) {
    rowToDelete = row;
  }

  function setRowToRestore(row: TRow | null) {
    rowToRestore = row;
  }

  function setSingleRowToDuplicate(row: TRow | null) {
    singleRowToDuplicate = row;
  }

  function setDuplicateScope(scope: 'selected' | 'single') {
    duplicateScope = scope;
  }

  return {
    get deleteDialogOpen() { return deleteDialogOpen; },
    get restoreDialogOpen() { return restoreDialogOpen; },
    get duplicateDialogOpen() { return duplicateDialogOpen; },
    get bulkDeleteDialogOpen() { return bulkDeleteDialogOpen; },
    get bulkRestoreDialogOpen() { return bulkRestoreDialogOpen; },
    get rowToDelete() { return rowToDelete; },
    get rowToRestore() { return rowToRestore; },
    get singleRowToDuplicate() { return singleRowToDuplicate; },
    get duplicateScope() { return duplicateScope; },
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
    setDuplicateScope
  };
}
