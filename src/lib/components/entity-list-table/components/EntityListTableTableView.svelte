<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { Root as TableRoot } from '$lib/components/ui/table';
  import { cn } from '$lib/utils';
  import TableBody from './TableBody.svelte';
  import EntityListTableHeaderRow from './EntityListTableHeaderRow.svelte';
  import { stickyCellClassWithCompute } from '../utils/cell-styling';
  import type { Snippet } from 'svelte';
  import type { MetaColumn } from '$lib/entity-list/types';
  import type { CellArgs, EntityRowActions } from '../types';
  import type { useRowActions } from '../composables/useRowActions.svelte';
  import type { useStickyColumns } from '../composables/useStickyColumns.svelte';
  import type { useRowRangeSelection } from '../composables/useRowRangeSelection.svelte';

  let {
    tableRef = $bindable(),
    tableDensityClass,
    rowSelectionEnabled,
    stickyColumnsState,
    rowChromeH,
    checkboxInteractiveClass,
    allOnPageSelected,
    headerIndeterminate,
    toggleAllOnPage,
    shownColumns,
    stickyColumnsGroup,
    visibleKeys,
    sortKey,
    sortDir,
    rowsLoading,
    handleSortClick,
    datetimeIanaModeByKey,
    toggleDatetimeIana,
    actionsEnabled,
    focusedRowIndex,
    onOpenColumnSelector,
    viewRows,
    error,
    errorView,
    rowsLoadingView,
    loadingText,
    rows,
    extraCols,
    emptyView,
    emptyText,
    showSelectedOnly,
    selectionCount,
    orderedSelectedRows,
    rowRangeSelection,
    datetimeIanaRenderTick,
    sparklineData,
    rowKey,
    isRowDeleted,
    cell,
    rowActions,
    entityRowActions,
    dropdownMenuRow,
    onEntityRowClick,
    onRowDblClick,
    toggleRowSelect,
    openRowDropdown,
    closeRowDropdown,
    handleEditRow,
    rowActionsComposable,
    selectedKeys
  }: EntityListTableTableViewProps = $props();

  type EntityListTableTableViewProps = {
    tableRef: HTMLTableElement | null;
    tableDensityClass: string;
    rowSelectionEnabled: boolean;
    stickyColumnsState: ReturnType<typeof useStickyColumns>;
    rowChromeH: string;
    checkboxInteractiveClass: string;
    allOnPageSelected: boolean;
    headerIndeterminate: boolean;
    toggleAllOnPage: () => void;
    shownColumns: MetaColumn[];
    stickyColumnsGroup: MetaColumn[];
    visibleKeys: string[];
    sortKey: string | null;
    sortDir: 'asc' | 'desc';
    rowsLoading: boolean;
    handleSortClick: (col: MetaColumn) => void;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    toggleDatetimeIana: (col: MetaColumn) => void;
    actionsEnabled: boolean;
    focusedRowIndex: number | null;
    onOpenColumnSelector: () => void;
    viewRows: TRow[];
    error: string | null;
    errorView?: Snippet;
    rowsLoadingView?: Snippet;
    loadingText: string;
    rows: TRow[];
    extraCols: number;
    emptyView?: Snippet;
    emptyText: string;
    showSelectedOnly: boolean;
    selectionCount: number;
    orderedSelectedRows: TRow[];
    rowRangeSelection: ReturnType<typeof useRowRangeSelection>;
    datetimeIanaRenderTick: number;
    sparklineData?: Record<string, { by_key: Record<string, unknown[]>; bucket_unit?: string }>;
    rowKey: (row: TRow) => string;
    isRowDeleted: (row: TRow) => boolean;
    cell?: Snippet<[CellArgs<TRow>]>;
    rowActions?: Snippet<[{ row: TRow }]>;
    entityRowActions?: EntityRowActions;
    dropdownMenuRow: TRow | null;
    onEntityRowClick: (key: string, e: MouseEvent) => void;
    onRowDblClick: (row: TRow) => void;
    toggleRowSelect: (key: string) => void;
    openRowDropdown: (row: TRow) => void;
    closeRowDropdown: () => void;
    handleEditRow: (row: TRow) => void;
    rowActionsComposable: ReturnType<typeof useRowActions<TRow>>;
    selectedKeys: string[];
  };

  /**
   * Keyboard-focus frame — a measured overlay sibling of <table> inside the
   * scroll container (see table.svelte `overlay`). `position: relative` on a
   * `<tr>` is NOT a containing block, so an in-cell absolute span anchors to
   * the scroll container and bleeds across the viewport — hence geometry.
   *
   * The frame hugs the row's VISIBLE segment, not its full scroll width:
   * horizontally it tracks the viewport window ([scrollLeft, scrollLeft +
   * clientWidth] in content coordinates — re-measured on scroll), so the
   * right rounded edge always lands on the sticky actions column even when
   * the row's true end is scrolled off-screen. Vertically it glues to the
   * row (offsetTop) and scrolls with it. The overlay never participates in
   * layout → zero row shift, always.
   */
  let frameRect = $state<{ top: number; left: number; width: number; height: number } | null>(null);

  function measureFocusFrame() {
    const idx = focusedRowIndex;
    if (idx === null || !tableRef) {
      frameRect = null;
      return;
    }
    const tr = tableRef.querySelector<HTMLTableRowElement>("tr[data-focused-row-index]");
    const cont = tableRef.parentElement; // data-slot=table-container (the scroll host)
    frameRect = tr && cont
      ? {
          top: tr.offsetTop,
          left: cont.scrollLeft,
          width:
            Math.min(cont.scrollLeft + cont.clientWidth, tr.offsetLeft + tr.offsetWidth) -
            cont.scrollLeft,
          height: tr.offsetHeight,
        }
      : null;
  }

  $effect(() => {
    focusedRowIndex;
    viewRows;
    shownColumns;
    measureFocusFrame();
  });

  $effect(() => {
    if (!tableRef) return;
    const cont = tableRef.parentElement;
    const ro = new ResizeObserver(measureFocusFrame);
    ro.observe(tableRef);
    cont?.addEventListener("scroll", measureFocusFrame, { passive: true });
    return () => {
      ro.disconnect();
      cont?.removeEventListener("scroll", measureFocusFrame);
    };
  });
