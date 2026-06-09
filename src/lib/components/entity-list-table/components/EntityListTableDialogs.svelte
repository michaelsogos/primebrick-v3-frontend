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
  bind:open={dialogs.deleteDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeDeleteDialog(); }}
  isDeleting={rowActionsComposable.isDeleting}
  onConfirm={confirmDeleteRow}
  onCancel={() => dialogs.closeDeleteDialog()}
/>

<RestoreDialog
  bind:open={dialogs.restoreDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeRestoreDialog(); }}
  isRestoring={rowActionsComposable.isRestoring}
  onConfirm={confirmRestoreRow}
  onCancel={() => dialogs.closeRestoreDialog()}
/>

<BulkDeleteDialog
  bind:open={dialogs.bulkDeleteDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeBulkDeleteDialog(); }}
  selectedCount={selectedKeys.length}
  isDeleting={bulkActions.isDeleting}
  onConfirm={confirmBulkDelete}
  onCancel={cancelBulkDelete}
/>

<BulkRestoreDialog
  bind:open={dialogs.bulkRestoreDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeBulkRestoreDialog(); }}
  selectedCount={selectedKeys.length}
  isRestoring={bulkActions.isRestoring}
  onConfirm={confirmBulkRestore}
  onCancel={cancelBulkRestore}
/>

<ExportDialog
  bind:open={exportComposable.exportOpen}
  onOpenChange={(open) => { if (!open) exportComposable.closeExportDialog(); }}
  selectedCount={selectedKeys.length}
  totalCount={total}
  entity={entity}
  exportScope={exportComposable.exportScope}
  onExportScopeChange={(scope) => exportComposable.exportScope = scope}
  fileType={exportComposable.fileType}
  isExporting={exportComposable.isExporting}
  onFileTypeChange={(type) => exportComposable.setFileType(type as 'xlsx' | 'csv')}
  onConfirm={confirmExportRow}
  onCancel={cancelExportRow}
/>

<HtmlExportDialog
  bind:open={exportComposable.htmlPreviewDialogOpen}
  onOpenChange={(open: boolean) => { if (!open) exportComposable.closeHtmlExportDialog(); }}
  selectedCount={selectedKeys.length}
  totalCount={total}
  entity={entity}
  isExporting={exportComposable.isHtmlExporting}
  onConfirm={confirmHtmlExport}
  onCancel={cancelHtmlExport}
/>

<DuplicateDialog
  bind:open={dialogs.duplicateDialogOpen}
  onOpenChange={(open) => { if (!open) dialogs.closeDuplicateDialog(); }}
  duplicateScope={dialogs.duplicateScope}
  selectedCount={selectedKeys.length}
  entity={entity}
  isDuplicating={rowActionsComposable.isDuplicating}
  onConfirm={confirmDuplicate}
  onCancel={cancelDuplicate}
/>

<!-- HTML preview full-screen dialog -->
<ExportPreviewDialog
  bind:open={exportComposable.htmlPreviewDialogOpen}
  onOpenChange={(open) => { if (!open) exportComposable.closeHtmlExportDialog(); }}
  previewMode={exportComposable.previewMode}
  onPreviewModeChange={(mode: 'html' | 'pdf' | 'email') => exportComposable.previewMode = mode}
  htmlPreviewContent={exportComposable.htmlPreviewContent}
  pdfBlobUrl={exportComposable.pdfBlobUrl}
  emailHtmlContent={exportComposable.emailHtmlContent}
  isEmailPreparing={exportComposable.isEmailPreparing}
  emailCopied={exportComposable.emailCopied}
  onGeneratePdfPreview={generatePdfPreview}
  onPrepareEmailHtml={prepareEmailHtml}
  onCopyHtmlToClipboard={copyHtmlToClipboard}
  onCopyEmailHtmlToClipboard={copyEmailHtmlToClipboard}
  onClose={closeHtmlPreview}
/>
