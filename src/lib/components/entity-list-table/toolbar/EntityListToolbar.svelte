<script lang="ts">
  import { t } from '$lib/i18n';
  import { SearchBar, ViewModeToggle, FilterPresetToolbar } from '.';
  import { DeletionFilterToggle } from '@primebrick/ui';
  import { Columns3 } from '@primebrick/ui/vendor/lucide'
  import { Funnel } from '@primebrick/ui/vendor/lucide';
  import { Button } from '@primebrick/ui';
  import { RefreshButton } from '@primebrick/ui';
  import { Toolbar } from '@primebrick/ui';
  import { DynamicIcon } from '@primebrick/ui';
  import type { FilterPreset, ViewName } from '$lib/entity-list/types';

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
    /** Meta-driven create CTA shape (route census `kind:"create"`) —
     *  `label_key`/`icon` override the generic "New" default. */
    create_cta?: { label_key?: string; icon?: string };
    /** Declared toolbar filter presets (`meta.table.filter_presets`). */
    filterPresets?: readonly FilterPreset[];
    /** Active option id per preset (`preset.id → option.id`). */
    presetSelections?: Record<string, string>;
    onPresetChange?: (presetId: string, optionId: string) => void;
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
    onCreateAction,
    create_cta,
    filterPresets = [],
    presetSelections = {},
    onPresetChange
  }: ToolbarProps = $props();
</script>

<Toolbar card={false}>
  {#snippet left()}
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
  {/snippet}

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

    {#each filterPresets as preset (preset.id)}
      <FilterPresetToolbar
        {preset}
        selected={presetSelections[preset.id] ?? preset.default_option}
        onSelect={(optionId) => onPresetChange?.(preset.id, optionId)}
      />
      <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>
    {/each}

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

    <RefreshButton
      onclick={onRefresh}
      loading={rowsLoading}
      disabled={rowsLoading || refreshDisabled}
    />

    {#if onCreateAction}
      <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>
      <Button
        variant="default"
        size="sm"
        type="button"
        data-testid="entity-create-cta"
        onclick={onCreateAction}
      >
        {#if create_cta?.icon}
          <DynamicIcon name={create_cta.icon} size={16} />
        {/if}
        {$t(create_cta?.label_key ?? 'system.entities.list.new')}
      </Button>
    {/if}
  </div>
</Toolbar>
