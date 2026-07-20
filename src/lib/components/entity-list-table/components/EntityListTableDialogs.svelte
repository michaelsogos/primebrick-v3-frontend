<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { DeleteDialog, RestoreDialog, BulkDeleteDialog, BulkRestoreDialog, ExportDialog, HtmlExportDialog, DuplicateDialog, ExportPreviewDialog } from '../dialogs';

  let {
    dialogs,
    rowActionsComposable,
    bulkActions,
    exportComposable,
    selectedKeys,
    total,
    entity,
    translationKey
  }: EntityListTableDialogsProps = $props();

  type EntityListTableDialogsProps = {
    dialogs: any;
    rowActionsComposable: any;
    bulkActions: any;
    exportComposable: any;
    selectedKeys: string[];
    total: bigint;
    entity: string;
    translationKey?: string;
  };

  async function confirmDeleteRow() {
    if (!dialogs.state.rowToDelete) return;
    await rowActionsComposable.confirmDeleteRow(dialogs.state.rowToDelete);
    dialogs.closeDeleteDialog();
    dialogs.setRowToDelete(null);
  }

  async function confirmRestoreRow() {
    if (!dialogs.state.rowToRestore) return;
    await rowActionsComposable.confirmRestoreRow(dialogs.state.rowToRestore);
    dialogs.closeRestoreDialog();
    dialogs.setRowToRestore(null);
  }

  async function confirmBulkDelete() {
    await bulkActions.confirmBulkDelete();
    dialogs.closeBulkDeleteDialog();
  }

  function cancelBulkDelete() {
    dialogs.closeBulkDeleteDialog();
  }

  async function confirmBulkRestore() {
    await bulkActions.confirmBulkRestore();
    dialogs.closeBulkRestoreDialog();
  }

  function cancelBulkRestore() {
    dialogs.closeBulkRestoreDialog();
  }

  async function confirmExportRow() {
    if (!exportComposable.state.fileType) return;
    await exportComposable.handleExport(exportComposable.state.fileType);
    exportComposable.closeExportDialog();
  }

  function cancelExportRow() {
    exportComposable.closeExportDialog();
  }

  async function confirmDuplicate() {
    if (dialogs.state.duplicateScope === 'single' && dialogs.state.singleRowToDuplicate) {
      await rowActionsComposable.confirmDuplicateRow(dialogs.state.singleRowToDuplicate);
    } else if (dialogs.state.duplicateScope === 'selected') {
      await bulkActions.confirmBulkDuplicate();
    }
    dialogs.closeDuplicateDialog();
    dialogs.setSingleRowToDuplicate(null);
  }

  function cancelDuplicate() {
    dialogs.closeDuplicateDialog();
    dialogs.setSingleRowToDuplicate(null);
  }

  function cancelHtmlExport() {
    exportComposable.closeHtmlExportConfirmDialog();
  }

  async function confirmHtmlExport() {
    await exportComposable.handleHtmlExport();
  }

  function closeHtmlPreview() {
    exportComposable.closeHtmlPreview();
  }

  async function copyHtmlToClipboard() {
    await exportComposable.copyHtmlToClipboard();
  }

  async function generatePdfPreview() {
    await exportComposable.generatePdfPreview();
  }

  async function prepareEmailHtml() {
    await exportComposable.prepareEmailHtml();
  }

  async function copyEmailHtmlToClipboard() {
    await exportComposable.copyEmailHtmlToClipboard();
  }
</script>

<DeleteDialog
  open={dialogs.state.deleteDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeDeleteDialog(); }}
  isDeleting={rowActionsComposable.state.isDeleting}
  onConfirm={confirmDeleteRow}
  onCancel={() => dialogs.closeDeleteDialog()}
/>

<RestoreDialog
  open={dialogs.state.restoreDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeRestoreDialog(); }}
  isRestoring={rowActionsComposable.state.isRestoring}
  onConfirm={confirmRestoreRow}
  onCancel={() => dialogs.closeRestoreDialog()}
/>

<BulkDeleteDialog
  open={dialogs.state.bulkDeleteDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeBulkDeleteDialog(); }}
  selectedCount={selectedKeys.length}
  isDeleting={bulkActions.state.isDeleting}
  onConfirm={confirmBulkDelete}
  onCancel={cancelBulkDelete}
/>

<BulkRestoreDialog
  open={dialogs.state.bulkRestoreDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeBulkRestoreDialog(); }}
  selectedCount={selectedKeys.length}
  isRestoring={bulkActions.state.isRestoring}
  onConfirm={confirmBulkRestore}
  onCancel={cancelBulkRestore}
/>

<ExportDialog
  open={exportComposable.state.exportOpen}
  onOpenChange={(open) => { if (!open) exportComposable.closeExportDialog(); }}
  selectedCount={selectedKeys.length}
  totalCount={total}
  entity={translationKey ?? entity}
  exportScope={exportComposable.state.exportScope}
  onExportScopeChange={(scope) => exportComposable.setExportScope(scope)}
  fileType={exportComposable.state.fileType}
  isExporting={exportComposable.state.isExporting}
  onFileTypeChange={(type) => exportComposable.setFileType(type as 'xlsx' | 'csv')}
  onConfirm={confirmExportRow}
  onCancel={cancelExportRow}
/>

<HtmlExportDialog
  open={exportComposable.state.htmlExportConfirmDialogOpen}
  onOpenChange={(open: boolean) => { if (!open) exportComposable.closeHtmlExportConfirmDialog(); }}
  selectedCount={selectedKeys.length}
  totalCount={total}
  entity={translationKey ?? entity}
  isExporting={exportComposable.state.isHtmlExporting}
  onConfirm={confirmHtmlExport}
  onCancel={cancelHtmlExport}
/>

<DuplicateDialog
  open={dialogs.state.duplicateDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeDuplicateDialog(); }}
  duplicateScope={dialogs.state.duplicateScope}
  selectedCount={selectedKeys.length}
  entity={translationKey ?? entity}
  isDuplicating={rowActionsComposable.state.isDuplicating}
  onConfirm={confirmDuplicate}
  onCancel={cancelDuplicate}
/>

<!-- HTML preview full-screen dialog -->
<ExportPreviewDialog
  open={exportComposable.state.htmlPreviewDialogOpen}
  onOpenChange={(open) => { if (!open) exportComposable.closeHtmlExportDialog(); }}
  previewMode={exportComposable.state.previewMode}
  onPreviewModeChange={(mode: 'html' | 'pdf' | 'email') => exportComposable.setPreviewMode(mode)}
  htmlPreviewContent={exportComposable.state.htmlPreviewContent}
  pdfBlobUrl={exportComposable.state.pdfBlobUrl}
  emailHtmlContent={exportComposable.state.emailHtmlContent}
  isEmailPreparing={exportComposable.state.isEmailPreparing}
  emailCopied={exportComposable.state.emailCopied}
  onGeneratePdfPreview={generatePdfPreview}
  onPrepareEmailHtml={prepareEmailHtml}
  onCopyHtmlToClipboard={copyHtmlToClipboard}
  onCopyEmailHtmlToClipboard={copyEmailHtmlToClipboard}
  onClose={closeHtmlPreview}
/>
