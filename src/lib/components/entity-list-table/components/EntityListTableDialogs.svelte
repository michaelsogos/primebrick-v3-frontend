<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { ExportDialog, HtmlExportDialog, DuplicateDialog, ExportPreviewDialog } from '../dialogs';
  import type { useDialogs } from '../composables/useDialogs.svelte';
  import type { useRowActions } from '../composables/useRowActions.svelte';
  import type { useBulkActions } from '../composables/useBulkActions.svelte';
  import type { useExport } from '../composables/useExport.svelte';
  import type { ActionChrome } from '../types';

  let {
    dialogs,
    rowActionsComposable,
    bulkActions,
    exportComposable,
    selectedKeys,
    total,
    entity,
    entities_ns,
    translationKey,
    duplicateChrome
  }: EntityListTableDialogsProps = $props();

  type EntityListTableDialogsProps = {
    dialogs: ReturnType<typeof useDialogs<TRow>>;
    rowActionsComposable: ReturnType<typeof useRowActions<TRow>>;
    bulkActions: ReturnType<typeof useBulkActions>;
    exportComposable: ReturnType<typeof useExport>;
    selectedKeys: string[];
    total: bigint;
    entity: string;
    /** Entity-label i18n namespace (`meta.entities_ns`) — forwarded to every
     *  dialog so entity keys compose as `<ns>.entities.*`. */
    entities_ns?: string;
    translationKey?: string;
    /** `meta.actions[op]` chrome — meta-driven dialog copy (title verb,
     *  confirm message, busy label, accent severity). */
    duplicateChrome?: ActionChrome;
  };

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

<ExportDialog
  open={exportComposable.state.exportOpen}
  onOpenChange={(open) => { if (!open) exportComposable.closeExportDialog(); }}
  selectedCount={selectedKeys.length}
  totalCount={total}
  entity={translationKey ?? entity}
  entities_ns={entities_ns}
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
  entities_ns={entities_ns}
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
  entities_ns={entities_ns}
  chrome={duplicateChrome}
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
