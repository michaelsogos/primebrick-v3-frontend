<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Sheet from '$lib/components/ui/sheet';
  import { cn } from '$lib/utils.js';
  import type { MetaColumn, SortDir } from '$lib/entity-list/types';
  import XIcon from '@lucide/svelte/icons/x';
  import {
    SlidersHorizontal,
    Columns3,
    Search,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Check,
    TriangleAlert,
    Hourglass,
    CircleX,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ChevronUp,
    RotateCw,
    RotateCcw,
    MoreVertical
  } from 'lucide-svelte';

  type CellArgs = { row: TRow; column: MetaColumn };

  let {
    uid,
    columns,
    defaultSort,
    pageSizeOptions: pageSizeOptionsProp,
    searchPlaceholderKey,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    rows,
    total,
    metaLoading,
    rowsLoading,
    error,
    page,
    pageSize,
    onPageChange,
    onPageSizeChange,
    search,
    onSearchInput,
    searchInKeys,
    onSearchInKeysChange,
    sortKey,
    sortDir,
    onSortChange,
    visibleKeys,
    onVisibleKeysChange,
    onResetColumnVisibility,
    selectedKeys,
    onSelectedKeysChange,
    rowSelectionEnabled = true,
    onRefresh,
    refreshDisabled = false,
    rowActionsEnabled = false,
    rowActions,
    filtersOpen = $bindable(false),
    cell,
    filters,
    metaLoadingView,
    rowsLoadingView,
    emptyView,
    errorView,
    loadingMessage,
    noRecordsMessage
  }: {
    /** Meta column key whose values uniquely identify a row in the list (uuid, id, …). */
    uid: string;
    columns: MetaColumn[];
    defaultSort?: { key: string; dir: SortDir };
    pageSizeOptions?: number[];
    searchPlaceholderKey?: string;
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;
    rows: TRow[];
    total: number;
    metaLoading: boolean;
    rowsLoading: boolean;
    error: string | null;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    search: string;
    onSearchInput: (value: string) => void;
    searchInKeys: string[] | null;
    onSearchInKeysChange: (keys: string[] | null) => void;
    sortKey: string | null;
    sortDir: SortDir;
    onSortChange: (key: string | null, dir: SortDir) => void;
    visibleKeys: string[];
    onVisibleKeysChange: (keys: string[]) => void;
    onResetColumnVisibility: () => void;
    selectedKeys: string[];
    onSelectedKeysChange: (keys: string[]) => void;
    rowSelectionEnabled?: boolean;
    onRefresh: () => void;
    refreshDisabled?: boolean;
    rowActionsEnabled?: boolean;
    rowActions?: Snippet<[ { row: TRow } ]>;
    filtersOpen?: boolean;
    cell?: Snippet<[CellArgs]>;
    filters?: Snippet;
    metaLoadingView?: Snippet;
    rowsLoadingView?: Snippet;
    emptyView?: Snippet;
    errorView?: Snippet;
    loadingMessage?: string;
    noRecordsMessage?: string;
  } = $props();

  let columnsMenuOpen = $state(false);
  let searchMenuOpen = $state(false);
  let headerCheckbox = $state<HTMLInputElement | null>(null);

  let rowRangeMouseDown = $state(false);
  let rangeAnchorIndex = $state<number | null>(null);
  let rangeDragActive = $state(false);
  let lastRangeEndIndex = $state<number | null>(null);
  /** Selection at mousedown; current drag applies symmetric diff with the active range vs this snapshot. */
  let selectionSnapshotAtMouseDown: Set<string> | null = null;

  const defaultSortDir = $derived(defaultSort?.dir ?? 'asc');
  const pageSizeOptions = $derived(pageSizeOptionsProp ?? [10, 25, 50, 100]);
  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));
  const searchableColumns = $derived(columns.filter((c) => c.searchable !== false));
  const shownColumns = $derived(columns.filter((c) => visibleKeys.includes(c.key)));
  const renderColumns = $derived(
    (() => {
      // Ensure UUID is the first visible data column (after row checkbox),
      // and keep `code` immediately after it.
      const cols = shownColumns;
      const byKey = new Map(cols.map((c) => [c.key, c] as const));
      const out: MetaColumn[] = [];
      const uuid = byKey.get('uuid');
      const code = byKey.get('code');
      if (uuid) out.push(uuid);
      if (code) out.push(code);
      for (const c of cols) {
        if (c.key === 'uuid' || c.key === 'code') continue;
        out.push(c);
      }
      return out;
    })()
  );
  const pageKeys = $derived(rows.map((r) => rowKey(r)));
  const selectedOnPageCount = $derived(pageKeys.filter((k) => selectedKeys.includes(k)).length);
  const allOnPageSelected = $derived(pageKeys.length > 0 && selectedOnPageCount === pageKeys.length);
  const actionsEnabled = $derived(!!rowActionsEnabled || !!rowActions);
  const extraCols = $derived((rowSelectionEnabled ? 1 : 0) + (actionsEnabled ? 1 : 0));

  // Sticky offsets (measured widths so we can keep columns auto-sized).
  let checkboxHeadRef = $state<HTMLElement | null>(null);
  let uuidHeadRef = $state<HTMLElement | null>(null);
  let codeHeadRef = $state<HTMLElement | null>(null);
  let uuidFirstCellRef = $state<HTMLElement | null>(null);
  let codeFirstCellRef = $state<HTMLElement | null>(null);
  let stickyLeftUuidPx = $state(0);
  let stickyLeftCodePx = $state(0);
  let stickyRO: ResizeObserver | null = null;

  function updateStickyOffsets() {
    const checkboxW = rowSelectionEnabled ? (checkboxHeadRef?.getBoundingClientRect().width ?? 0) : 0;
    // With table-layout:auto, body cells often drive the final column width.
    const uuidHeadW = uuidHeadRef?.getBoundingClientRect().width ?? 0;
    const codeHeadW = codeHeadRef?.getBoundingClientRect().width ?? 0;
    const uuidCellW = uuidFirstCellRef?.getBoundingClientRect().width ?? 0;
    const codeCellW = codeFirstCellRef?.getBoundingClientRect().width ?? 0;
    const uuidW = Math.max(uuidHeadW, uuidCellW);
    const codeW = Math.max(codeHeadW, codeCellW);

    const nextLeftUuid = Math.round(checkboxW);
    const nextLeftCode = Math.round(checkboxW + uuidW);

    // Avoid update loops when called from afterUpdate(): only write if changed.
    if (stickyLeftUuidPx !== nextLeftUuid) stickyLeftUuidPx = nextLeftUuid;
    if (stickyLeftCodePx !== nextLeftCode) stickyLeftCodePx = nextLeftCode;
  }

  onMount(() => {
    const onResize = () => {
      requestAnimationFrame(() => updateStickyOffsets());
    };
    window.addEventListener('resize', onResize);
    requestAnimationFrame(() => updateStickyOffsets());
    return () => window.removeEventListener('resize', onResize);
  });

  // Keep offsets correct across HMR/theme/style changes without requiring a full refresh.
  $effect(() => {
    void checkboxHeadRef;
    void uuidHeadRef;
    void codeHeadRef;
    void uuidFirstCellRef;
    void codeFirstCellRef;

    stickyRO?.disconnect();
    stickyRO = null;

    if (typeof ResizeObserver === 'undefined') return;
    stickyRO = new ResizeObserver(() => {
      requestAnimationFrame(() => updateStickyOffsets());
    });

    if (checkboxHeadRef) stickyRO.observe(checkboxHeadRef);
    if (uuidHeadRef) stickyRO.observe(uuidHeadRef);
    if (codeHeadRef) stickyRO.observe(codeHeadRef);
    if (uuidFirstCellRef) stickyRO.observe(uuidFirstCellRef);
    if (codeFirstCellRef) stickyRO.observe(codeFirstCellRef);

    requestAnimationFrame(() => updateStickyOffsets());

    return () => {
      stickyRO?.disconnect();
      stickyRO = null;
    };
  });

  // Recompute offsets when column set changes (but not on scroll).
  $effect(() => {
    void rowSelectionEnabled;
    void actionsEnabled;
    void visibleKeys;
    void columns;
    requestAnimationFrame(() => updateStickyOffsets());
  });

  function stickyCellClass(key: string, idx: number, isHeader: boolean): string | undefined {
    if (key !== 'uuid' && key !== 'code') return undefined;
    // Header background must be opaque in dark mode (otherwise rows show through and header text looks faded).
    const baseBg = isHeader ? 'bg-sky-50 dark:bg-sky-950' : 'bg-background';
    const left = key === 'uuid' ? 'left-[var(--pb-sticky-left-uuid)]' : 'left-[var(--pb-sticky-left-code)]';
    const z = isHeader ? 'z-50' : 'z-40';
    // bg-clip-border is important: Table primitives use bg-clip-padding, which can leave the border area "see-through"
    // when sticky columns overlap scrolling content.
    return `sticky ${left} ${z} ${baseBg} bg-clip-border`.trim();
  }

  const auditingKeySet = new Set([
    'created_at',
    'created_by',
    'updated_at',
    'updated_by',
    'version',
    'deleted_at',
    'deleted_by'
  ]);
  const nonAuditingColumns = $derived(columns.filter((c) => !auditingKeySet.has(c.key)));
  const auditingColumns = $derived(columns.filter((c) => auditingKeySet.has(c.key)));

  const searchScopeLabel = $derived(() => {
    if (!searchInKeys || searchInKeys.length === 0) return $t('entities.list.searchInAll');
    const keys = searchInKeys;
    if (keys.length === 1) {
      const col = searchableColumns.find((c) => c.key === keys[0]);
      return col ? $t(col.labelKey) : keys[0];
    }
    return `${keys.length} ${$t('entities.list.searchInFields')}`;
  });

  function rowKey(row: TRow): string {
    const v = row[uid as keyof TRow] as unknown;
    return typeof v === 'string' ? v : String(v ?? '');
  }

  function toggleSearchKey(key: string) {
    if (!searchInKeys || searchInKeys.length === 0) {
      onSearchInKeysChange([key]);
      return;
    }
    if (searchInKeys.includes(key)) {
      const next = searchInKeys.filter((k) => k !== key);
      onSearchInKeysChange(next.length ? next : null);
      return;
    }
    onSearchInKeysChange([...searchInKeys, key]);
  }

  function toggleColumnKey(key: string) {
    const col = columns.find((c) => c.key === key);
    if (col?.hideable === false) return;

    if (visibleKeys.includes(key)) {
      const next = visibleKeys.filter((k) => k !== key);
      if (next.length > 0) onVisibleKeysChange(next);
      return;
    }
    onVisibleKeysChange([...visibleKeys, key]);
  }

  function handleSortClick(col: MetaColumn) {
    if (rowsLoading) return;
    if (!col.sortable) return;
    if (sortKey !== col.key) {
      onSortChange(col.key, 'asc');
    } else if (sortDir === 'asc') {
      onSortChange(col.key, 'desc');
    } else {
      onSortChange(null, defaultSortDir);
    }
  }

  function toggleRowSelect(key: string) {
    if (selectedKeys.includes(key)) {
      onSelectedKeysChange(selectedKeys.filter((k) => k !== key));
    } else {
      onSelectedKeysChange([...selectedKeys, key]);
    }
  }

  function toggleAllOnPage() {
    if (allOnPageSelected) {
      const remove = new Set(pageKeys);
      onSelectedKeysChange(selectedKeys.filter((k) => !remove.has(k)));
      return;
    }
    const next = new Set(selectedKeys);
    for (const k of pageKeys) next.add(k);
    onSelectedKeysChange([...next]);
  }

  function resetRowRangeSelect() {
    rowRangeMouseDown = false;
    rangeAnchorIndex = null;
    rangeDragActive = false;
    lastRangeEndIndex = null;
    selectionSnapshotAtMouseDown = null;
  }

  function canStartRowRangeSelect(e: MouseEvent): boolean {
    if (!rowSelectionEnabled || rowsLoading || error || rows.length === 0) return false;
    if (e.button !== 0) return false;
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    if (t.closest('input, button, a, textarea, select, [role="button"]')) return false;
    return true;
  }

  /** Rows in [anchor, end] toggle vs `selectionSnapshotAtMouseDown` (additive across strokes; rubber-band). */
  function applyRowRangeBrush(anchor: number, end: number) {
    const snap = selectionSnapshotAtMouseDown;
    if (!snap) return;

    const lo = Math.min(anchor, end);
    const hi = Math.max(anchor, end);
    const rangeKeys = rows.slice(lo, hi + 1).map((r) => rowKey(r));
    const rangeSet = new Set(rangeKeys);
    const pageKeySet = new Set(pageKeys);

    const next = new Set<string>();
    for (const k of snap) {
      if (!pageKeySet.has(k)) {
        next.add(k);
        continue;
      }
      if (rangeSet.has(k)) continue;
      next.add(k);
    }
    for (const k of rangeKeys) {
      if (!snap.has(k)) next.add(k);
    }
    onSelectedKeysChange([...next]);
  }

  function onRowRangeMouseDown(i: number, e: MouseEvent) {
    if (!canStartRowRangeSelect(e)) return;
    e.preventDefault();
    selectionSnapshotAtMouseDown = new Set(selectedKeys);
    rowRangeMouseDown = true;
    rangeAnchorIndex = i;
    rangeDragActive = false;
    lastRangeEndIndex = null;
  }

  function onRowRangeMouseMove(e: MouseEvent) {
    if (!rowRangeMouseDown || rangeAnchorIndex === null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tr = el?.closest?.('tr[data-row-index]');
    if (!(tr instanceof HTMLElement)) return;
    const raw = tr.dataset.rowIndex;
    const idx = raw === undefined ? NaN : Number(raw);
    if (!Number.isFinite(idx) || idx < 0 || idx >= rows.length) return;

    if (!rangeDragActive) {
      if (idx === rangeAnchorIndex) return;
      rangeDragActive = true;
    }
    if (lastRangeEndIndex === idx) return;
    lastRangeEndIndex = idx;
    applyRowRangeBrush(rangeAnchorIndex, idx);
  }

  $effect(() => {
    void page;
    void pageSize;
    void rowsLoading;
    void error;
    resetRowRangeSelect();
  });

  $effect(() => {
    if (!rowRangeMouseDown) return;
    const move = (e: MouseEvent) => onRowRangeMouseMove(e);
    const up = () => resetRowRangeSelect();
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  });

  $effect(() => {
    if (!headerCheckbox || !rowSelectionEnabled) return;
    headerCheckbox.indeterminate = selectedOnPageCount > 0 && !allOnPageSelected;
  });

  const loadingText = $derived(loadingMessage ?? $t('common.loading'));
  const emptyText = $derived(noRecordsMessage ?? $t('entities.list.noRecords'));

  const selectionCount = $derived(selectedKeys.length);
  const selectionPastParticipleKey = $derived(
    selectionCount === 1 ? 'entities.list.selectedSingular' : 'entities.list.selectedPlural'
  );
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
  <div class="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2">
    <div class="flex min-w-[260px] flex-1 items-center gap-2 sm:max-w-[520px]">
      <div class="relative w-full">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          class="pl-8 pr-28 border-sky-100 focus-visible:ring-sky-200/50 focus-visible:border-sky-200 dark:border-sky-900/40 dark:focus-visible:ring-sky-900/40 dark:focus-visible:border-sky-900/60"
          value={search}
          oninput={(e) => onSearchInput((e.currentTarget as HTMLInputElement).value)}
          placeholder={$t(searchPlaceholderKey ?? 'entities.list.searchPlaceholder')}
        />

        <div class="absolute right-1 top-1/2 -translate-y-1/2">
          <Sheet.Root bind:open={searchMenuOpen}>
            <Sheet.Trigger>
              {#snippet child({ props })}
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-1 rounded-md border border-sky-100 bg-sky-50 px-2 text-xs text-foreground/80 shadow-xs hover:bg-sky-100/70 hover:border-sky-200 dark:border-sky-900/40 dark:bg-sky-950/30 dark:hover:bg-sky-950/40"
                  {...props}
                >
                  {searchScopeLabel()}
                </button>
              {/snippet}
            </Sheet.Trigger>

            <Sheet.Content side="right" class="w-[360px] p-0" showClose={false}>
              <div class="flex h-full flex-col">
                <div class="flex items-center justify-between gap-2 border-b px-4 py-3">
                  <div class="text-sm font-medium">{$t('entities.list.searchIn')}</div>
                  <div class="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      class="text-muted-foreground opacity-70 hover:bg-accent hover:text-accent-foreground hover:opacity-100"
                      onclick={() => onSearchInKeysChange(null)}
                      title={$t('common.reset')}
                    >
                      <RotateCcw class="size-4" />
                    </Button>
                    <Sheet.Close
                      class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
                      title={$t('common.done')}
                    >
                      <XIcon class="size-4" />
                    </Sheet.Close>
                  </div>
                </div>

                <div class="min-h-0 flex-1 overflow-auto px-2 py-2">
                  <button
                    type="button"
                    class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                    onclick={() => onSearchInKeysChange(null)}
                  >
                    <span class="truncate">{$t('entities.list.searchInAll')}</span>
                    <Check
                      class={!searchInKeys || searchInKeys.length === 0
                        ? 'size-4 text-success'
                        : 'size-4 text-muted-foreground opacity-40'}
                    />
                  </button>

                  <div class="my-2 px-2">
                    <div class="h-px bg-border"></div>
                  </div>

                  {#each searchableColumns as col (col.key)}
                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                      onclick={() => toggleSearchKey(col.key)}
                    >
                      <span class="truncate">{$t(col.labelKey)}</span>
                      <Check
                        class={searchInKeys?.includes(col.key)
                          ? 'size-4 text-success'
                          : 'size-4 text-muted-foreground opacity-40'}
                      />
                    </button>
                  {/each}
                </div>
              </div>
            </Sheet.Content>
          </Sheet.Root>
        </div>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2">
      <Button
        variant="soft"
        size="icon-sm"
        disabled={rowsLoading || refreshDisabled}
        onclick={() => onRefresh()}
        aria-label="refresh"
        title="refresh"
      >
        <RotateCw class={rowsLoading ? 'size-4 animate-spin' : 'size-4'} />
      </Button>

      <Sheet.Root bind:open={columnsMenuOpen}>
        <Sheet.Trigger>
          {#snippet child({ props })}
            <Button variant="soft" size="sm" {...props}>
              <Columns3 class="size-4" />
              {$t('entities.list.columns')}
            </Button>
          {/snippet}
        </Sheet.Trigger>
        <Sheet.Content side="right" class="w-[360px] p-0" showClose={false}>
          <div class="flex h-full flex-col">
            <div class="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div class="text-sm font-medium">{$t('entities.list.columns')}</div>
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-muted-foreground opacity-70 hover:bg-accent hover:text-accent-foreground hover:opacity-100"
                  onclick={() => onResetColumnVisibility()}
                  title={$t('common.reset')}
                >
                  <RotateCcw class="size-4" />
                </Button>
                <Sheet.Close
                  class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
                  title={$t('common.done')}
                >
                  <XIcon class="size-4" />
                </Sheet.Close>
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-auto px-2 py-2">
              {#each nonAuditingColumns as col (col.key)}
                <button
                  type="button"
                  class={col.hideable === false
                    ? 'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm opacity-60 hover:bg-accent'
                    : 'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent'}
                  onclick={() => toggleColumnKey(col.key)}
                >
                  <span class="truncate">{$t(col.labelKey)}</span>
                  <Check
                    class={visibleKeys.includes(col.key)
                      ? 'size-4 text-success'
                      : 'size-4 text-muted-foreground opacity-40'}
                  />
                </button>
              {/each}

              {#if auditingColumns.length > 0}
                <div class="my-2 px-2">
                  <div class="flex items-center gap-2">
                    <div class="h-px flex-1 bg-border"></div>
                    <div class="text-xs font-medium text-muted-foreground">{$t('entities.list.auditingFields')}</div>
                    <div class="h-px flex-1 bg-border"></div>
                  </div>
                </div>

                {#each auditingColumns as col (col.key)}
                  <button
                    type="button"
                    class={col.hideable === false
                      ? 'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm opacity-60 hover:bg-accent'
                      : 'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent'}
                    onclick={() => toggleColumnKey(col.key)}
                  >
                    <span class="truncate">{$t(col.labelKey)}</span>
                    <Check
                      class={visibleKeys.includes(col.key)
                        ? 'size-4 text-success'
                        : 'size-4 text-muted-foreground opacity-40'}
                    />
                  </button>
                {/each}
              {/if}
            </div>
          </div>
        </Sheet.Content>
      </Sheet.Root>

      {#if filters}
        <Button variant="soft" size="sm" onclick={() => (filtersOpen = true)}>
          <SlidersHorizontal class="size-4" />
          {$t('entities.list.filters')}
        </Button>
      {/if}
    </div>
  </div>

  <div class="min-h-0 flex-1 overflow-hidden">
    {#if metaLoading}
      {#if metaLoadingView}
        {@render metaLoadingView()}
      {:else}
        <div class="grid h-full place-items-center p-3">
          <div class="relative flex flex-col items-center gap-2 text-center">
            <div class="pb-watermark-loading">
              <Hourglass class="size-20 text-info" />
            </div>
            <div class="text-sm font-medium text-muted-foreground">{loadingText}</div>
          </div>
        </div>
      {/if}
    {:else}
      <Table.Root
        class="w-full bg-background [&_[data-slot=table]]:isolate [&_[data-slot=table]]:bg-background [&_[data-slot=table-cell]]:bg-background [&_[data-slot=table-cell]]:bg-clip-border [&_[data-slot=table-head]]:bg-sky-50 [&_[data-slot=table-head]]:bg-clip-border [&_[data-slot=table-head]]:text-foreground dark:[&_[data-slot=table-head]]:bg-sky-950 dark:[&_[data-slot=table-head]]:text-foreground dark:[&_[data-slot=table-head]]:opacity-100"
        containerClass="h-full overflow-auto"
        style={`--pb-sticky-left-uuid: ${stickyLeftUuidPx}px; --pb-sticky-left-code: ${stickyLeftCodePx}px;`}
      >
        <Table.Header class="sticky top-0 z-[80] bg-sky-50 dark:bg-sky-950">
          <Table.Row>
            {#if rowSelectionEnabled}
              <Table.Head
                bind:ref={checkboxHeadRef}
                class="w-10 min-w-10 max-w-10 sticky left-0 z-[70] bg-sky-50 dark:bg-sky-950 bg-clip-border px-2"
              >
                <div class="flex h-10 items-center justify-center">
                  <input
                    bind:this={headerCheckbox}
                    type="checkbox"
                    class="size-4 rounded border-input text-primary accent-primary"
                    checked={allOnPageSelected}
                    onclick={toggleAllOnPage}
                    aria-label="select all"
                  />
                </div>
              </Table.Head>
            {/if}
            {#each renderColumns as col, colIdx (col.key)}
              {#if col.key === 'uuid'}
                <Table.Head
                  bind:ref={uuidHeadRef}
                  class={stickyCellClass(col.key, colIdx, true) ??
                    (col.sortable
                      ? rowsLoading
                        ? 'relative z-10 select-none opacity-60'
                        : 'relative z-10 cursor-pointer select-none'
                      : 'relative z-10')}
                  onclick={() => handleSortClick(col)}
                >
                <span class="inline-flex items-center gap-1">
                  {$t(col.labelKey)}
                  {#if col.sortable}
                    {#if sortKey !== col.key}
                      <ArrowUpDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-60'} />
                    {:else if sortDir === 'asc'}
                      <ArrowUp class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                    {:else}
                      <ArrowDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                    {/if}
                  {/if}
                </span>
                </Table.Head>
              {:else if col.key === 'code'}
                <Table.Head
                  bind:ref={codeHeadRef}
                  class={stickyCellClass(col.key, colIdx, true) ??
                    (col.sortable
                      ? rowsLoading
                        ? 'relative z-10 select-none opacity-60'
                        : 'relative z-10 cursor-pointer select-none'
                      : 'relative z-10')}
                  onclick={() => handleSortClick(col)}
                >
                  <span class="inline-flex items-center gap-1">
                    {$t(col.labelKey)}
                    {#if col.sortable}
                      {#if sortKey !== col.key}
                        <ArrowUpDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-60'} />
                      {:else if sortDir === 'asc'}
                        <ArrowUp class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                      {:else}
                        <ArrowDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                      {/if}
                    {/if}
                  </span>
                </Table.Head>
              {:else}
                <Table.Head
                  class={stickyCellClass(col.key, colIdx, true) ??
                    (col.sortable
                      ? rowsLoading
                        ? 'relative z-10 select-none opacity-60'
                        : 'relative z-10 cursor-pointer select-none'
                      : 'relative z-10')}
                  onclick={() => handleSortClick(col)}
                >
                  <span class="inline-flex items-center gap-1">
                    {$t(col.labelKey)}
                    {#if col.sortable}
                      {#if sortKey !== col.key}
                        <ArrowUpDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-60'} />
                      {:else if sortDir === 'asc'}
                        <ArrowUp class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                      {:else}
                        <ArrowDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                      {/if}
                    {/if}
                  </span>
                </Table.Head>
              {/if}
            {/each}
            {#if actionsEnabled}
              <Table.Head
                class="w-10 min-w-10 max-w-10 sticky right-0 z-[70] bg-sky-50 dark:bg-sky-950 bg-clip-border px-2"
              >
                <div class="flex h-10 items-center justify-center">
                  <span class="sr-only">actions</span>
                </div>
              </Table.Head>
            {/if}
          </Table.Row>
        </Table.Header>
        <Table.Body
          class={rowSelectionEnabled && rowRangeMouseDown && rangeDragActive ? 'select-none' : undefined}
        >
          {#if error}
            {#if errorView}
              {@render errorView()}
            {:else}
              <Table.Row>
                <Table.Cell colspan={renderColumns.length + extraCols} class="p-0">
                  <div class="grid min-h-[14rem] place-items-center p-3">
                    <div class="relative flex flex-col items-center gap-2 text-center">
                      <div class="pb-watermark-error">
                        <CircleX class="size-20 text-destructive" />
                      </div>
                      <div class="text-sm font-medium text-muted-foreground">{error}</div>
                    </div>
                  </div>
                </Table.Cell>
              </Table.Row>
            {/if}
          {:else if rowsLoading}
            {#if rowsLoadingView}
              {@render rowsLoadingView()}
            {:else}
              <Table.Row>
                <Table.Cell colspan={renderColumns.length + extraCols} class="p-0">
                  <div class="w-full">
                    <div class="h-0.5 w-full overflow-hidden bg-muted">
                      <div class="h-full w-1/3 bg-info pb-loading-bar"></div>
                    </div>
                    <div class="grid min-h-[14rem] place-items-center p-3">
                      <div class="relative flex flex-col items-center gap-2 text-center">
                        <div class="pb-watermark-loading">
                          <Hourglass class="size-20 text-info" />
                        </div>
                        <div class="text-sm font-medium text-muted-foreground">{loadingText}</div>
                      </div>
                    </div>
                  </div>
                </Table.Cell>
              </Table.Row>
            {/if}
          {:else if rows.length === 0}
            {#if emptyView}
              {@render emptyView()}
            {:else}
              <Table.Row>
                <Table.Cell colspan={renderColumns.length + extraCols} class="p-0">
                  <div class="grid min-h-[14rem] place-items-center p-3">
                    <div class="relative flex flex-col items-center gap-2 text-center">
                      <div class="pb-watermark-empty">
                        <TriangleAlert class="size-20 text-warning" />
                      </div>
                      <div class="text-sm font-medium text-muted-foreground">{emptyText}</div>
                    </div>
                  </div>
                </Table.Cell>
              </Table.Row>
            {/if}
          {:else}
            {#each rows as r, i (rowKey(r))}
              {@const rk = rowKey(r)}
              {@const rowSelected = rowSelectionEnabled && selectedKeys.includes(rk)}
              <Table.Row
                data-row-index={rowSelectionEnabled ? i : undefined}
                data-state={rowSelected ? 'selected' : undefined}
                class={rowSelected
                  ? 'bg-sky-50 data-[state=selected]:bg-sky-50 hover:[&,&>svelte-css-wrapper]:[&>th,td]:bg-sky-100 dark:bg-sky-950 dark:data-[state=selected]:bg-sky-950 dark:hover:[&,&>svelte-css-wrapper]:[&>th,td]:bg-sky-900'
                  : undefined}
                onmousedown={rowSelectionEnabled ? (e) => onRowRangeMouseDown(i, e) : undefined}
              >
                {#if rowSelectionEnabled}
                  <Table.Cell class="w-10 min-w-10 max-w-10 sticky left-0 z-50 bg-background bg-clip-border p-2">
                    <div class="flex h-10 items-center justify-center">
                      <input
                        type="checkbox"
                        class="size-4 rounded border-input text-primary accent-primary"
                        checked={selectedKeys.includes(rk)}
                        onclick={() => toggleRowSelect(rk)}
                        aria-label="select row"
                      />
                    </div>
                  </Table.Cell>
                {/if}
                {#each renderColumns as col, colIdx (col.key)}
                  {#if col.key === 'uuid'}
                    {#if i === 0}
                      <Table.Cell bind:ref={uuidFirstCellRef} class={stickyCellClass(col.key, colIdx, false)}>
                        {#if cell}
                          {@render cell({ row: r, column: col })}
                        {:else}
                          {String(r[col.key as keyof TRow] ?? '')}
                        {/if}
                      </Table.Cell>
                    {:else}
                      <Table.Cell class={stickyCellClass(col.key, colIdx, false)}>
                        {#if cell}
                          {@render cell({ row: r, column: col })}
                        {:else}
                          {String(r[col.key as keyof TRow] ?? '')}
                        {/if}
                      </Table.Cell>
                    {/if}
                  {:else if col.key === 'code'}
                    {#if i === 0}
                      <Table.Cell bind:ref={codeFirstCellRef} class={stickyCellClass(col.key, colIdx, false)}>
                        {#if cell}
                          {@render cell({ row: r, column: col })}
                        {:else}
                          {String(r[col.key as keyof TRow] ?? '')}
                        {/if}
                      </Table.Cell>
                    {:else}
                      <Table.Cell class={stickyCellClass(col.key, colIdx, false)}>
                        {#if cell}
                          {@render cell({ row: r, column: col })}
                        {:else}
                          {String(r[col.key as keyof TRow] ?? '')}
                        {/if}
                      </Table.Cell>
                    {/if}
                  {:else}
                    <Table.Cell class={stickyCellClass(col.key, colIdx, false)}>
                      {#if cell}
                        {@render cell({ row: r, column: col })}
                      {:else}
                        {String(r[col.key as keyof TRow] ?? '')}
                      {/if}
                    </Table.Cell>
                  {/if}
                {/each}
                {#if actionsEnabled}
                  <Table.Cell class="w-10 min-w-10 max-w-10 sticky right-0 z-50 bg-background bg-clip-border p-2">
                    <div class="flex h-10 items-center justify-center">
                      {#if rowActions}
                        {@render rowActions({ row: r })}
                      {:else}
                        <Button variant="ghost" size="icon-sm" aria-label="row actions" title="actions">
                          <MoreVertical class="size-4" />
                        </Button>
                      {/if}
                    </div>
                  </Table.Cell>
                {/if}
              </Table.Row>
            {/each}
          {/if}
        </Table.Body>
      </Table.Root>
    {/if}
  </div>

  <div class="flex items-center justify-between gap-3 border-t bg-background px-3 py-2 text-sm">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div class="text-muted-foreground">
        {#if total === 0}
          0
        {:else}
          {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} / {total}
        {/if}
      </div>
      {#if rowSelectionEnabled && selectionCount > 0}
        <div class="text-info">
          {selectionCount}
          {#if selectionCount === 1}
            {#if selectionLabelSingularText}
              {' '}{selectionLabelSingularText}{' '}
            {:else if selectionLabelSingularKey}
              {' '}{$t(selectionLabelSingularKey)}{' '}
            {:else if selectionLabelText}
              {' '}{selectionLabelText}{' '}
            {:else if selectionLabelKey}
              {' '}{$t(selectionLabelKey)}{' '}
            {/if}
          {:else if selectionLabelText}
            {' '}{selectionLabelText}{' '}
          {:else if selectionLabelKey}
            {' '}{$t(selectionLabelKey)}{' '}
          {/if}
          {$t(selectionPastParticipleKey)}
        </div>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button variant="soft" size="sm" {...props}>
              {pageSize}
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {#each pageSizeOptions as opt (opt)}
            <DropdownMenu.Item
              onSelect={() => {
                onPageSizeChange(opt);
              }}
            >
              {opt}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <span class="text-muted-foreground">{$t('entities.list.pageSize')}</span>

      <Button
        variant="soft"
        size="icon-sm"
        disabled={page <= 1}
        onclick={() => onPageChange(1)}
        aria-label="first page"
        title="first page"
      >
        <ChevronsLeft class="size-4" />
      </Button>
      <Button
        variant="soft"
        size="icon-sm"
        disabled={page <= 1}
        onclick={() => onPageChange(Math.max(1, page - 1))}
        aria-label="previous page"
        title="previous page"
      >
        <ChevronLeft class="size-4" />
      </Button>
      <div class="min-w-[7rem] text-center text-muted-foreground">{page} / {totalPages}</div>
      <Button
        variant="soft"
        size="icon-sm"
        disabled={page >= totalPages}
        onclick={() => onPageChange(Math.min(totalPages, page + 1))}
        aria-label="next page"
        title="next page"
      >
        <ChevronRight class="size-4" />
      </Button>
      <Button
        variant="soft"
        size="icon-sm"
        disabled={page >= totalPages}
        onclick={() => onPageChange(totalPages)}
        aria-label="last page"
        title="last page"
      >
        <ChevronsRight class="size-4" />
      </Button>
    </div>
  </div>
</div>

{#if filters}
  <Sheet.Root bind:open={filtersOpen}>
    <Sheet.Content side="right" class="w-[360px] p-0">
      {@render filters()}
    </Sheet.Content>
  </Sheet.Root>
{/if}

<style>
  @keyframes pb-indeterminate {
    0% {
      transform: translateX(-120%);
    }
    100% {
      transform: translateX(360%);
    }
  }

  .pb-loading-bar {
    animation: pb-indeterminate 1.2s ease-in-out infinite;
  }

  @keyframes pb-watermark-pulse {
    0%,
    100% {
      opacity: 0.12;
      transform: translateY(0) scale(1);
    }
    50% {
      opacity: 0.22;
      transform: translateY(-6px) scale(1.06);
    }
  }

  @keyframes pb-watermark-hourglass {
    0% {
      transform: rotate(0deg) scale(1);
      opacity: 0.12;
    }
    45% {
      transform: rotate(0deg) scale(1.06);
      opacity: 0.22;
    }
    55% {
      transform: rotate(180deg) scale(1.06);
      opacity: 0.22;
    }
    100% {
      transform: rotate(180deg) scale(1);
      opacity: 0.12;
    }
  }

  .pb-watermark-empty {
    transform-origin: center;
    animation: pb-watermark-pulse 2.6s ease-in-out infinite;
  }

  .pb-watermark-loading {
    transform-origin: center;
    animation: pb-watermark-hourglass 1.8s ease-in-out infinite alternate;
  }

  @keyframes pb-watermark-error {
    0%,
    100% {
      opacity: 0.1;
      transform: scale(1);
    }
    50% {
      opacity: 0.18;
      transform: scale(1.05);
    }
  }

  .pb-watermark-error {
    transform-origin: center;
    animation: pb-watermark-error 2.2s ease-in-out infinite;
  }
</style>
