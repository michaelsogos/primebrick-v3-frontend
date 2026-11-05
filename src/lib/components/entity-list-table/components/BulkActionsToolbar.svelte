<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { FilterBar } from '../toolbar';
  import { fly } from 'svelte/transition';
  import { DynamicIcon } from '@primebrick/ui';
  import type { MetaColumn, AdvancedFilter, BulkCustomAction } from '$lib/entity-list/types';
  import { ListCheck } from '@primebrick/ui/vendor/lucide'
  import { Funnel } from '@primebrick/ui/vendor/lucide'
  import { Download } from '@primebrick/ui/vendor/lucide'
  import { Copy } from '@primebrick/ui/vendor/lucide'
  import { Trash2 } from '@primebrick/ui/vendor/lucide'
  import { Trash } from '@primebrick/ui/vendor/lucide'
  import { ArrowUpFromLine } from '@primebrick/ui/vendor/lucide';

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
    onBulkRestore,
    bulkCapabilities = { export: true, htmlExport: true, duplicate: true, delete: true, restore: true },
    bulkCustomActions = [],
    onBulkCustomAction
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
    /** Capability + permission gate per bulk CTA (from `meta.actions`). */
    bulkCapabilities?: { export: boolean; htmlExport: boolean; duplicate: boolean; delete: boolean; restore: boolean };
    /** `meta.table.bulk_custom_actions` CTAs (permission-filtered upstream). */
    bulkCustomActions?: BulkCustomAction[];
    onBulkCustomAction?: (action: BulkCustomAction) => void;
  } = $props();

  /** True when at least one bulk CTA can ever render for this entity. When
   *  false (e.g. organization — no bulk routes by design) the toggle and its
   *  divider are useless, so the bar stays fixed on the FilterBar. */
  const hasAnyBulkCapability = $derived(
    bulkCapabilities.export ||
      bulkCapabilities.htmlExport ||
      bulkCapabilities.duplicate ||
      bulkCapabilities.delete ||
      bulkCapabilities.restore ||
      bulkCustomActions.length > 0
  );
  const showBulkPanel = $derived(hasAnyBulkCapability && toolbarMode === 'bulk');
</script>

<div class="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
  {#if hasAnyBulkCapability}
    <Button
      variant="ghost"
      size="xs"
      onclick={onToggleToolbarMode}
    >
      {#if toolbarMode === 'filters'}
        <ListCheck class="size-3.5" />
        {$t('system.entities.list.bulkActions.toggleToBulk')}
      {:else}
        <Funnel class="size-3.5" />
        {$t('system.entities.list.bulkActions.toggleToFilters')}
      {/if}
    </Button>
    <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>
  {/if}

  {#if !showBulkPanel}
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
      {#if bulkCapabilities.export}
        <Button
          variant="default"
          size="xs"
          onclick={onBulkExport}
        >
          <Download class="size-3.5" />
          {$t('system.entities.list.bulkActions.export')}
        </Button>
      {/if}
      {#if bulkCapabilities.htmlExport}
        <Button
          variant="default"
          size="xs"
          onclick={onHtmlExport}
        >
          <Download class="size-3.5" />
          {$t('system.entities.list.bulkActions.exportHtml')}
        </Button>
      {/if}
      {#if bulkCapabilities.duplicate}
        <Button
          variant="default"
          size="xs"
          onclick={onBulkDuplicate}
          disabled={selectedKeys.length < 2}
        >
          <Copy class="size-3.5" />
          {$t('system.entities.list.bulkActions.duplicate')}
        </Button>
      {/if}
      {#if bulkCapabilities.delete}
        <Button
          variant="destructive"
          size="xs"
          onclick={onBulkDelete}
          disabled={selectedKeys.length < 2 || hasDeletedSelected}
        >
          <Trash2 class="size-3.5" />
          {$t('system.entities.list.bulkActions.delete')}
        </Button>
      {/if}
      {#if hasDeletedSelected && bulkCapabilities.restore}
        <Button
          variant="warning"
          size="xs"
          onclick={onBulkRestore}
          disabled={!allSelectedDeleted}
        >
          <span class="relative flex items-center justify-center">
            <Trash class="size-3.5" />
            <ArrowUpFromLine class="absolute bottom-px size-2" />
          </span>
          {$t('system.entities.list.bulkActions.restore')}
        </Button>
      {/if}
      {#each bulkCustomActions as action (action.action_name)}
        <Button
          variant={action.text_color?.includes('red') ? 'destructive' : 'default'}
          size="xs"
          onclick={() => onBulkCustomAction?.(action)}
          disabled={action.requires_selection !== false && selectedKeys.length === 0}
        >
          {#if action.icon}<DynamicIcon name={action.icon} size={14} class="opacity-70" />{/if}
          {$t(action.translation_key)}
        </Button>
      {/each}
    </div>
  {/if}
</div>
