<script lang="ts">
  import { t } from '$lib/i18n';
  import { Checkbox, checkboxInteractiveClass } from '$lib/components/ui/checkbox';
  import { cn } from '$lib/utils.js';
  import * as Table from '$lib/components/ui/table';
  import type { MetaColumn } from '$lib/entity-list/types';
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
  import ArrowUp from '@lucide/svelte/icons/arrow-up'
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import FormLabelWithPriorityHelp from '$lib/components/forms/FormLabelWithPriorityHelp.svelte';

  let {
    columns,
    sortKey,
    sortDir,
    onSortChange,
    visibleKeys,
    rowSelectionEnabled,
    allOnPageSelected,
    headerIndeterminate,
    onToggleAllOnPage,
    rowsLoading,
    stickyCellClass,
    rowChromeH
  }: {
    columns: MetaColumn[];
    sortKey: string | null;
    sortDir: 'asc' | 'desc';
    onSortChange: (key: string | null, dir: 'asc' | 'desc') => void;
    visibleKeys: string[];
    rowSelectionEnabled: boolean;
    allOnPageSelected: boolean;
    headerIndeterminate: boolean;
    onToggleAllOnPage: () => void;
    rowsLoading: boolean;
    stickyCellClass: (key: string, idx: number, isHeader: boolean) => string | undefined;
    rowChromeH: string;
  } = $props();

  const renderColumns = $derived(columns.filter((c) => visibleKeys.includes(c.key)));

  function handleSortClick(col: MetaColumn) {
    if (col.sortable === false) return;
    if (sortKey === col.key) {
      onSortChange(col.key, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(col.key, 'asc');
    }
  }
</script>

<Table.Header class="sticky top-0 z-80 bg-background">
  <Table.Row>
    {#if rowSelectionEnabled}
      <Table.Head
        class="w-10 min-w-10 max-w-10 sticky left-0 z-70 bg-neutral-200 dark:bg-neutral-800 bg-clip-border px-2"
      >
        <div class={cn('flex items-center justify-center', rowChromeH)}>
          <Checkbox
            id="select-all-table-legacy"
            class={checkboxInteractiveClass}
            checked={allOnPageSelected}
            indeterminate={headerIndeterminate}
            onCheckedChange={onToggleAllOnPage}
            aria-label={$t('entities.list.selectAll')}
          />
        </div>
      </Table.Head>
    {/if}
    {#each renderColumns as col, colIdx (col.key)}
      <Table.Head
        class={stickyCellClass(col.key, colIdx, true) ??
          (col.sortable !== false
            ? rowsLoading
              ? 'relative z-10 select-none opacity-60'
              : 'relative z-10 cursor-pointer select-none'
            : 'relative z-10')}
        onclick={() => handleSortClick(col)}
      >
        <span class="inline-flex items-center gap-1">
          {$t(col.labelKey)}
          {#if col.tooltip && col.showListTooltip !== false}
            <FormLabelWithPriorityHelp
              text={$t(col.tooltip)}
              priority={col.tooltipPriority}
              title={col.tooltipTitle ? $t(col.tooltipTitle) : undefined}
            />
          {/if}
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
      </Table.Head>
    {/each}
  </Table.Row>
</Table.Header>
