<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n';
  import { LoadingBar } from '$lib/components/ui/loading-bar';
  import CircleX from '@lucide/svelte/icons/circle-x'
  import Hourglass from '@lucide/svelte/icons/hourglass'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { Checkbox, checkboxInteractiveClass } from '$lib/components/ui/checkbox';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { Switch } from '$lib/components/ui/switch';
  import { cn } from '$lib/utils.js';
  import CardItem from './CardItem.svelte';
  import type { MetaColumn, SortDir } from '$lib/entity-list/types';
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
  import ArrowUpNarrowWide from '@lucide/svelte/icons/arrow-up-narrow-wide'
  import ArrowDownWideNarrow from '@lucide/svelte/icons/arrow-down-wide-narrow'
  import Globe from '@lucide/svelte/icons/globe'
  import MapPin from '@lucide/svelte/icons/map-pin';

  let {
    viewMode,
    viewRows,
    shownColumns,
    rowSelectionEnabled,
    selectedKeys,
    rowKey,
    isRowDeleted,
    previewPanel,
    actionsEnabled,
    rowActions,
    entityRowActions,
    dropdownMenuRow,
    datetimeIanaModeByKey,
    datetimeIanaRenderTick,
    cell,
    stickyColumnsGroup,
    error,
    errorView,
    rowsLoading,
    rowsLoadingView,
    loadingText,
    rows,
    emptyView,
    emptyText,
    showSelectedOnly,
    selectionCount,
    orderedSelectedRows,
    allOnPageSelected,
    headerIndeterminate,
    toggleAllOnPage,
    allColumns,
    effectiveSortKey,
    sortDir,
    onSortChange,
    sortableColumns,
    datetimeIanaToggleColumns,
    toggleDatetimeIana,
    onEntityRowClick,
    onToggleRowSelect,
    onOpenRowDropdown,
    onCloseRowDropdown,
    onEditRow,
    onLoadVersionHistory,
    onDuplicateRow,
    onDeleteRow,
    onRestoreRow,
    onPreviewRow
  }: {
    viewMode: 'cards_list' | 'cards_grid' | 'cards';
    viewRows: TRow[];
    shownColumns: MetaColumn[];
    rowSelectionEnabled: boolean;
    selectedKeys: string[];
    rowKey: (row: TRow) => string;
    isRowDeleted: (row: TRow) => boolean;
    previewPanel: { focusedRowIndex: number | null };
    actionsEnabled: boolean;
    rowActions?: Snippet<[{ row: TRow }]>;
    entityRowActions?: {
      edit?: boolean;
      duplicate?: boolean;
      preview?: boolean;
      delete?: boolean;
    };
    dropdownMenuRow: TRow | null;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick: number;
    cell?: Snippet<[{ row: TRow; column: MetaColumn }]>;
    stickyColumnsGroup: MetaColumn[];
    error: string | null;
    errorView?: Snippet;
    rowsLoading: boolean;
    rowsLoadingView?: Snippet;
    loadingText: string;
    rows: TRow[];
    emptyView?: Snippet;
    emptyText: string;
    showSelectedOnly: boolean;
    selectionCount: number;
    orderedSelectedRows: TRow[];
    allOnPageSelected: boolean;
    headerIndeterminate: boolean;
    toggleAllOnPage: () => void;
    allColumns: MetaColumn[];
    effectiveSortKey: string | null;
    sortDir: SortDir;
    onSortChange: (key: string | null, dir: SortDir) => void;
    sortableColumns: MetaColumn[];
    datetimeIanaToggleColumns: MetaColumn[];
    toggleDatetimeIana: (col: MetaColumn) => void;
    onEntityRowClick: (key: string, e: MouseEvent) => void;
    onToggleRowSelect: (key: string) => void;
    onOpenRowDropdown: (row: TRow) => void;
    onCloseRowDropdown: () => void;
    onEditRow: (row: TRow) => void;
    onLoadVersionHistory: (row: TRow) => void;
    onDuplicateRow: (row: TRow) => void;
    onDeleteRow: (row: TRow) => void;
    onRestoreRow: (row: TRow) => void;
    onPreviewRow: (row: TRow) => void;
  } = $props();

  // Convert 'cards' to 'cards_grid' for internal use
  const internalViewMode = $derived(viewMode === 'cards' ? 'cards_grid' : viewMode);
