import type { DeepReadonly } from '$lib/types/deep-readonly';

export function useKeyboardNavigation<T>(options: {
  viewRows: () => T[];
  rowSelectionEnabled: () => boolean;
  selectedKeys: () => string[];
  onSelectedKeysChange: (keys: string[]) => void;
  rowKey: (row: T) => string;
  previewPanelOpen: () => boolean;
  previewRowIndex: () => number;
  focusedRowIndex: () => number;
  setFocusedRowIndex: (index: number) => void;
  openPreview: (row: T) => void;
  navigatePreview: (direction: 'next' | 'prev') => void;
  dropdownMenuRow: () => T | null;
  previewDropdownOpen: () => boolean;
  closeRowDropdown: () => void;
  page: () => number;
  pageSize: () => number;
  totalPages: () => number;
  onPageChange: (p: number) => void;
  openRowDropdown: (row: T) => void;
  footerUsesClientPaging: () => boolean;
  clientSelectedPage: () => number;
  setClientSelectedPage: (page: number) => void;
  toggleRowSelect: (key: string) => void;
  tableRef: () => HTMLTableElement | null;
}) {
  function handleGlobalKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    if (target.closest('[role="menu"]') || target.closest('[role="menuitem"]')) return;

    // Skip table row navigation if any dropdown menu is open (menu has priority)
    if (options.dropdownMenuRow() !== null || options.previewDropdownOpen()) return;

    if (options.previewPanelOpen()) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        options.navigatePreview('prev');
        return;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        options.navigatePreview('next');
        return;
      }
    }

    const viewRows = options.viewRows();
    if (viewRows.length === 0) return;

    const focused = options.focusedRowIndex();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (focused === null || focused === undefined) {
        options.setFocusedRowIndex(0);
      } else if (focused < viewRows.length - 1) {
        options.setFocusedRowIndex(focused + 1);
      } else if (focused === viewRows.length - 1 && options.page() < options.totalPages()) {
        // Trigger next page when reaching end of current page
        if (options.footerUsesClientPaging()) {
          options.setClientSelectedPage(options.clientSelectedPage() + 1);
        } else {
          options.onPageChange(options.page() + 1);
        }
      }
      if (options.previewPanelOpen()) {
        const newFocused = options.focusedRowIndex();
        if (newFocused !== null && newFocused !== undefined) {
          options.openPreview(viewRows[newFocused]);
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (focused === null || focused === undefined) {
        options.setFocusedRowIndex(viewRows.length - 1);
      } else if (focused > 0) {
        options.setFocusedRowIndex(focused - 1);
      } else if (focused === 0 && options.page() > 1) {
        // Trigger previous page when at start of current page
        if (options.footerUsesClientPaging()) {
          options.setClientSelectedPage(options.clientSelectedPage() - 1);
        } else {
          options.onPageChange(options.page() - 1);
        }
      }
      if (options.previewPanelOpen()) {
        const newFocused = options.focusedRowIndex();
        if (newFocused !== null && newFocused !== undefined) {
          options.openPreview(viewRows[newFocused]);
        }
      }
    } else if (e.key === ' ' && focused !== null && focused !== undefined) {
      e.preventDefault();
      const row = viewRows[focused];
      if (row) options.toggleRowSelect(options.rowKey(row));
    } else if (e.key === 'Enter' && focused !== null && focused !== undefined) {
      e.preventDefault();
      const row = viewRows[focused];
      if (row) options.openRowDropdown(row);
    } else if (e.key === 'Escape') {
      options.closeRowDropdown();
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
    const focused = options.focusedRowIndex();
    if (focused === null || focused === undefined) return;
    const tableRef = options.tableRef();
    const row = tableRef?.querySelector(`[data-focused-row-index="${focused}"]`) as HTMLElement;
    if (row) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });

  return {
    handleGlobalKeyDown
  };
}
