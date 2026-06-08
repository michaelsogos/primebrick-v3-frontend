<script lang="ts">
  import { t } from '$lib/i18n';
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
  import ArrowUp from '@lucide/svelte/icons/arrow-up'
  import ArrowDown from '@lucide/svelte/icons/arrow-down'
  import Globe from '@lucide/svelte/icons/globe'
  import MapPin from '@lucide/svelte/icons/map-pin'
  import PanelRightClose from '@lucide/svelte/icons/panel-right-close'
  import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
  import * as Table from '$lib/components/ui/table';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { cn } from '$lib/utils';
  import { stickyCellClassWithCompute, datetimeIanaHeadHighlightClass } from '../utils/cell-styling';

  let {
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
    previewPanel,
    viewRows
  }: EntityListTableHeaderRowProps = $props();

  type EntityListTableHeaderRowProps = {
    rowSelectionEnabled: boolean;
    stickyColumnsState: any;
    rowChromeH: string;
    checkboxInteractiveClass: string;
    allOnPageSelected: boolean;
    headerIndeterminate: boolean;
    toggleAllOnPage: () => void;
    shownColumns: any[];
    stickyColumnsGroup: any[];
    visibleKeys: string[];
    sortKey: string | null;
    sortDir: 'asc' | 'desc';
    rowsLoading: boolean;
    handleSortClick: (col: any) => void;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    toggleDatetimeIana: (col: any) => void;
    actionsEnabled: boolean;
    previewPanel: any;
    viewRows: any[];
  };
</script>

<Table.Header class="sticky top-0 z-80 bg-background/90 backdrop-blur-sm supports-backdrop-filter:bg-background/70">
  <Table.Row>
    {#if rowSelectionEnabled}
      <Table.Head
        bind:ref={stickyColumnsState.checkboxHeadRef}
        class="w-10 min-w-10 max-w-10 sticky left-0 z-70 bg-neutral-200 dark:bg-neutral-800 bg-clip-border px-2"
      >
        <div class={cn('flex items-center justify-center', rowChromeH)}>
          <Checkbox
            class={checkboxInteractiveClass}
            checked={allOnPageSelected}
            indeterminate={headerIndeterminate}
            onCheckedChange={() => toggleAllOnPage()}
            aria-label={$t('entities.list.selectAll')}
          />
        </div>
      </Table.Head>
    {/if}
    {#each shownColumns as col, colIdx (col.key)}
      {#if stickyColumnsGroup.some((s) => s.key === col.key)}
        <Table.Head
          style="left: {stickyColumnsState.stickyLeftOffsets[col.key] ?? 0}px;"
          class={stickyCellClassWithCompute(col.key, stickyColumnsGroup, visibleKeys, true) ??
            (col.sortable !== false
              ? rowsLoading
                ? 'relative z-10 select-none opacity-60'
                : 'relative z-10 cursor-pointer select-none'
              : 'relative z-10')}
          onclick={() => handleSortClick(col)}
        >
          <div use:stickyColumnsState.stickyRef={{ key: col.key, isHead: true }}>
            <span class="inline-flex items-center gap-1">
              {$t(col.labelKey)}
              {#if col.sortable !== false}
                {#if sortKey !== col.key}
                  <ArrowUpDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-60'} />
                {:else if sortDir === 'asc'}
                  <ArrowUp class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                {:else}
                  <ArrowDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                {/if}
              {/if}
            </span>
          </div>
        </Table.Head>
      {:else}
        <Table.Head
          class={cn(
            stickyCellClassWithCompute(col.key, stickyColumnsGroup, visibleKeys, true) ??
              (col.sortable !== false
                ? rowsLoading
                  ? 'relative z-10 select-none opacity-60'
                  : 'relative z-10 cursor-pointer select-none'
                : 'relative z-10'),
            datetimeIanaHeadHighlightClass(col, datetimeIanaModeByKey)
          )}
          onclick={(e) => {
            const el = e.target as HTMLElement | null;
            if (el?.closest?.('[data-pb-datetime-iana-toggle]')) return;
            handleSortClick(col);
          }}
        >
          {#if col.datetimeIanaToggle}
            <div class="flex w-full min-w-0 items-center justify-between gap-1">
              <span class="inline-flex min-w-0 items-center gap-1">
                {$t(col.labelKey)}
                {#if col.sortable !== false}
                  {#if sortKey !== col.key}
                    <ArrowUpDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-60'} />
                  {:else if sortDir === 'asc'}
                    <ArrowUp class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                  {:else}
                    <ArrowDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                  {/if}
                {/if}
              </span>
              <button
                type="button"
                data-pb-datetime-iana-toggle
                class="inline-flex shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title={(datetimeIanaModeByKey[col.key] ?? 'browser') === 'browser'
                  ? $t('entities.list.datetimeIana.hintBrowser')
                  : $t('entities.list.datetimeIana.hintRecord')}
                aria-label={(datetimeIanaModeByKey[col.key] ?? 'browser') === 'browser'
                  ? $t('entities.list.datetimeIana.hintBrowser')
                  : $t('entities.list.datetimeIana.hintRecord')}
                onclick={(e) => {
                  e.stopPropagation();
                  toggleDatetimeIana(col);
                }}
              >
                {#if (datetimeIanaModeByKey[col.key] ?? 'browser') === 'browser'}
                  <Globe class="size-3.5 opacity-90" />
                {:else}
                  <MapPin class="size-3.5 opacity-90" />
                {/if}
              </button>
            </div>
          {:else}
            <span class="inline-flex items-center gap-1">
              {$t(col.labelKey)}
              {#if col.sortable !== false}
                {#if sortKey !== col.key}
                  <ArrowUpDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-60'} />
                {:else if sortDir === 'asc'}
                  <ArrowUp class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                {:else}
                  <ArrowDown class={rowsLoading ? 'size-3 opacity-30' : 'size-3 opacity-80'} />
                {/if}
              {/if}
            </span>
          {/if}
        </Table.Head>
      {/if}
    {/each}
    {#if actionsEnabled}
      <Table.Head
        class="w-10 min-w-10 max-w-10 sticky right-0 z-70 bg-neutral-200 dark:bg-neutral-800 bg-clip-border px-2"
      >
        <div class={cn('flex items-center justify-center', rowChromeH)}>
          <Button
            variant="ghost"
            size="icon-sm"
            onclick={() => {
              if (!previewPanel.previewPanelOpen && !previewPanel.previewRow && viewRows.length > 0) {
                previewPanel.openPreview(viewRows[0]);
              } else if (previewPanel.previewPanelOpen) {
                previewPanel.closePreview();
              } else {
                previewPanel.openPreview(viewRows[0]);
              }
            }}
            aria-label={$t('entities.list.togglePreviewPanel')}
            title={$t('entities.list.togglePreviewPanel')}
            class="transition-transform duration-300"
          >
            {#if previewPanel.previewPanelOpen}
              <PanelRightClose class="size-4 transition-transform duration-300" />
            {:else}
              <PanelRightOpen class="size-4 transition-transform duration-300" />
            {/if}
          </Button>
        </div>
      </Table.Head>
    {/if}
  </Table.Row>
</Table.Header>