</script>

<div class="h-full overflow-auto">
  {#if error}
    {#if errorView}
      {@render errorView()}
    {:else}
      <div class="grid min-h-56 place-items-center">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-error">
            <CircleX class="size-20 text-destructive" />
          </div>
          <div class="text-sm font-medium text-muted-foreground">{error}</div>
        </div>
      </div>
    {/if}
  {:else if rowsLoading && (!rows || rows.length === 0)}
    {#if rowsLoadingView}
      {@render rowsLoadingView()}
    {:else}
      <div class="w-full">
        <LoadingBar size="xs" />
        <div class="grid min-h-56 place-items-center">
          <div class="relative flex flex-col items-center gap-2 text-center">
            <div class="pb-watermark-loading">
              <Hourglass class="size-20 text-info" />
            </div>
            <div class="text-sm font-medium text-muted-foreground">{loadingText}</div>
          </div>
        </div>
      </div>
    {/if}
  {:else if !rows || rows.length === 0}
    {#if emptyView}
      {@render emptyView()}
    {:else}
      <div class="grid min-h-56 place-items-center">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-empty">
            <TriangleAlert class="size-20 text-warning" />
          </div>
          <div class="text-sm font-medium text-muted-foreground">{emptyText}</div>
        </div>
      </div>
    {/if}
  {:else if !viewRows || viewRows.length === 0}
    <div class="grid min-h-56 place-items-center">
      <div class="relative flex flex-col items-center gap-2 text-center">
        <div class="pb-watermark-empty">
          <TriangleAlert class="size-20 text-warning" />
        </div>
        <div class="text-sm font-medium text-muted-foreground">
          {#if showSelectedOnly && selectionCount > 0 && orderedSelectedRows.length === 0}
            {$t('entities.list.selectedRowsNotLoadedHint')}
          {:else}
            {$t('entities.list.noSelectedRowsInView')}
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <div
      class="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-background/90 px-3 py-2 backdrop-blur-sm supports-backdrop-filter:bg-background/70"
    >
      <div class="flex flex-wrap items-center gap-2">
        {#if rowSelectionEnabled}
          <Checkbox
            id="select-all-card-header"
            class={checkboxInteractiveClass}
            checked={allOnPageSelected}
            indeterminate={headerIndeterminate}
            onCheckedChange={() => toggleAllOnPage()}
            aria-label={$t('entities.list.selectAll')}
          />
          <span class="text-xs font-medium text-muted-foreground">
            {allOnPageSelected ? $t('entities.list.deselectAll') : $t('entities.list.selectAll')}
          </span>
        {/if}

        <div class="mx-1 h-6 w-px bg-border/60" aria-hidden="true"></div>

        <span class="text-xs font-medium text-muted-foreground">{$t('entities.list.sortBy')}</span>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button variant="soft" size="xs" {...props} class="max-w-[220px] truncate">
                {$t(allColumns.find((c) => c.key === effectiveSortKey)?.labelKey ?? '')}
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start">
            {#each sortableColumns as col (col.key)}
              <DropdownMenu.Item
                class={dropdownMenuSelectedItemClass(effectiveSortKey === col.key)}
                onSelect={() => onSortChange(col.key, effectiveSortKey === col.key ? sortDir : 'asc')}
              >
                {$t(col.labelKey)}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <span class="ml-1 text-xs font-medium text-muted-foreground">{$t('entities.list.inOrder')}</span>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button variant="soft" size="xs" {...props} disabled={!effectiveSortKey}>
                {#if sortDir === 'asc'}
                  <ArrowUpNarrowWide class="size-4" />
                {:else}
                  <ArrowDownWideNarrow class="size-4" />
                {/if}
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start">
            <DropdownMenu.Item
              class={dropdownMenuSelectedItemClass(sortDir === 'asc')}
              onSelect={() => effectiveSortKey && onSortChange(effectiveSortKey, 'asc')}
            >
              <span class="inline-flex items-center gap-2">
                <ArrowUpNarrowWide class="size-4" />
                {$t('entities.list.ascending')}
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              class={dropdownMenuSelectedItemClass(sortDir === 'desc')}
              onSelect={() => effectiveSortKey && onSortChange(effectiveSortKey, 'desc')}
            >
              <span class="inline-flex items-center gap-2">
                <ArrowDownWideNarrow class="size-4" />
                {$t('entities.list.descending')}
              </span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        {#each datetimeIanaToggleColumns as col (col.key)}
          <div class="mx-1 h-6 w-px bg-border/60" aria-hidden="true"></div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-muted-foreground">{$t(col.labelKey)}</span>
            <Switch
              checked={(datetimeIanaModeByKey[col.key] ?? 'browser') === 'record'}
              disabled={rowsLoading}
              aria-label={(datetimeIanaModeByKey[col.key] ?? 'browser') === 'browser'
                ? $t('entities.list.datetimeIana.hintBrowser')
                : $t('entities.list.datetimeIana.hintRecord')}
              title={(datetimeIanaModeByKey[col.key] ?? 'browser') === 'browser'
                ? $t('entities.list.datetimeIana.hintBrowser')
                : $t('entities.list.datetimeIana.hintRecord')}
              onCheckedChange={() => toggleDatetimeIana(col)}
            >
              {#snippet thumbIcons({ checked })}
                {#if checked}
                  <MapPin class="size-3.5 opacity-95" />
                {:else}
                  <Globe class="size-3.5 opacity-95" />
                {/if}
              {/snippet}
            </Switch>
          </div>
        {/each}
      </div>
    </div>

    <div class="p-3">
      <div
        class={cn(
          internalViewMode === 'cards_list'
            ? 'flex flex-col gap-3'
            : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
        )}
      >
        {#if viewRows && viewRows.length > 0}
        {#each viewRows as r, i (rowKey(r))}
          {@const rk = rowKey(r)}
          {@const rowSelected = rowSelectionEnabled && selectedKeys.includes(rk)}
          {@const rowDeleted = isRowDeleted(r)}
          {@const rowFocused = previewPanel.focusedRowIndex !== null && viewRows[previewPanel.focusedRowIndex] === r}
          <CardItem
            row={r}
            index={i}
            rowKey={rk}
            rowSelected={rowSelected}
            rowDeleted={rowDeleted}
            rowFocused={rowFocused}
            rowSelectionEnabled={rowSelectionEnabled}
            actionsEnabled={actionsEnabled}
            shownColumns={shownColumns}
            stickyColumnsGroup={stickyColumnsGroup}
            datetimeIanaModeByKey={datetimeIanaModeByKey}
            datetimeIanaRenderTick={datetimeIanaRenderTick}
            cell={cell}
            rowActions={rowActions}
            entityRowActions={entityRowActions}
            dropdownMenuRow={dropdownMenuRow}
            viewMode={internalViewMode}
            onEntityRowClick={onEntityRowClick}
            onToggleRowSelect={onToggleRowSelect}
            onOpenRowDropdown={onOpenRowDropdown}
            onCloseRowDropdown={onCloseRowDropdown}
            onEditRow={onEditRow}
            onLoadVersionHistory={onLoadVersionHistory}
            onDuplicateRow={onDuplicateRow}
            onDeleteRow={onDeleteRow}
            onRestoreRow={onRestoreRow}
            onPreviewRow={onPreviewRow}
            selectedKeys={selectedKeys}
          />
        {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
