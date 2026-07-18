import { apiFetch } from '$lib/api';
import { pushNotification } from '$lib/errors/app-errors';
import type { RFC7807Error } from '$lib/errors/rfc7807';
import type { MetaColumn, AdvancedFilter } from '$lib/entity-list/types';
import type { DeepReadonly } from '$lib/types/deep-readonly';

interface ExportOptions {
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

export function useExport(options: ExportOptions) {
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

  const _state = $state({
    exportOpen: false,
    exportScope: 'selected' as 'selected' | 'all',
    fileType: null as 'xlsx' | 'csv' | null,
    isExporting: false,
    isHtmlExporting: false,
    htmlPreviewContent: '',
    htmlPreviewDialogOpen: false,
    htmlExportConfirmDialogOpen: false,
    previewMode: 'html' as 'html' | 'pdf' | 'email',
    pdfBlobUrl: null as string | null,
    emailHtmlContent: '',
    isEmailPreparing: false,
    emailCopied: false
  });

  function openExportDialog() {
    _state.fileType = null;
    _state.exportScope = selectedKeysFn().length > 0 ? 'selected' : 'all';
    _state.exportOpen = true;
  }

  function closeExportDialog() {
    _state.exportOpen = false;
    _state.fileType = null;
  }

  function openHtmlExportDialog() {
    _state.htmlPreviewDialogOpen = true;
  }

  function closeHtmlExportDialog() {
    _state.htmlPreviewDialogOpen = false;
  }

  function openHtmlExportConfirmDialog() {
    _state.htmlExportConfirmDialogOpen = true;
  }

  function closeHtmlExportConfirmDialog() {
    _state.htmlExportConfirmDialogOpen = false;
  }

  function setExportScope(scope: 'selected' | 'all') {
    _state.exportScope = scope;
  }


  function setFileType(type: 'xlsx' | 'csv' | null) {
    _state.fileType = type;
  }

  function setPreviewMode(mode: 'html' | 'pdf' | 'email') {
    _state.previewMode = mode;
  }

  async function handleExport(fileTypeParam: 'xlsx' | 'csv') {
    try {
      _state.isExporting = true;
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

      if (_state.exportScope === 'selected' && selectedKeys.length > 0) {
        params.set(`filters[${filterIdx}][field]`, uid);
        params.set(`filters[${filterIdx}][op]`, 'IN');
        for (const key of selectedKeys) {
          params.append(`filters[${filterIdx}][value][]`, key);
        }
        params.set(`filters[${filterIdx}][connector]`, 'AND');
      }

      if (deletionFilterMode === 'deleted') {
        params.append('deleted_records', 'ONLY');
      } else if (deletionFilterMode === 'all') {
        params.append('deleted_records', 'INCLUDED');
      }
      // 'non_deleted' is default (EXCLUDED), so no param needed

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

      _state.exportOpen = false;
      _state.fileType = null;
      onExportComplete?.();
    } catch (error) {
      console.error('Export failed:', error);
      const errorData = error as RFC7807Error;
      pushNotification(errorData);
      onExportError?.(error as Error);
    } finally {
      _state.isExporting = false;
      _state.exportOpen = false;
    }
  }

  async function handleHtmlExport() {
    try {
      _state.isHtmlExporting = true;
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

      // If exporting selected items
      if (selectedKeys.length > 0) {
        params.set(`filters[${filterIdx}][field]`, uid);
        params.set(`filters[${filterIdx}][op]`, 'IN');
        for (const key of selectedKeys) {
          params.append(`filters[${filterIdx}][value][]`, key);
        }
        params.set(`filters[${filterIdx}][connector]`, 'AND');
      } else {
        // Export all items without pagination
        params.append('pagination', 'false');
      }

      if (deletionFilterMode === 'deleted') {
        params.append('deleted_records', 'ONLY');
      } else if (deletionFilterMode === 'all') {
        params.append('deleted_records', 'INCLUDED');
      }
      // 'non_deleted' is default (EXCLUDED), so no param needed

      Object.entries(filters).forEach(([key, value]) => {
        params.append(key, value);
      });

      const response = await apiFetch(`/api/v1/entities/${entity}/export?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }

      const htmlContent = await response.text();
      _state.htmlPreviewContent = htmlContent;
      _state.htmlPreviewDialogOpen = true;
      onExportComplete?.();
    } catch (error) {
      console.error('HTML export failed:', error);
      const errorData = error as RFC7807Error;
      pushNotification(errorData);
      onExportError?.(error as Error);
    } finally {
      _state.isHtmlExporting = false;
    }
  }

  function closeHtmlPreview() {
    _state.htmlPreviewDialogOpen = false;
    _state.htmlPreviewContent = '';
  }

  async function copyHtmlToClipboard() {
    try {
      const blobHtml = new Blob([_state.htmlPreviewContent], { type: 'text/html' });
      const plainText = _state.htmlPreviewContent.replace(/<[^>]*>/g, '');
      const blobPlain = new Blob([plainText], { type: 'text/plain' });

      const clipboardItem = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobPlain
      });

      await navigator.clipboard.write([clipboardItem]);
    } catch (err) {
      console.error('Advanced clipboard copy failed, falling back to plain text:', err);
      navigator.clipboard.writeText(_state.htmlPreviewContent);
    }
  }

  async function generatePdfPreview() {
    _state.previewMode = 'pdf';
    _state.pdfBlobUrl = null;

    try {
      const html2pdf = await import('html2pdf.js');
      const element = document.createElement('div');
      element.innerHTML = _state.htmlPreviewContent;

      const opt = {
        margin: 10,
        filename: `${entityFn()}-export.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };

      const worker = html2pdf.default().set(opt).from(element);
      const pdfBlob = await worker.output('blob');
      _state.pdfBlobUrl = URL.createObjectURL(pdfBlob);
    } catch (error) {
      console.error('PDF generation failed:', error);
      onExportError?.(error as Error);
    }
  }

  async function prepareEmailHtml() {
    _state.previewMode = 'email';
    _state.isEmailPreparing = true;
    _state.emailCopied = false;

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
          ${_state.htmlPreviewContent}
        </body>
        </html>
      `;
      _state.emailHtmlContent = emailWrapper;
    } catch (error) {
      console.error('Email HTML preparation failed:', error);
      onExportError?.(error as Error);
    } finally {
      _state.isEmailPreparing = false;
    }
  }

  async function copyEmailHtmlToClipboard() {
    try {
      await navigator.clipboard.writeText(_state.emailHtmlContent);
      _state.emailCopied = true;
    } catch (error) {
      console.error('Failed to copy email HTML:', error);
      onExportError?.(error as Error);
    }
  }

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    openExportDialog,
    closeExportDialog,
    openHtmlExportDialog,
    closeHtmlExportDialog,
    openHtmlExportConfirmDialog,
    closeHtmlExportConfirmDialog,
    handleExport,
    handleHtmlExport,
    setExportScope,
    setFileType,
    setPreviewMode,
    closeHtmlPreview,
    copyHtmlToClipboard,
    generatePdfPreview,
    prepareEmailHtml,
    copyEmailHtmlToClipboard
  };
}
