import { apiFetch } from '$lib/api';
import { pushRFC7807Error } from '$lib/errors/app-errors';
import type { RFC7807Error } from '$lib/errors/rfc7807';
import type { MetaColumn, AdvancedFilter } from '$lib/entity-list/types';

export interface ExportOptions {
  entity: () => string;
  uid: () => string;
  columns: () => MetaColumn[];
  selectedKeys: () => string[];
  search?: () => string;
  searchInKeys?: () => string[] | null;
  sortKey?: () => string | null;
  sortDir?: () => string;
  filterValues?: () => Record<string, any>;
  advancedFilters?: () => AdvancedFilter[];
  deletionFilterMode?: () => string;
  onExportStart?: () => void;
  onExportComplete?: () => void;
  onExportError?: (error: Error) => void;
}

export interface ExportReturn {
  exportOpen: boolean;
  exportScope: 'selected' | 'all';
  htmlExportScope: 'selected' | 'all';
  fileType: 'xlsx' | 'csv' | null;
  isExporting: boolean;
  isHtmlExporting: boolean;
  htmlPreviewContent: string;
  htmlPreviewDialogOpen: boolean;
  previewMode: 'html' | 'pdf' | 'email';
  pdfBlobUrl: string | null;
  emailHtmlContent: string;
  isEmailPreparing: boolean;
  emailCopied: boolean;
  openExportDialog: () => void;
  closeExportDialog: () => void;
  openHtmlExportDialog: () => void;
  closeHtmlExportDialog: () => void;
  handleExport: (fileType: 'xlsx' | 'csv') => Promise<void>;
  handleHtmlExport: () => Promise<void>;
  setExportScope: (scope: 'selected' | 'all') => void;
  setHtmlExportScope: (scope: 'selected' | 'all') => void;
  setFileType: (type: 'xlsx' | 'csv' | null) => void;
  closeHtmlPreview: () => void;
  copyHtmlToClipboard: () => Promise<void>;
  generatePdfPreview: () => Promise<void>;
  prepareEmailHtml: () => Promise<void>;
  copyEmailHtmlToClipboard: () => Promise<void>;
}