</script>

<div class="flex h-full overflow-hidden" role="region" aria-label="Table">
  <div class="flex-1 min-w-0 overflow-hidden">
    {#snippet tableChildren()}
      <EntityListTableHeaderRow
        rowSelectionEnabled={rowSelectionEnabled}
        stickyColumnsState={stickyColumnsState}
        rowChromeH={rowChromeH}
        checkboxInteractiveClass={checkboxInteractiveClass}
        allOnPageSelected={allOnPageSelected}
        headerIndeterminate={headerIndeterminate}
        toggleAllOnPage={toggleAllOnPage}
        shownColumns={shownColumns}
        stickyColumnsGroup={stickyColumnsGroup}
        visibleKeys={visibleKeys}
        sortKey={sortKey}
        sortDir={sortDir}
        rowsLoading={rowsLoading}
        handleSortClick={handleSortClick}
        datetimeIanaModeByKey={datetimeIanaModeByKey}
        toggleDatetimeIana={toggleDatetimeIana}
        actionsEnabled={actionsEnabled}
        onOpenColumnSelector={onOpenColumnSelector}
      />
      <TableBody
        error={error}
        errorView={errorView}
        rowsLoading={rowsLoading}
        rowsLoadingView={rowsLoadingView}
        loadingText={loadingText}
        rows={rows}
        viewRows={viewRows}
        shownColumns={shownColumns}
        extraCols={extraCols}
        emptyView={emptyView}
        emptyText={emptyText}
        showSelectedOnly={showSelectedOnly}
        selectionCount={selectionCount}
        orderedSelectedRows={orderedSelectedRows}
        rowSelectionEnabled={rowSelectionEnabled}
        selectedKeys={selectedKeys}
        rowRangeSelection={rowRangeSelection}
        datetimeIanaRenderTick={datetimeIanaRenderTick}
        sparklineData={sparklineData}
        rowKey={rowKey}
        isRowDeleted={isRowDeleted}
        actionsEnabled={actionsEnabled}
        rowChromeH={rowChromeH}
        stickyColumnsGroup={stickyColumnsGroup}
        onLoadVersionHistory={(row: TRow) => rowActionsComposable.loadVersionHistory(row)}
        stickyColumnsState={stickyColumnsState}
        datetimeIanaModeByKey={datetimeIanaModeByKey}
        cell={cell}
        rowActions={rowActions}
        entityRowActions={entityRowActions}
        dropdownMenuRow={dropdownMenuRow}
        focusedRowIndex={focusedRowIndex}
        onEntityRowClick={onEntityRowClick}
        onRowDblClick={onRowDblClick}
        onToggleRowSelect={toggleRowSelect}
        onOpenRowDropdown={openRowDropdown}
        onCloseRowDropdown={closeRowDropdown}
        onEditRow={handleEditRow}
        onDuplicateRow={(row: TRow) => rowActionsComposable.handleDuplicateRow(row)}
        onDeleteRow={(row: TRow) => rowActionsComposable.handleDeleteRow(row)}
        onRestoreRow={(row: TRow) => rowActionsComposable.handleRestoreRow(row)}
        handleCustomAction={rowActionsComposable.handleCustomAction}
        stickyCellClass={(key, idx, isHeader) => stickyCellClassWithCompute(key, stickyColumnsGroup, visibleKeys, isHeader)}
      />
    {/snippet}
    {#snippet focusFrameOverlay()}
      {#if frameRect}
        <div
          data-testid="elt-row-focus-frame"
          aria-hidden="true"
          class="row-focus-frame pointer-events-none absolute z-[60]"
          style="top:{frameRect.top}px;left:{frameRect.left}px;width:{frameRect.width}px;height:{frameRect.height}px"
        ></div>
      {/if}
    {/snippet}
    <TableRoot
      class={cn(
        'w-full bg-background **:data-[slot=table]:isolate **:data-[slot=table]:bg-background **:data-[slot=table-cell]:bg-clip-border [&_[data-slot=table-cell]:not(.sticky)]:bg-background dark:[&_[data-slot=table-cell]:not(.sticky)]:bg-neutral-950 [&_[data-slot=table-head]:not(.sticky)]:bg-neutral-50 dark:[&_[data-slot=table-head]:not(.sticky)]:bg-neutral-900',
        tableDensityClass
      )}
      containerClass="h-full overflow-auto"
      children={tableChildren}
      overlay={focusFrameOverlay}
      bind:ref={tableRef}
    />
  </div>
</div>
