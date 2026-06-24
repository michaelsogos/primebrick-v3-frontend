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
    confirmDeleteRow,
    confirmRestoreRow,
    confirmBulkDelete,
    cancelBulkDelete,
    confirmBulkRestore,
    cancelBulkRestore,
    confirmExportRow,
    cancelExportRow,
    confirmHtmlExport,
    cancelHtmlExport,
    confirmDuplicate,
    cancelDuplicate,
    generatePdfPreview,
    prepareEmailHtml,
    copyHtmlToClipboard,
    copyEmailHtmlToClipboard,
    closeHtmlPreview
  }: EntityListTableDialogsProps = $props();

  type EntityListTableDialogsProps = {
    dialogs: any;
    rowActionsComposable: any;
    bulkActions: any;
    exportComposable: any;
    selectedKeys: string[];
    total: number;
    entity: string;
    confirmDeleteRow: () => void;
    confirmRestoreRow: () => void;
    confirmBulkDelete: () => void;
    cancelBulkDelete: () => void;
    confirmBulkRestore: () => void;
    cancelBulkRestore: () => void;
    confirmExportRow: () => void;
    cancelExportRow: () => void;
    confirmHtmlExport: () => void;
    cancelHtmlExport: () => void;
    confirmDuplicate: () => void;
    cancelDuplicate: () => void;
    generatePdfPreview: () => void;
    prepareEmailHtml: () => void;
    copyHtmlToClipboard: () => void;
    copyEmailHtmlToClipboard: () => void;
    closeHtmlPreview: () => void;
  };
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
  entity={entity}
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
  entity={entity}
  isExporting={exportComposable.state.isHtmlExporting}
  onConfirm={confirmHtmlExport}
  onCancel={cancelHtmlExport}
/>

<DuplicateDialog
  open={dialogs.state.duplicateDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeDuplicateDialog(); }}
  duplicateScope={dialogs.state.duplicateScope}
  selectedCount={selectedKeys.length}
  entity={entity}
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
