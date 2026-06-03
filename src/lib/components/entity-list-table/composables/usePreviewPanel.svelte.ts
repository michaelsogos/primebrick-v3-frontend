import { onMount } from 'svelte';

export function usePreviewPanel<T>(entity: string, uid: string) {
  let previewPanelOpen = $state<boolean>(false);
  let previewRow = $state<T | null>(null);
  let previewRowIndex = $state(0);
  let previewEditMode = $state(false);
  let navigatingToNextPage = $state(false);
  let navigatingToPrevPage = $state(false);
  let previewPanelWidth = $state<number>(30); // percentage
  let isResizing = $state(false);
  let _previewRestoredKey = $state<string | null>(null);
  let focusedRowIndex = $state<number | null>(null);

  // Session storage persistence
  const _sessionRaw = (() => {
    if (typeof sessionStorage === 'undefined') return null;
    const key = `pb-preview-panel:${entity ?? 'default'}`;
    return sessionStorage.getItem(key);
  })();
  const _sessionState = _sessionRaw ? JSON.parse(_sessionRaw) : null;

  previewPanelOpen = _sessionState?.open ?? false;
  previewPanelWidth = _sessionState?.width ?? 30;
  _previewRestoredKey = _sessionState?.rowKey ?? null;

  $effect(() => {
    if (typeof sessionStorage !== 'undefined') {
      // While restoring, preserve the key from session until previewRow is actually set
      const rowKey_ = previewRow
        ? String((previewRow as Record<string, unknown>)[uid])
        : (_previewRestoredKey ?? null);
      const key = `pb-preview-panel:${entity ?? 'default'}`;
      sessionStorage.setItem(key, JSON.stringify({ open: previewPanelOpen, width: previewPanelWidth, rowKey: rowKey_ }));
    }
  });

  // Resize handlers
  let resizeStartX = $state(0);
  let resizeStartWidth = $state(0);

  function startResize(e: MouseEvent) {
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartWidth = previewPanelWidth;
    e.preventDefault();
  }

  function handleResize(e: MouseEvent) {
    if (!isResizing) return;
    const container = e.currentTarget as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const deltaX = e.clientX - resizeStartX;
    const deltaPercent = (deltaX / containerRect.width) * 100;
    previewPanelWidth = Math.max(15, Math.min(70, resizeStartWidth - deltaPercent));
  }

  function stopResize() {
    isResizing = false;
  }

  // Navigation
  function navigatePreview(
    direction: number,
    viewRows: T[],
    page: number,
    pageSize: number,
    totalPages: number,
    onPageChange: (p: number) => void
  ) {
    const newIndex = previewRowIndex + direction;
    if (newIndex >= 0 && newIndex < viewRows.length) {
      previewRowIndex = newIndex;
      previewRow = viewRows[newIndex];
      focusedRowIndex = newIndex;
    } else if (newIndex >= viewRows.length && page < totalPages) {
      // Trigger next page when reaching end of current page
      navigatingToNextPage = true;
      onPageChange(page + 1);
    } else if (newIndex < 0 && page > 1) {
      // Trigger previous page when reaching start of current page
      navigatingToPrevPage = true;
      onPageChange(page - 1);
    }
  }

  // Reset previewRowIndex when page changes
  function handlePageChange(viewRows: T[]) {
    if (previewPanelOpen && viewRows.length > 0) {
      if (navigatingToNextPage) {
        // Going to next page - reset to first record
        previewRowIndex = 0;
        previewRow = viewRows[0];
        navigatingToNextPage = false;
      } else if (navigatingToPrevPage) {
        // Going to previous page - go to last record
        previewRowIndex = viewRows.length - 1;
        previewRow = viewRows[viewRows.length - 1];
        navigatingToPrevPage = false;
      } else if (previewRowIndex >= viewRows.length) {
        // If previewRowIndex is out of bounds after page change, reset it
        previewRowIndex = 0;
        previewRow = viewRows[0];
      }
    }
  }

  // Restore preview row from session storage
  function restorePreviewRow(rows: T[], viewRows: T[]) {
    if (_previewRestoredKey && previewPanelOpen && rows.length > 0) {
      const idx = rows.findIndex((r) => String((r as Record<string, unknown>)[uid]) === _previewRestoredKey);
      if (idx !== -1) {
        previewRow = rows[idx];
        previewRowIndex = viewRows.findIndex((r) => String((r as Record<string, unknown>)[uid]) === _previewRestoredKey);
        focusedRowIndex = previewRowIndex;
        _previewRestoredKey = null;
      }
    }
  }

  function setPreviewRow(row: T, index: number) {
    previewRow = row;
    previewRowIndex = index;
    focusedRowIndex = index;
    previewEditMode = false;
    previewPanelOpen = true;
  }

  return {
    get previewPanelOpen() { return previewPanelOpen; },
    get previewRow() { return previewRow; },
    get previewRowIndex() { return previewRowIndex; },
    get previewEditMode() { return previewEditMode; },
    get previewPanelWidth() { return previewPanelWidth; },
    get isResizing() { return isResizing; },
    get focusedRowIndex() { return focusedRowIndex; },
    startResize,
    handleResize,
    stopResize,
    navigatePreview,
    handlePageChange,
    restorePreviewRow,
    setPreviewRow
  };
}
