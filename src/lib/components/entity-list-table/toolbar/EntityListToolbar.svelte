<script lang="ts">
  import { t } from '$lib/i18n';
  import { cn } from '$lib/utils.js';
  import { SearchBar, ViewModeToggle, DeletionFilterToggle } from '.';
  import RotateCw from '@lucide/svelte/icons/rotate-cw'
  import Columns3 from '@lucide/svelte/icons/columns-3'
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import { Button } from '$lib/components/ui/button';
  import type { ViewName } from '$lib/entity-list/types';

  interface ToolbarProps {
    search: string;
    onSearchInput: (value: string) => void;
    searchPlaceholderKey?: string;
    searchInKeys: string[] | null;
    searchableColumns: any[];
    onSearchInKeysChange: (keys: string[] | null) => void;
    toggleSearchKey: (key: string) => void;
    viewMode: ViewName;
    onViewModeChange: (mode: ViewName) => void;
    deletionFilterMode: 'non_deleted' | 'deleted' | 'all';
    onDeletionFilterModeChange: (mode: 'non_deleted' | 'deleted' | 'all') => void;
    hasSoftDelete?: boolean;
    rowsLoading: boolean;
    refreshDisabled: boolean;
    onRefresh: () => void;
    filterableColumns: any[];
    filtersOpen: boolean;
    onFiltersOpenChange: (open: boolean) => void;
    onColumnSelectorClick: () => void;
    onCreateAction?: () => void;
  }

  let {
    search,
    onSearchInput,
    searchPlaceholderKey,
    searchInKeys,
    searchableColumns,
    onSearchInKeysChange,
    toggleSearchKey,
    viewMode,
    onViewModeChange,
    deletionFilterMode,
    onDeletionFilterModeChange,
    hasSoftDelete = true,
    rowsLoading,
    refreshDisabled,
    onRefresh,
    filterableColumns,
    filtersOpen,
    onFiltersOpenChange,
    onColumnSelectorClick,
    onCreateAction
  }: ToolbarProps = $props();
</script>

<div class="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-2">
  <div class="flex min-w-0 flex-1 basis-0 items-center gap-2 sm:min-w-[260px] sm:max-w-[520px]">
    <SearchBar
      search={search}
      onSearchInput={onSearchInput}
      searchPlaceholderKey={searchPlaceholderKey}
      searchInKeys={searchInKeys}
      searchableColumns={searchableColumns}
      onSearchInKeysChange={onSearchInKeysChange}
      toggleSearchKey={toggleSearchKey}
    />
  </div>

  <div class="flex items-center justify-end gap-2">
    <ViewModeToggle
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
    />

    {#if hasSoftDelete}
      <DeletionFilterToggle
        deletionFilterMode={deletionFilterMode}
        onDeletionFilterModeChange={onDeletionFilterModeChange}
      />
    {/if}

    <Button
      variant="soft"
      size="icon-sm"
      disabled={rowsLoading || refreshDisabled}
      onclick={onRefresh}
      aria-label={$t('entities.list.refresh')}
      title={$t('entities.list.refresh')}
    >
      <RotateCw class={rowsLoading ? 'size-4 animate-spin' : 'size-4'} />
    </Button>

    <Button
      variant="soft"
      size="sm"
      type="button"
      onclick={onColumnSelectorClick}
    >
      <Columns3 class="size-4" />
      {$t('entities.list.columns')}
    </Button>

    {#if filterableColumns.length > 0}
      <Button
        variant="soft"
        size="sm"
        type="button"
        onclick={() => onFiltersOpenChange(!filtersOpen)}
      >
        <SlidersHorizontal class="size-4" />
        {$t('entities.list.filters')}
      </Button>
    {/if}

    {#if onCreateAction}
      <div class="h-6 w-px bg-border/60" aria-hidden="true"></div>
      <Button
        variant="default"
        size="sm"
        type="button"
        onclick={onCreateAction}
      >
        {$t('entities.list.new')}
      </Button>
    {/if}
  </div>
</div>