export function useExport(options: ExportOptions): ExportReturn {
  const {
    entity: entityFn,
    uid: uidFn,
    columns: columnsFn,
    selectedKeys: selectedKeysFn,
    search: searchFn,
    searchInKeys: searchInKeysFn,
    sortKey: sortKeyFn,
    sortDir: sortDirFn,
    filterValues: filterValuesFn,
    advancedFilters: advancedFiltersFn,
    deletionFilterMode: deletionFilterModeFn,
    onExportStart,
    onExportComplete,
    onExportError
  } = options;

  let exportOpen = $state(false);
  let exportScope = $state<'selected' | 'all'>('selected');
  let fileType = $state<'xlsx' | 'csv' | null>(null);
  let isExporting = $state(false);

  let htmlExportScope = $state<'selected' | 'all'>('selected');
  let isHtmlExporting = $state(false);
  let htmlPreviewContent = $state('');
  let htmlPreviewDialogOpen = $state(false);
  let previewMode = $state<'html' | 'pdf' | 'email'>('html');
  let pdfBlobUrl = $state<string | null>(null);
  let emailHtmlContent = $state('');
  let isEmailPreparing = $state(false);
  let emailCopied = $state(false);

  function openExportDialog() {
    fileType = null;
    exportScope = selectedKeysFn().length > 0 ? 'selected' : 'all';
    exportOpen = true;
  }

  function closeExportDialog() {
    exportOpen = false;
    fileType = null;
  }

  function openHtmlExportDialog() {
    htmlExportScope = selectedKeysFn().length > 0 ? 'selected' : 'all';
    htmlPreviewDialogOpen = true;
  }

  function closeHtmlExportDialog() {
    htmlPreviewDialogOpen = false;
  }

  function setExportScope(scope: 'selected' | 'all') {
    exportScope = scope;
  }

  function setHtmlExportScope(scope: 'selected' | 'all') {
    htmlExportScope = scope;
  }

  function setFileType(type: 'xlsx' | 'csv' | null) {
    fileType = type;
  }

  async function handleExport(fileTypeParam: 'xlsx' | 'csv') {
    try {
      isExporting = true;
      onExportStart?.();

      const entity = entityFn();
      const uid = uidFn();
      const columns = columnsFn();
      const selectedKeys = selectedKeysFn();
      const search = searchFn?.();
      const searchInKeys = searchInKeysFn?.();
      const sortKey = sortKeyFn?.();
      const sortDir = sortDirFn?.();
      const filterValues = filterValuesFn?.();
      const advancedFilters = advancedFiltersFn?.();
      const deletionFilterMode = deletionFilterModeFn?.();

      const params = new URLSearchParams();
      params.append('file_type', fileTypeParam);

      if (search) params.append('search', search);
      if (searchInKeys) params.append('search_in', searchInKeys.join(','));
      if (sortKey) params.append('sort_key', sortKey);
      if (sortDir) params.append('sort_dir', sortDir);

      let filterIdx = 0;

      if (filterValues && Object.keys(filterValues).length > 0) {
        for (const [field, value] of Object.entries(filterValues)) {
          if (value !== undefined && value !== null && value !== '') {
            const col = columns.find(c => c.key === field);
            const op = col?.type === 'text' ? 'ILIKE' : '=';

            if (col?.type === 'badge' && Array.isArray(value)) {
              for (let i = 0; i < value.length; i++) {
                params.set(`filters[${filterIdx}][field]`, field);
                params.set(`filters[${filterIdx}][op]`, op);
                params.set(`filters[${filterIdx}][value]`, String(value[i]));
                const connector = i < value.length - 1 ? 'OR' : 'AND';
                params.set(`filters[${filterIdx}][connector]`, connector);
                filterIdx++;
              }
            } else {
              params.set(`filters[${filterIdx}][field]`, field);
              params.set(`filters[${filterIdx}][op]`, op);
              params.set(`filters[${filterIdx}][value]`, String(value));
              params.set(`filters[${filterIdx}][connector]`, 'AND');
              filterIdx++;
            }
          }
        }
      }

      if (advancedFilters && advancedFilters.length > 0) {
        for (const filter of advancedFilters) {
          if (filter.field && filter.value !== undefined && filter.value !== null && filter.value !== '') {
            params.set(`filters[${filterIdx}][field]`, filter.field);

            let operator: string = filter.operator;
            let value = filter.value;

            if (operator === 'BETWEEN' && typeof value === 'object' && 'start' in value && 'end' in value) {
              params.set(`filters[${filterIdx}][op]`, operator);
              params.set(`filters[${filterIdx}][value][start]`, String(value.start));
              params.set(`filters[${filterIdx}][value][end]`, String(value.end));
              filterIdx++;
              continue;
            }

            if (Array.isArray(value)) {
              operator = operator === '!=' ? 'NOT IN' : 'IN';
            } else if (operator === 'startsWith') {
              operator = 'ILIKE';
              value = `${value}%`;
            } else if (operator === 'endsWith') {
              operator = 'ILIKE';
              value = `%${value}`;
            } else if (operator === 'contains') {
              operator = 'ILIKE';
              value = `%${value}%`;
            }

            params.set(`filters[${filterIdx}][op]`, operator);

            if (Array.isArray(value)) {
              for (const val of value) {
                params.append(`filters[${filterIdx}][value][]`, String(val));
              }
            } else {
              params.set(`filters[${filterIdx}][value]`, String(value));
            }

            filterIdx++;
          }
        }
      }

      if (exportScope === 'selected' && selectedKeys.length > 0) {
        params.set(`filters[${filterIdx}][field]`, uid);
        params.set(`filters[${filterIdx}][op]`, 'IN');
        for (const key of selectedKeys) {
          params.append(`filters[${filterIdx}][value][]`, key);
        }
        params.set(`filters[${filterIdx}][connector]`, 'AND');
      }

      if (deletionFilterMode && deletionFilterMode !== 'non_deleted') {
        params.append('deletion_filter_mode', deletionFilterMode);
      }

      const response = await apiFetch(`/api/v1/entities/${entity}/export?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${entity}-export-${new Date().toISOString().replace(/[:.]/g, '-')}.${fileTypeParam}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      exportOpen = false;
      fileType = null;
      onExportComplete?.();
    } catch (error) {
      console.error('Export failed:', error);
      const errorData = error as RFC7807Error;
      pushRFC7807Error(errorData, { showToast: true });
      onExportError?.(error as Error);
    } finally {
      isExporting = false;
      exportOpen = false;
    }
  }

  async function handleHtmlExport() {
    try {
      isHtmlExporting = true;
      onExportStart?.();

      const entity = entityFn();
      const uid = uidFn();
      const columns = columnsFn();
      const selectedKeys = selectedKeysFn();
      const search = searchFn?.();
      const searchInKeys = searchInKeysFn?.();
      const sortKey = sortKeyFn?.();
      const sortDir = sortDirFn?.();
      const filterValues = filterValuesFn?.();
      const advancedFilters = advancedFiltersFn?.();
      const deletionFilterMode = deletionFilterModeFn?.();

      const params = new URLSearchParams();
      params.append('file_type', 'html');

      if (search) params.append('search', search);
      if (searchInKeys) params.append('search_in', searchInKeys.join(','));
      if (sortKey) params.append('sort_key', sortKey);
      if (sortDir) params.append('sort_dir', sortDir);

      let filterIdx = 0;
      const filters: Record<string, any> = {};

      if (filterValues) {
        for (const [key, value] of Object.entries(filterValues)) {
          if (value !== null && value !== undefined && value !== '') {
            const col = columns.find(c => c.key === key);
            const op = col?.type === 'text' ? 'ILIKE' : '=';
            filters[`filter[${filterIdx}].field`] = key;
            filters[`filter[${filterIdx}].operator`] = op;
            filters[`filter[${filterIdx}].value`] = value;
            filterIdx++;
          }
        }
      }

      if (advancedFilters && advancedFilters.length > 0) {
        advancedFilters.forEach((filter, idx) => {
          filters[`filter[${filterIdx}].field`] = filter.field;
          filters[`filter[${filterIdx}].operator`] = filter.operator;
          filters[`filter[${filterIdx}].value`] = filter.value;
          filterIdx++;
        });
      }

      if (htmlExportScope === 'selected' && selectedKeys.length > 0) {
        params.append('uuids', selectedKeys.join(','));
      }

      if (deletionFilterMode && deletionFilterMode !== 'non_deleted') {
        params.append('deletion_filter_mode', deletionFilterMode);
      }

      Object.entries(filters).forEach(([key, value]) => {
        params.append(key, value);
      });

      const response = await apiFetch(`/api/v1/entities/${entity}/export?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }

      const htmlContent = await response.text();
      htmlPreviewContent = htmlContent;
      htmlPreviewDialogOpen = true;
      onExportComplete?.();
    } catch (error) {
      console.error('HTML export failed:', error);
      const errorData = error as RFC7807Error;
      pushRFC7807Error(errorData, { showToast: true });
      onExportError?.(error as Error);
    } finally {
      isHtmlExporting = false;
      htmlPreviewDialogOpen = false;
    }
  }

  function closeHtmlPreview() {
    htmlPreviewDialogOpen = false;
    htmlPreviewContent = '';
  }

  async function copyHtmlToClipboard() {
    try {
      const blobHtml = new Blob([htmlPreviewContent], { type: 'text/html' });
      const plainText = htmlPreviewContent.replace(/<[^>]*>/g, '');
      const blobPlain = new Blob([plainText], { type: 'text/plain' });

      const clipboardItem = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobPlain
      });

      await navigator.clipboard.write([clipboardItem]);
    } catch (err) {
      console.error('Advanced clipboard copy failed, falling back to plain text:', err);
      navigator.clipboard.writeText(htmlPreviewContent);
    }
  }

  async function generatePdfPreview() {
    previewMode = 'pdf';
    pdfBlobUrl = null;

    try {
      const html2pdf = await import('html2pdf.js');
      const element = document.createElement('div');
      element.innerHTML = htmlPreviewContent;

      const opt = {
        margin: 10,
        filename: `${entityFn()}-export.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };

      const worker = html2pdf.default().set(opt).from(element);
      const pdfBlob = await worker.output('blob');
      pdfBlobUrl = URL.createObjectURL(pdfBlob);
    } catch (error) {
      console.error('PDF generation failed:', error);
      onExportError?.(error as Error);
    }
  }

  async function prepareEmailHtml() {
    previewMode = 'email';
    isEmailPreparing = true;
    emailCopied = false;

    try {
      const emailWrapper = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          ${htmlPreviewContent}
        </body>
        </html>
      `;
      emailHtmlContent = emailWrapper;
    } catch (error) {
      console.error('Email HTML preparation failed:', error);
      onExportError?.(error as Error);
    } finally {
      isEmailPreparing = false;
    }
  }

  async function copyEmailHtmlToClipboard() {
    try {
      await navigator.clipboard.writeText(emailHtmlContent);
      emailCopied = true;
    } catch (error) {
      console.error('Failed to copy email HTML:', error);
      onExportError?.(error as Error);
    }
  }

  return {
    get exportOpen() { return exportOpen; },
    get exportScope() { return exportScope; },
    get htmlExportScope() { return htmlExportScope; },
    get fileType() { return fileType; },
    get isExporting() { return isExporting; },
    get isHtmlExporting() { return isHtmlExporting; },
    get htmlPreviewContent() { return htmlPreviewContent; },
    get htmlPreviewDialogOpen() { return htmlPreviewDialogOpen; },
    get previewMode() { return previewMode; },
    get pdfBlobUrl() { return pdfBlobUrl; },
    get emailHtmlContent() { return emailHtmlContent; },
    get isEmailPreparing() { return isEmailPreparing; },
    get emailCopied() { return emailCopied; },
    openExportDialog,
    closeExportDialog,
    openHtmlExportDialog,
    closeHtmlExportDialog,
    handleExport,
    handleHtmlExport,
    setExportScope,
    setHtmlExportScope,
    setFileType,
    closeHtmlPreview,
    copyHtmlToClipboard,
    generatePdfPreview,
    prepareEmailHtml,
    copyEmailHtmlToClipboard
  };
}
