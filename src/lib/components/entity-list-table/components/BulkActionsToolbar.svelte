<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { FilterBar } from '../toolbar';
  import { fly } from 'svelte/transition';
  import type { MetaColumn, AdvancedFilter } from '$lib/entity-list/types';
  import ListCheck from '@lucide/svelte/icons/list-check'
  import Funnel from '@lucide/svelte/icons/funnel'
  import Download from '@lucide/svelte/icons/download'
  import Copy from '@lucide/svelte/icons/copy'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import ArrowUpFromLine from '@lucide/svelte/icons/arrow-up-from-line';

  let {
    toolbarMode,
    hasAppliedFilters,
    filterValues,
    advancedFilters,
    selectedKeys,
    hasDeletedSelected,
    allSelectedDeleted,
    filterableColumns,
    onResetFilters,
    onFilterValuesChange,
    onAdvancedFiltersChange,
    onToggleToolbarMode,
    onBulkExport,
    onHtmlExport,
    onBulkDuplicate,
    onBulkDelete,
    onBulkRestore
  }: {
    toolbarMode: 'filters' | 'bulk';
    hasAppliedFilters: boolean;
    filterValues: Record<string, unknown>;
    advancedFilters: AdvancedFilter[];
    selectedKeys: string[];
    hasDeletedSelected: boolean;
    allSelectedDeleted: boolean;
    filterableColumns: MetaColumn[];
    onResetFilters: () => void;
    onFilterValuesChange: (values: Record<string, unknown>) => void;
    onAdvancedFiltersChange: (filters: AdvancedFilter[], logic: 'AND' | 'OR') => void;
    onToggleToolbarMode: () => void;
    onBulkExport: () => void;
    onHtmlExport: () => void;
    onBulkDuplicate: () => void;
    onBulkDelete: () => void;
    onBulkRestore: () => void;
  } = $props();
</script>

<div class="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
  <Button
    variant="outline"
    size="xs"
    onclick={onToggleToolbarMode}
  >
    {#if toolbarMode === 'filters'}
      <ListCheck class="size-3.5" />
      {$t('entities.list.bulkActions.toggleToBulk')}
    {:else}
      <Funnel class="size-3.5" />
      {$t('entities.list.bulkActions.toggleToFilters')}
    {/if}
  </Button>
  <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>

  {#if toolbarMode === 'filters'}
    <div in:fly={{ y: 20, duration: 200 }}>
      <FilterBar
        hasAppliedFilters={hasAppliedFilters}
        filterValues={filterValues}
        advancedFilters={advancedFilters}
        filterableColumns={filterableColumns}
        onResetFilters={onResetFilters}
        onFilterValuesChange={onFilterValuesChange}
        onAdvancedFiltersChange={(filters) => onAdvancedFiltersChange(filters, 'AND')}
      />
    </div>
  {:else}
    <div in:fly={{ y: 20, duration: 200 }} class="flex flex-wrap items-center gap-2">
      <Button
        variant="soft"
        tone="primary"
        size="xs"
        onclick={onBulkExport}
      >
        <Download class="size-3.5" />
        {$t('entities.list.bulkActions.export')}
      </Button>
      <Button
        variant="soft"
        tone="primary"
        size="xs"
        onclick={onHtmlExport}
      >
        <Download class="size-3.5" />
        {$t('entities.list.bulkActions.exportHtml')}
      </Button>
      <Button
        variant="soft"
        tone="primary"
        size="xs"
        onclick={onBulkDuplicate}
        disabled={selectedKeys.length < 2}
      >
        <Copy class="size-3.5" />
        {$t('entities.list.bulkActions.duplicate')}
      </Button>
      <Button
        variant="soft"
        tone="destructive"
        size="xs"
        onclick={onBulkDelete}
        disabled={selectedKeys.length < 2 || hasDeletedSelected}
      >
        <Trash2 class="size-3.5" />
        {$t('entities.list.bulkActions.delete')}
      </Button>
      {#if hasDeletedSelected}
        <Button
          variant="soft"
          tone="warning"
          size="xs"
          onclick={onBulkRestore}
          disabled={!allSelectedDeleted}
        >
          <span class="relative flex items-center justify-center">
            <Trash2 class="size-3.5 text-warning/70" />
            <ArrowUpFromLine class="absolute -bottom-[1px] size-2.5 text-warning/70" />
          </span>
          {$t('entities.list.bulkActions.restore')}
        </Button>
      {/if}
    </div>
  {/if}
</div>
