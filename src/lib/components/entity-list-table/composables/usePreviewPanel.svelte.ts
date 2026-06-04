import type { Snippet } from 'svelte';

export interface PreviewPanelOptions<TRow extends Record<string, unknown>> {
  viewRows: () => TRow[];
  rowKey: (row: TRow) => string;
  onFieldChange?: (row: TRow, field: string, value: any) => void;
  onRefresh?: () => void;
}

export interface PreviewPanelReturn<TRow extends Record<string, unknown>> {
  previewRow: TRow | null;
  previewRowIndex: number;
  previewEditMode: boolean;
  previewPanelOpen: boolean;
  focusedRowIndex: number;
  openPreview: (row: TRow) => void;
  closePreview: () => void;
  toggleEditMode: () => void;
  handleFieldChange: (field: string, value: any) => void;
  navigatePreview: (direction: 'next' | 'prev') => void;
  canNavigateNext: boolean;
  canNavigatePrev: boolean;
}

export function usePreviewPanel<TRow extends Record<string, unknown>>(
  options: PreviewPanelOptions<TRow>
): PreviewPanelReturn<TRow> {
  const { viewRows: viewRowsFn, rowKey, onFieldChange, onRefresh } = options;

  let previewRow = $state<TRow | null>(null);
  let previewRowIndex = $state(0);
  let previewEditMode = $state(false);
  let previewPanelOpen = $state(false);
  let focusedRowIndex = $state(0);

  function openPreview(row: TRow) {
    previewRow = row;
    previewRowIndex = viewRowsFn().findIndex(r => rowKey(r) === rowKey(row));
    focusedRowIndex = previewRowIndex;
    previewEditMode = false;
    previewPanelOpen = true;
  }

  function closePreview() {
    previewPanelOpen = false;
    previewRow = null;
    previewEditMode = false;
  }

  function toggleEditMode() {
    previewEditMode = !previewEditMode;
  }

  function handleFieldChange(field: string, value: any) {
    if (previewRow) {
      if (onFieldChange) {
        onFieldChange(previewRow, field, value);
      }
      // Update local preview row state
      previewRow = { ...previewRow, [field]: value };
    }
  }

  function navigatePreview(direction: 'next' | 'prev') {
    const rows = viewRowsFn();
    if (rows.length === 0) return;

    if (direction === 'next') {
      const nextIndex = Math.min(previewRowIndex + 1, rows.length - 1);
      if (nextIndex !== previewRowIndex) {
        previewRow = rows[nextIndex];
        previewRowIndex = nextIndex;
        focusedRowIndex = nextIndex;
        previewEditMode = false;
      }
    } else {
      const prevIndex = Math.max(previewRowIndex - 1, 0);
      if (prevIndex !== previewRowIndex) {
        previewRow = rows[prevIndex];
        previewRowIndex = prevIndex;
        focusedRowIndex = prevIndex;
        previewEditMode = false;
      }
    }
  }

  const canNavigateNext = $derived(previewRowIndex < viewRowsFn().length - 1);
  const canNavigatePrev = $derived(previewRowIndex > 0);

  return {
    get previewRow() { return previewRow; },
    get previewRowIndex() { return previewRowIndex; },
    get previewEditMode() { return previewEditMode; },
    get previewPanelOpen() { return previewPanelOpen; },
    get focusedRowIndex() { return focusedRowIndex; },
    get canNavigateNext() { return canNavigateNext; },
    get canNavigatePrev() { return canNavigatePrev; },
    openPreview,
    closePreview,
    toggleEditMode,
    handleFieldChange,
    navigatePreview
  };
}
