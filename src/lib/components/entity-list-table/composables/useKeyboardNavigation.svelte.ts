export function useKeyboardNavigation<T>(options: {
  viewRows: () => T[];
  rowSelectionEnabled: () => boolean;
  selectedKeys: () => string[];
  onSelectedKeysChange: () => (keys: string[]) => void;
  rowKey: (row: T) => string;
  previewPanelOpen: () => boolean;
  previewRowIndex: () => number;
  focusedRowIndex: () => number | null;
  setFocusedRowIndex: (index: number) => void;
  openPreview: (row: T) => void;
  navigatePreview: (direction: 'next' | 'prev') => void;
  dropdownMenuRow: () => T | null;
  previewDropdownOpen: () => boolean;
  closeRowDropdown: () => void;
  // Unified pager channel — same pair the footer buttons read (footerPage /
  // footerTotalPages): server paging and client "selected only" paging are
  // already collapsed upstream, so keys never duplicate that branching.
  currentPage: () => number;
  pageCount: () => number;
  goToPage: (p: number) => void;
  // The toolbar NEW CTA — sheet/goto/popup is owned by the handler; the
  // Insert key is claimed only when a create CTA actually exists.
  createAction: () => (() => void) | undefined;
  openRowDropdown: (row: T) => void;
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

    // Pager keys — table-level, so they run before the empty-list guard:
    // PageUp must still work on an empty page (e.g. rows deleted). Clamped
    // like the footer buttons; only claimed when the pager actually exists.
    const pageCount = options.pageCount();
    if (pageCount > 1) {
      const current = options.currentPage();
      const go = (p: number) => {
        e.preventDefault();
        const clamped = Math.min(Math.max(1, p), pageCount);
        if (clamped !== current) options.goToPage(clamped);
      };
      if (e.key === 'PageDown') return go(current + 1);
      if (e.key === 'PageUp') return go(current - 1);
      if (e.key === 'Home') return go(1);
      if (e.key === 'End') return go(pageCount);
    }

    if (e.key === 'Insert') {
      const fn = options.createAction();
      if (fn) {
        e.preventDefault();
        fn();
      }
      return;
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
      } else if (focused === viewRows.length - 1 && options.currentPage() < options.pageCount()) {
        // Trigger next page when reaching end of current page
        options.goToPage(options.currentPage() + 1);
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
      } else if (focused === 0 && options.currentPage() > 1) {
        // Trigger previous page when at start of current page
        options.goToPage(options.currentPage() - 1);
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
