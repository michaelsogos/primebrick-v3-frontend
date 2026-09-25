<script lang="ts">
  import { t } from '$lib/i18n';
  import { cn } from '$lib/utils.js';
  import { SearchBar, ViewModeToggle, DeletionFilterToggle } from '.';
  import RotateCw from '@lucide/svelte/icons/rotate-cw'
  import Columns3 from '@lucide/svelte/icons/columns-3'
  import Funnel from '@lucide/svelte/icons/funnel';
  import { Button } from '$lib/components/ui/button';
  import { Toolbar } from '$lib/components/ui/toolbar';
  import type { ViewName } from '$lib/entity-list/types';

  interface ToolbarProps {
    search: string;
    onSearchInput: (value: string) => void;
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

<Toolbar>
  <div class="flex min-w-0 flex-1 basis-0 items-center gap-2 sm:min-w-[260px] sm:max-w-[520px]">
    <SearchBar
      search={search}
      onSearchInput={onSearchInput}
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
    <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>

    {#if hasSoftDelete}
      <DeletionFilterToggle
        deletionFilterMode={deletionFilterMode}
        onDeletionFilterModeChange={onDeletionFilterModeChange}
      />
      <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>
    {/if}

    <Button
      variant="ghost"
      size="sm"
      type="button"
      onclick={onColumnSelectorClick}
      aria-label={$t('system.entities.list.columns')}
      title={$t('system.entities.list.columns')}
    >
      <Columns3 class="size-4" />
      <span class="hidden lg:inline">{$t('system.entities.list.columns')}</span>
    </Button>

    {#if filterableColumns.length > 0}
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onclick={() => onFiltersOpenChange(!filtersOpen)}
        aria-label={$t('system.entities.list.filters')}
        title={$t('system.entities.list.filters')}
      >
        <Funnel class="size-4" />
        <span class="hidden lg:inline">{$t('system.entities.list.filters')}</span>
      </Button>
    {/if}

    <Button
      variant="ghost"
      size="sm"
      disabled={rowsLoading || refreshDisabled}
      onclick={onRefresh}
      aria-label={$t('system.entities.list.refresh')}
      title={$t('system.entities.list.refresh')}
    >
      <RotateCw class={rowsLoading ? 'size-4 animate-spin' : 'size-4'} />
      <span class="hidden lg:inline">{$t('system.entities.list.refresh')}</span>
    </Button>

    {#if onCreateAction}
      <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>
      <Button
        variant="default"
        size="sm"
        type="button"
        onclick={onCreateAction}
      >
        {$t('system.entities.list.new')}
      </Button>
    {/if}
  </div>
</Toolbar>
