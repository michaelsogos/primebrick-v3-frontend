export interface DialogsReturn {
  deleteDialogOpen: boolean;
  restoreDialogOpen: boolean;
  duplicateDialogOpen: boolean;
  openDeleteDialog: () => void;
  closeDeleteDialog: () => void;
  openRestoreDialog: () => void;
  closeRestoreDialog: () => void;
  openDuplicateDialog: () => void;
  closeDuplicateDialog: () => void;
}

export function useDialogs(): DialogsReturn {
  let deleteDialogOpen = $state(false);
  let restoreDialogOpen = $state(false);
  let duplicateDialogOpen = $state(false);

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

  return {
    get deleteDialogOpen() { return deleteDialogOpen; },
    get restoreDialogOpen() { return restoreDialogOpen; },
    get duplicateDialogOpen() { return duplicateDialogOpen; },
    openDeleteDialog,
    closeDeleteDialog,
    openRestoreDialog,
    closeRestoreDialog,
    openDuplicateDialog,
    closeDuplicateDialog
  };
}
