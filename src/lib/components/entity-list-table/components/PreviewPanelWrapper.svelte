<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { onMount, onDestroy } from 'svelte';
  import { PreviewPanel } from '../panels';
  import type { MetaColumn } from '$lib/entity-list/types';
  import type { CellArgs } from '../types';

  type PreviewPanelWrapperCellArgs = CellArgs<TRow>;

  interface PreviewPanelWrapperProps {
    previewPanel: {
      previewPanelOpen: boolean;
      previewRow: TRow | null;
      openPreview: (row: TRow) => void;
      closePreview: () => void;
      focusedRowIndex: number | null;
      previewEditMode: boolean;
      previewRowIndex: number;
    };
    rows: TRow[];
    viewRows: TRow[];
    uid: string;
    page: number;
    onPageChange: (page: number) => void;
    entity?: string;
    columns: MetaColumn[];
    stickyColumns?: MetaColumn[];
    dataColumns?: MetaColumn[];
    auditingColumns?: MetaColumn[];
    rowActionsEnabled: boolean;
    rowActions?: Snippet<[{ row: TRow }]>;
    entityRowActions?: { edit?: boolean; duplicate?: boolean; preview?: boolean; delete?: boolean };
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    isRowDeleted: (row: TRow) => boolean;
    rowKey: (row: TRow) => string;
    rowSelectionEnabled: boolean;
    selectedKeys: Set<string> | string[];
    footerRangeTotal: number;
    footerPage: number;
    pageSize: number;
    previewDropdownOpen: boolean;
    navigatePreview: (direction: number) => void;
    onEditRow: (row: TRow) => void;
    onDuplicateRow: (row: TRow) => void;
    onDeleteRow: (row: TRow) => void;
    onRestoreRow: (row: TRow) => void;
    onPreviewDropdownOpenChange: (open: boolean) => void;
    rowsLoading: boolean;
    cell?: Snippet<[PreviewPanelWrapperCellArgs]>;
  }

  let {
    previewPanel,
    rows,
    viewRows,
    uid,
    pageSize,
    page,
    onPageChange,
    entity = 'default',
    columns,
    stickyColumns = [],
    dataColumns = [],
    auditingColumns = [],
    rowActionsEnabled,
    rowActions,
    entityRowActions,
    datetimeIanaModeByKey,
    isRowDeleted,
    rowKey,
    rowSelectionEnabled,
    selectedKeys,
    footerRangeTotal,
    footerPage,
    previewDropdownOpen,
    navigatePreview,
    onEditRow,
    onDuplicateRow,
    onDeleteRow,
    onRestoreRow,
    onPreviewDropdownOpenChange,
    rowsLoading,
    cell
  }: PreviewPanelWrapperProps = $props();

  /** Entity preview panel state */
  const _sessionRaw = (() => {
    if (typeof sessionStorage === 'undefined') return null;
    const key = `pb-preview-panel:${entity ?? 'default'}`;
    return sessionStorage.getItem(key);
  })();
  const _sessionState = _sessionRaw ? JSON.parse(_sessionRaw) : null;

  let previewPanelWidth = $state<number>(_sessionState?.width ?? 30); // percentage
  let isResizing = $state(false);
  let resizeStartX = $state(0);
  let resizeStartWidth = $state(0);
  let navigatingToNextPage = $state(false);
  let navigatingToPrevPage = $state(false);
  let _previewRestoredKey = $state<string | null>(_sessionState?.rowKey ?? null);

  $effect(() => {
    if (typeof sessionStorage !== 'undefined') {
      // While restoring, preserve the key from session until previewRow is actually set
      const rowKey_ = previewPanel.previewRow
        ? String((previewPanel.previewRow as Record<string, unknown>)[uid])
        : (_previewRestoredKey ?? null);
      const key = `pb-preview-panel:${entity ?? 'default'}`;
      sessionStorage.setItem(key, JSON.stringify({ open: previewPanel.previewPanelOpen, width: previewPanelWidth, rowKey: rowKey_ }));
    }
  });

  $effect(() => {
    if (_previewRestoredKey && previewPanel.previewPanelOpen && !rowsLoading && rows.length > 0) {
      const idx = rows.findIndex((r) => String((r as Record<string, unknown>)[uid]) === _previewRestoredKey);
      if (idx !== -1) {
        previewPanel.openPreview(rows[idx]);
        _previewRestoredKey = null;
      }
    }
  });

  /** Preview panel resize handlers */
  function startResize(e: MouseEvent) {
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartWidth = previewPanelWidth;
    e.preventDefault();
  }

  function handleResize(e: MouseEvent) {
    if (!isResizing) return;
    const deltaX = e.clientX - resizeStartX;
    // Calculate percentage based on window width since we're using window events
    const windowWidth = window.innerWidth;
    const deltaPercent = (deltaX / windowWidth) * 100;
    previewPanelWidth = Math.max(15, Math.min(70, resizeStartWidth - deltaPercent));
  }

  function stopResize() {
    isResizing = false;
  }

  async function loadVersionHistory(row: TRow) {
    const rowUuid = String((row as Record<string, unknown>)[uid]);
    const { openSheet } = await import('$lib/shell/sheets/sheet-manager.svelte');
    openSheet('entity.versionHistory', {
      entity,
      rowUuid,
      columns: columns
    });
  }

  onMount(() => {
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResize);
  });

  onDestroy(() => {
    window.removeEventListener('mousemove', handleResize);
    window.removeEventListener('mouseup', stopResize);
  });

  // Reset previewRowIndex when page changes
  $effect(() => {
    if (previewPanel.previewPanelOpen && viewRows.length > 0) {
      if (navigatingToNextPage) {
        // Going to next page - reset to first record
        previewPanel.openPreview(viewRows[0]);
        navigatingToNextPage = false;
      } else if (navigatingToPrevPage) {
        // Going to previous page - go to last record
        previewPanel.openPreview(viewRows[viewRows.length - 1]);
        navigatingToPrevPage = false;
      } else if (previewPanel.previewRowIndex >= viewRows.length) {
        // If previewRowIndex is out of bounds after page change, reset it
        previewPanel.openPreview(viewRows[0]);
      }
    }
  });

  // Handle page changes for navigation
  $effect(() => {
    if (previewPanel.previewPanelOpen && previewPanel.previewRow) {
      const currentIndex = viewRows.findIndex(r => rowKey(r) === rowKey(previewPanel.previewRow!));
      
      // If navigating to next page and we're at the last record
      if (currentIndex === viewRows.length - 1 && previewPanel.previewRowIndex < footerRangeTotal - 1) {
        navigatingToNextPage = true;
        onPageChange(page + 1);
      }
      // If navigating to prev page and we're at the first record
      else if (currentIndex === 0 && previewPanel.previewRowIndex > 0) {
        navigatingToPrevPage = true;
        onPageChange(page - 1);
      }
    }
  });


