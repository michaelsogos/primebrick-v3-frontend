<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button, Checkbox } from '@primebrick/ui';
  import FilterBar from './FilterBar.svelte';
  import SortBuilder from './SortBuilder.svelte';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { fly } from 'svelte/transition';
  import { DynamicIcon, actionColorButtonVariant } from '@primebrick/ui';
  import type { Snippet } from 'svelte';
  import type { MetaColumn, AdvancedFilter, BulkCustomAction, SortDir } from '$lib/entity-list/types';
  import type { ActionChrome } from '../types';
  import { ListCheck } from '@primebrick/ui/vendor/lucide'
  import { Funnel } from '@primebrick/ui/vendor/lucide'
  import { Download } from '@primebrick/ui/vendor/lucide'
  import { Copy } from '@primebrick/ui/vendor/lucide'
  import { Pencil } from '@primebrick/ui/vendor/lucide'
  import { Trash2 } from '@primebrick/ui/vendor/lucide'

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
    onBulkEdit,
    bulkEditChrome,
    bulkCapabilities = { export: true, htmlExport: true, duplicate: true, delete: true, restore: true },
    bulkCustomActions = [],
    onBulkCustomAction,
    bulkDeleteChrome,
    bulkRestoreChrome,
    bulkDuplicateChrome,
    bulkExtraActions,
    selectAll,
    sort,
    ianaToggle
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
    onBulkEdit?: () => void;
    /** Capability + permission gate per bulk CTA (from `meta.actions`). */
    bulkCapabilities?: { export: boolean; htmlExport: boolean; duplicate: boolean; delete: boolean; restore: boolean; edit?: boolean };
    /** `meta.actions["update.bulk"]` chrome — primary edit affordance. */
    bulkEditChrome?: ActionChrome;
    /** `meta.table.bulk_custom_actions` CTAs (permission-filtered upstream). */
    bulkCustomActions?: BulkCustomAction[];
    onBulkCustomAction?: (action: BulkCustomAction) => void;
    /** Chrome overrides for the standard bulk delete/restore CTAs
     *  (`meta.actions["delete.bulk"]` / `["restore.bulk"]`). */
    bulkDeleteChrome?: ActionChrome;
    bulkRestoreChrome?: ActionChrome;
    /** `meta.actions["duplicate.bulk"]` chrome — violet by contract
     *  (`ActionColor`: violet IS the clone semantic). */
    bulkDuplicateChrome?: ActionChrome;
    /** Host-specific bulk CTAs rendered after the standard + meta-declared
     *  set (e.g. the dict page's local revert — a page-state op, not an
     *  `entity_op` route, so it cannot ride `bulkCustomActions`). */
    bulkExtraActions?: Snippet;
    /** Leading select-all zone (checkbox + select_all/deselect_all label) —
     *  card/card_list/dict views; table keeps its own thead checkbox. */
    selectAll?: { checked: boolean; indeterminate: boolean; onToggle: () => void; test_id?: string };
    /** Leading sort zone — the extracted card-view SortBuilder anatomy.
     *  DICT intentionally never passes this: `order_field` canonical order
     *  has value (chevron reorder) and a user sort would corrupt it — do
     *  not wire a sort builder onto dict pages. */
    sort?: {
      allColumns: MetaColumn[];
      sortableColumns: MetaColumn[];
      sortKey: string | null;
      sortDir: SortDir;
      onSortChange: (key: string | null, dir: SortDir) => void;
      test_id?: string;
    };
    /** Leading IANA zone — ONE bounded CTA opening the `entity.datetimeIana`
     *  sheet (replaces the unbounded per-column inline switches). */
    ianaToggle?: {
      columns: MetaColumn[];
      modeByKey: Record<string, 'browser' | 'record'>;
      onToggle: (col: MetaColumn) => void;
      disabled?: boolean;
      test_id?: string;
    };
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
      bulkCapabilities.edit ||
      bulkCustomActions.length > 0
  );
  const showBulkPanel = $derived(hasAnyBulkCapability && toolbarMode === 'bulk');
</script>

