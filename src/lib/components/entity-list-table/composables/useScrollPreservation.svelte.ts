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

  function scrollRange(host: HTMLElement): number {
    return Math.max(0, host.scrollWidth - host.clientWidth);
  }

  /** Raw stored number — `null` when nothing valid is persisted. */
  function storedValue(): number | null {
    const key = options.storageKey?.();
    if (!key || typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Stored format: a FRACTION (0..1) of the scrollable range — the honest
   *  anchor for an auto-layout table whose column widths depend on data,
   *  column visibility and host width. A raw px offset drifts whenever
   *  columns re-layout (fresh data, preview panel, sidebar). Legacy px
   *  values (>1) restore verbatim once, then rewrite as fractions on the
   *  next save. */
  function readStoredScrollLeft(host: HTMLElement): number {
    const n = storedValue();
    if (n === null) return 0;
    if (n <= 1) return n * scrollRange(host);
    return n;
  }

  function writeStoredScrollLeft(host: HTMLElement) {
    const key = options.storageKey?.();
    if (!key || typeof window === 'undefined') return;
    const range = scrollRange(host);
    window.sessionStorage.setItem(key, range > 0 ? String(host.scrollLeft / range) : '0');
  }

  /** Persisted position is authoritative; in-memory snapshot is the
   *  fallback for hosts without a storageKey. */
  function effectiveScrollLeft(host: HTMLElement): number {
    return readStoredScrollLeft(host) || _state.savedTableScrollLeft;
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
    const table = options.tableRef();
    const host = tableScrollHost(table);
    if (!host || typeof window === 'undefined') return;
    let raf = 0;
    // Restore phase: writes stay suppressed until the layout settles.
    // Every scroll event in this window comes from the restore's own
    // (possibly clamped) writes — persisting them degraded the stored
    // position on every reload (the visible "drift"). Bounded window:
    // a user scroll lands as soon as it ends.
    let settled = false;
    const settleTimer = setTimeout(() => (settled = true), 1500);
    const onScroll = () => {
      if (!settled) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => writeStoredScrollLeft(host));
    };
    host.addEventListener('scroll', onScroll, { passive: true });
    // Fresh page load: DOM starts at 0 while sessionStorage kept the
    // position — restore as soon as the host attaches. `settled` keys on
    // the stored value, not the resolved px: the range is still 0 at
    // mount (empty table → no overflow) and must not end the retries.
    settled = storedValue() === null;
    // The table mounts EMPTY (no overflow) before rows render — the
    // one-shot restore is clamped to 0. Re-apply the FRACTION on every
    // content-width growth for the whole settle window: the px target
    // moves as scrollWidth grows, so the position tracks the stored
    // ratio instead of latching at the first reachable px.
    const tryRestore = () => {
      if (settled || host.scrollWidth <= host.clientWidth) return;
      host.scrollLeft = readStoredScrollLeft(host);
    };
    tryRestore();
    const ro = new ResizeObserver(tryRestore);
    if (table) ro.observe(table);
    ro.observe(host);
    return () => {
      host.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
      clearTimeout(settleTimer);
      ro.disconnect();
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
      restoreScroll(host, effectiveScrollLeft(host));
    }
    _state.prevRowsLoadingForScrollRestore = options.rowsLoading();
  });

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    tableScrollHost,
  };
}