</script>

{#if previewPanel.previewPanelOpen}
  <!-- Resize handle between table and panel -->
  <button
    type="button"
    class="relative h-full w-2 cursor-ew-resize hover:bg-primary/30 z-20 border-l-2 border-transparent hover:border-primary transition-colors flex items-center justify-center"
    onmousedown={startResize}
    aria-label="Resize panel"
  >
    <div class="w-1 h-8 bg-border rounded-full"></div>
  </button>
{/if}

<div
  class="h-full overflow-hidden border-l bg-background {isResizing ? '' : 'transition-[width,min-width] duration-300 ease-in-out'}"
  style="width: {previewPanel.previewPanelOpen ? `${previewPanelWidth}%` : '0'}; min-width: {previewPanel.previewPanelOpen ? '220px' : '0'}"
>
  <div class="h-full w-full overflow-auto">
    {#if previewPanel.previewPanelOpen}
      <PreviewPanel
        row={previewPanel.previewRow!}
        previewEditMode={previewPanel.previewEditMode}
        previewRowIndex={previewPanel.previewRowIndex}
        previewDropdownOpen={previewDropdownOpen}
        totalRecords={footerRangeTotal}
        currentPage={footerPage}
        pageSize={pageSize}
        onPreviewEditModeChange={(mode: boolean) => previewPanel.previewEditMode = mode}
        onNavigatePreview={navigatePreview}
        onPreviewDropdownOpenChange={onPreviewDropdownOpenChange}
        onEditRow={onEditRow}
        onDuplicateRow={onDuplicateRow}
        onDeleteRow={onDeleteRow}
        onRestoreRow={onRestoreRow}
        onLoadVersionHistory={loadVersionHistory}
        onClosePreview={() => previewPanel.closePreview()}

        columns={columns}
        stickyColumns={stickyColumns}
        dataColumns={dataColumns}
        auditingColumns={auditingColumns}
        datetimeIanaModeByKey={datetimeIanaModeByKey}
        entityRowActions={entityRowActions}
        isRowDeleted={isRowDeleted}
        rowSelectionEnabled={rowSelectionEnabled}
        rowSelected={Array.from(selectedKeys).includes(rowKey(previewPanel.previewRow!))}
        {cell}
      />
    {/if}
  </div>
</div>