<div class="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2" data-testid="bulk-actions-toolbar">
  {#if selectAll}
    <div class="flex items-center gap-2">
      <Checkbox
        checked={selectAll.checked}
        indeterminate={selectAll.indeterminate}
        onCheckedChange={() => selectAll.onToggle()}
        aria-label={$t('system.entities.list.select_all')}
        data-testid={selectAll.test_id}
      />
      <span class="text-xs font-medium text-muted-foreground select-none">
        {selectAll.checked ? $t('system.entities.list.deselect_all') : $t('system.entities.list.select_all')}
      </span>
    </div>
    <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>
  {/if}

  {#if sort}
    <SortBuilder
      allColumns={sort.allColumns}
      sortableColumns={sort.sortableColumns}
      sortKey={sort.sortKey}
      sortDir={sort.sortDir}
      onSortChange={sort.onSortChange}
      test_id={sort.test_id}
    />
    <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>
  {/if}

  {#if ianaToggle && ianaToggle.columns.length > 0}
    <Button
      variant="ghost"
      size="xs"
      onclick={() =>
        openSheet('entity.datetimeIana', {
          datetimeIanaColumns: ianaToggle!.columns,
          modeByKey: ianaToggle!.modeByKey,
          onToggle: ianaToggle!.onToggle,
          disabled: ianaToggle!.disabled
        })}
      disabled={ianaToggle.disabled}
      data-testid={ianaToggle.test_id}
    >
      {$t('system.entities.list.datetime_iana.fields_cta')}
      <span class="ml-1 text-xs opacity-70">({ianaToggle.columns.length})</span>
    </Button>
    <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>
  {/if}

  {#if hasAnyBulkCapability}
    <Button
      variant="ghost"
      size="xs"
      onclick={onToggleToolbarMode}
      data-testid="bulk-actions-toggle"
    >
      {#if toolbarMode === 'filters'}
        <ListCheck class="size-3.5" />
        {$t('system.entities.list.bulk_actions.toggle_to_bulk')}
      {:else}
        <Funnel class="size-3.5" />
        {$t('system.entities.list.bulk_actions.toggle_to_filters')}
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
          variant="outline"
          tone="info"
          size="xs"
          onclick={onBulkExport}
        >
          <Download class="size-3.5" />
          {$t('system.entities.list.bulk_actions.export')}
        </Button>
      {/if}
      {#if bulkCapabilities.htmlExport}
        <Button
          variant="outline"
          tone="info"
          size="xs"
          onclick={onHtmlExport}
        >
          <Download class="size-3.5" />
          {$t('system.entities.list.bulk_actions.export_html')}
        </Button>
      {/if}
      {#if bulkCapabilities.edit && onBulkEdit}
        <Button
          variant={bulkEditChrome?.color ? actionColorButtonVariant(bulkEditChrome.color) : 'default'}
          size="xs"
          onclick={onBulkEdit}
          disabled={selectedKeys.length < 1 || selectedKeys.length > 100 || hasDeletedSelected}
          data-testid="entity-bulk-edit"
        >
          {#if bulkEditChrome?.icon}
            <DynamicIcon name={bulkEditChrome.icon} size={14} />
          {:else}
            <Pencil class="size-3.5" />
          {/if}
          {$t(bulkEditChrome?.label_key ?? 'system.entities.list.bulk_actions.edit')}
        </Button>
      {/if}
      {#if bulkCapabilities.duplicate}
        <Button
          variant={bulkDuplicateChrome?.color ? actionColorButtonVariant(bulkDuplicateChrome.color) : 'violet'}
          size="xs"
          onclick={onBulkDuplicate}
          disabled={selectedKeys.length < 2}
        >
          {#if bulkDuplicateChrome?.icon}
            <DynamicIcon name={bulkDuplicateChrome.icon} size={14} />
          {:else}
            <Copy class="size-3.5" />
          {/if}
          {$t(bulkDuplicateChrome?.label_key ?? 'system.entities.list.bulk_actions.duplicate')}
        </Button>
      {/if}
      {#if bulkCapabilities.delete}
        <Button
          variant={bulkDeleteChrome?.color ? actionColorButtonVariant(bulkDeleteChrome.color) : 'destructive'}
          size="xs"
          onclick={onBulkDelete}
          disabled={selectedKeys.length < 1 || hasDeletedSelected}
          data-testid="entity-bulk-delete"
        >
          {#if bulkDeleteChrome?.icon}
            <DynamicIcon name={bulkDeleteChrome.icon} size={14} />
          {:else}
            <Trash2 class="size-3.5" />
          {/if}
          {$t(bulkDeleteChrome?.label_key ?? 'system.entities.list.bulk_actions.delete')}
        </Button>
      {/if}
      {#if hasDeletedSelected && bulkCapabilities.restore}
        <Button
          variant={bulkRestoreChrome?.color ? actionColorButtonVariant(bulkRestoreChrome.color) : 'warning'}
          size="xs"
          onclick={onBulkRestore}
          disabled={!allSelectedDeleted}
          data-testid="entity-bulk-restore"
        >
          {#if bulkRestoreChrome?.icon}
            <DynamicIcon name={bulkRestoreChrome.icon} size={14} />
          {:else}
            <DynamicIcon name="trash-arrow-up" size={14} />
          {/if}
          {$t(bulkRestoreChrome?.label_key ?? 'system.entities.list.bulk_actions.restore')}
        </Button>
      {/if}
      {#each bulkCustomActions as action (action.action_name)}
        <Button
          variant={actionColorButtonVariant(action.color)}
          size="xs"
          onclick={() => onBulkCustomAction?.(action)}
          disabled={action.requires_selection !== false && selectedKeys.length === 0}
        >
          {#if action.icon}<DynamicIcon name={action.icon} size={14} />{/if}
          {$t(action.translation_key)}
        </Button>
      {/each}
      {#if bulkExtraActions}{@render bulkExtraActions()}{/if}
    </div>
  {/if}
</div>
