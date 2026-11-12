import type { DeepReadonly } from '@primebrick/ui';

export function useScrollPreservation(options: {
  tableRef: () => HTMLTableElement | null;
  rowsLoading: () => boolean;
  /** sessionStorage key — the ELT persistence convention
   *  (`${columnOrderStorageKey}:<feature>`), survives full page reloads.
   *  Absent → in-memory only (loading-transition restores still work). */
  storageKey?: () => string | undefined;
}) {
  const _state = $state({
    savedTableScrollLeft: 0,
    prevRowsLoadingForScrollSave: false,
    prevRowsLoadingForScrollRestore: false,
  });

  function tableScrollHost(table: HTMLTableElement | null): HTMLElement | null {
    if (!table) return null;
    return table.closest('[data-slot=table-container]');
  }

  function readStoredScrollLeft(): number {
    const key = options.storageKey?.();
    if (!key || typeof window === 'undefined') return 0;
    const raw = window.sessionStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function writeStoredScrollLeft(left: number) {
    const key = options.storageKey?.();
    if (!key || typeof window === 'undefined') return;
    window.sessionStorage.setItem(key, String(left));
  }

  /** Persisted position is authoritative; in-memory snapshot is the
   *  fallback for hosts without a storageKey. */
  function effectiveScrollLeft(): number {
    return readStoredScrollLeft() || _state.savedTableScrollLeft;
  }

  function restoreScroll(host: HTMLElement, left: number) {
    queueMicrotask(() => {
      host.scrollLeft = left;
      requestAnimationFrame(() => {
        if (host.scrollLeft !== left) host.scrollLeft = left;
      });
    });
  }

  /** Continuous persistence — a reload can happen at any scroll position,
   *  not just across a loading transition. rAF-throttled writes. */
  $effect(() => {
    const host = tableScrollHost(options.tableRef());
    if (!host || typeof window === 'undefined') return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => writeStoredScrollLeft(host.scrollLeft));
    };
    host.addEventListener('scroll', onScroll, { passive: true });
    // Fresh page load: DOM starts at 0 while sessionStorage kept the
    // position — restore as soon as the host attaches.
    const stored = readStoredScrollLeft();
    if (stored > 0 && host.scrollLeft === 0) restoreScroll(host, stored);
    return () => {
      host.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  });

  /** Capture horizontal scroll before the loading skeleton replaces row markup (browser often resets both axes). */
  $effect.pre(() => {
    void options.rowsLoading();
    void options.tableRef();
    const host = tableScrollHost(options.tableRef());
    if (options.rowsLoading() && !_state.prevRowsLoadingForScrollSave && host) _state.savedTableScrollLeft = host.scrollLeft;
    _state.prevRowsLoadingForScrollSave = options.rowsLoading();
  });

  $effect(() => {
    void options.rowsLoading();
    void options.tableRef();
    const host = tableScrollHost(options.tableRef());
    if (!options.rowsLoading() && _state.prevRowsLoadingForScrollRestore && host) {
      restoreScroll(host, effectiveScrollLeft());
    }
    _state.prevRowsLoadingForScrollRestore = options.rowsLoading();
  });

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    tableScrollHost,
  };
}
