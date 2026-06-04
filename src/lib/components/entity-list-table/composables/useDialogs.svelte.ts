export interface DialogsReturn {
  deleteDialogOpen: boolean;
  restoreDialogOpen: boolean;
  duplicateDialogOpen: boolean;
  bulkDeleteDialogOpen: boolean;
  bulkRestoreDialogOpen: boolean;
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
}

export function useDialogs(): DialogsReturn {
  let deleteDialogOpen = $state(false);
  let restoreDialogOpen = $state(false);
  let duplicateDialogOpen = $state(false);
  let bulkDeleteDialogOpen = $state(false);
  let bulkRestoreDialogOpen = $state(false);

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

  return {
    get deleteDialogOpen() { return deleteDialogOpen; },
    get restoreDialogOpen() { return restoreDialogOpen; },
    get duplicateDialogOpen() { return duplicateDialogOpen; },
    get bulkDeleteDialogOpen() { return bulkDeleteDialogOpen; },
    get bulkRestoreDialogOpen() { return bulkRestoreDialogOpen; },
    openDeleteDialog,
    closeDeleteDialog,
    openRestoreDialog,
    closeRestoreDialog,
    openDuplicateDialog,
    closeDuplicateDialog,
    openBulkDeleteDialog,
    closeBulkDeleteDialog,
    openBulkRestoreDialog,
    closeBulkRestoreDialog
  };
}
