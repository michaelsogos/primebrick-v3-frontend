export function useKeyboardNavigation<T>(
  viewRows: T[],
  rowSelectionEnabled: boolean,
  selectedKeys: string[],
  onSelectedKeysChange: (keys: string[]) => void,
  rowKey: (row: T) => string,
  previewPanelOpen: boolean,
  previewRowIndex: number,
  previewRow: T | null,
  setPreviewRow: (row: T, index: number) => void,
  navigatePreview: (direction: number) => void,
  dropdownMenuRow: T | null,
  previewDropdownOpen: boolean,
  closeRowDropdown: () => void,
  page: number,
  pageSize: number,
  totalPages: number,
  onPageChange: (p: number) => void,
  openRowDropdown: (row: T) => void,
  footerUsesClientPaging: boolean,
  clientSelectedPage: number,
  setClientSelectedPage: (page: number) => void,
  navigatingToNextPage: boolean,
  setNavigatingToNextPage: (value: boolean) => void,
  navigatingToPrevPage: boolean,
  setNavigatingToPrevPage: (value: boolean) => void,
  toggleRowSelect: (key: string) => void,
  tableRef: HTMLTableElement | null
) {
  let focusedRowIndex = $state<number | null>(null);

  function handleGlobalKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    if (target.closest('[role="menu"]') || target.closest('[role="menuitem"]')) return;

    // Skip table row navigation if any dropdown menu is open (menu has priority)
    if (dropdownMenuRow !== null || previewDropdownOpen) return;

    if (previewPanelOpen) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigatePreview(-1);
        return;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigatePreview(1);
        return;
      }
    }

    if (viewRows.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (focusedRowIndex === null) {
        focusedRowIndex = 0;
      } else if (focusedRowIndex < viewRows.length - 1) {
        focusedRowIndex++;
      } else if (focusedRowIndex === viewRows.length - 1 && page < totalPages) {
        // Trigger next page when reaching end of current page
        setNavigatingToNextPage(true);
        if (footerUsesClientPaging) {
          setClientSelectedPage(clientSelectedPage + 1);
        } else {
          onPageChange(page + 1);
        }
      }
      if (previewPanelOpen && focusedRowIndex !== null) {
        setPreviewRow(viewRows[focusedRowIndex], focusedRowIndex);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (focusedRowIndex === null) {
        focusedRowIndex = viewRows.length - 1;
      } else if (focusedRowIndex > 0) {
        focusedRowIndex--;
      } else if (focusedRowIndex === 0 && page > 1) {
        // Trigger previous page when at start of current page
        setNavigatingToPrevPage(true);
        if (footerUsesClientPaging) {
          setClientSelectedPage(clientSelectedPage - 1);
        } else {
          onPageChange(page - 1);
        }
      }
      if (previewPanelOpen && focusedRowIndex !== null) {
        setPreviewRow(viewRows[focusedRowIndex], focusedRowIndex);
      }
    } else if (e.key === ' ' && focusedRowIndex !== null) {
      e.preventDefault();
      const row = viewRows[focusedRowIndex];
      if (row) toggleRowSelect(rowKey(row));
    } else if (e.key === 'Enter' && focusedRowIndex !== null) {
      e.preventDefault();
      const row = viewRows[focusedRowIndex];
      if (row) openRowDropdown(row);
    } else if (e.key === 'Escape') {
      closeRowDropdown();
      // Remove focus from kebab button to prevent reopening on arrow key
      // Use setTimeout to ensure it happens after dropdown's internal focus management
      setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }, 0);
    }
  }

  // Scroll focused row into view
  $effect(() => {
    if (focusedRowIndex === null) return;
    const row = tableRef?.querySelector(`[data-focused-row-index="${focusedRowIndex}"]`) as HTMLElement;
    if (row) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });

  return {
    focusedRowIndex,
    handleGlobalKeyDown
  };
}
