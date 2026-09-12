<script lang="ts">
  /**
   * ModelCacheSection — full-width settings page section for WebLLM model cache management.
   *
   * Shows the same data as ModelCachePanel but in a wider, more detailed layout.
   * Used in the AI settings page (/system/settings/ai).
   *
   * Structure:
   *   [Error message]
   *   [Progress bar + refresh CTA]
   *   [SelectableToolbar: censused models]
   *   [SelectableFieldset: "Modelli censiti"]
   *     [SelectableRow per censused model]
   *   [Divider]
   *   [SelectableToolbar: orphaned models]
   *   [SelectableFieldset: "Modelli non censiti"]
   *     [SelectableRow per orphaned model]
   */
  import { t } from '$lib/i18n';
  import { useAiModels } from '$lib/composables/useAiModels.svelte';
  import { useModelCache } from '$lib/ai/use-model-cache.svelte';
  import { useSelection } from '$lib/composables/useSelection.svelte';
  import ModelIcon from '$lib/components/ui/smart-regex-input/ModelIcon.svelte';
  import PowerLevelBars from '$lib/components/ui/smart-regex-input/PowerLevelBars.svelte';
  import { Trash2, RefreshCw, AlertTriangle } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { onMount } from 'svelte';
  import {
    SelectableFieldset,
    SelectableToolbar,
    SelectableRow,
  } from '$lib/components/ui/selectable-fieldset';

  /** The model ID currently loaded in VRAM (null if none). */
  let { active_model_id = null, model_power_levels = {} }: {
    active_model_id?: string | null;
    model_power_levels?: Record<string, number>;
  } = $props();

  const aiModels = useAiModels();
  const cache = useModelCache();
  const censusedSelection = useSelection();
  const orphanSelection = useSelection();

  onMount(async () => {
    await aiModels.ensureLoaded();
    const models = aiModels.getEnabledModels();
    void cache.refreshCacheStatus(models.map((m) => m.model_id));
  });

  function formatBytes(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function handleDelete(model_id: string) {
    void cache.deleteModel(model_id, active_model_id);
  }

  function handleDeleteOrphaned(model_id: string) {
    void cache.deleteModel(model_id, active_model_id);
  }

  function handleRefresh() {
    const models = aiModels.getEnabledModels();
    void cache.refreshCacheStatus(models.map((m) => m.model_id));
  }

  // ─── Censused models derived state ────────────────────────────────────────
  // Only show models that are actually in the browser cache.
  // The cache manager is for managing cached files — uncached models
  // have nothing to manage (no delete button, no size to show).
  const censusedModels = $derived(
    aiModels.getEnabledModels().filter((m) => cache.state.cache_status[m.model_id] === true),
  );
  const censusedAllSelected = $derived(
    censusedModels.length > 0 && censusedModels.every((m) => censusedSelection.isSelected(m.model_id)),
  );
  const censusedSomeSelected = $derived(
    censusedSelection.selected_count > 0 && !censusedAllSelected,
  );

  function handleToggleSelectAllCensused(checked: boolean) {
    censusedSelection.toggleSelectAll(censusedModels.map((m) => m.model_id), checked);
  }

  function handleBulkDeleteCensused() {
    const selectedIds = censusedSelection.getSelectedIds().filter(
      (id) => id !== active_model_id,
    );
    for (const id of selectedIds) {
      void cache.deleteModel(id, active_model_id);
    }
    censusedSelection.clearSelection();
  }

  // ─── Orphaned models derived state ────────────────────────────────────────
  const orphanIds = $derived(Object.keys(cache.state.orphaned_models));
  const orphanAllSelected = $derived(
    orphanIds.length > 0 && orphanIds.every((id) => orphanSelection.isSelected(id)),
  );
  const orphanSomeSelected = $derived(
    orphanSelection.selected_count > 0 && !orphanAllSelected,
  );

  function handleToggleSelectAllOrphans(checked: boolean) {
    orphanSelection.toggleSelectAll(orphanIds, checked);
  }

  function handleBulkDeleteOrphans() {
    const selectedIds = orphanSelection.getSelectedIds().filter(
      (id) => id !== active_model_id,
    );
    for (const id of selectedIds) {
      void cache.deleteModel(id, active_model_id);
    }
    orphanSelection.clearSelection();
  }
</script>

<div class="space-y-4" data-testid="model-cache-section">
  <!-- Error message -->
  {#if cache.state.error === 'in_use'}
    <div class="rounded-md bg-yellow-400/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
      {$t('app.smart.regex.ai.cache.in_use')}
    </div>
  {:else if cache.state.error}
    <div class="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {cache.state.error}
    </div>
  {/if}

  <!-- Storage bar with refresh CTA at the end -->
  {#if cache.state.storage_usage !== null && cache.state.storage_quota !== null}
    {@const pct = cache.state.storage_quota > 0 ? Math.min(100, (cache.state.storage_usage / cache.state.storage_quota) * 100) : 0}
    <div class="space-y-1">
      <div class="flex justify-between text-xs text-muted-foreground">
        <span>{$t('app.smart.regex.ai.cache.storage_used', { used: formatBytes(cache.state.storage_usage), quota: formatBytes(cache.state.storage_quota) })}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            style="width: {pct}%; background-image: linear-gradient(to right, #38bdf8, #6366f1, #8b5cf6, #6366f1, #38bdf8);"
          ></div>
        </div>
        <button
          onclick={handleRefresh}
          disabled={cache.state.is_checking}
          class="shrink-0 text-foreground/50 hover:text-foreground transition-colors"
          title={$t('app.smart.regex.ai.cache.refresh')}
          aria-label={$t('app.smart.regex.ai.cache.refresh')}
          data-testid="cache-section-refresh"
        >
          <RefreshCw class="size-3.5 {cache.state.is_checking ? 'animate-spin' : ''}" />
        </button>
      </div>
    </div>
  {/if}

  <!-- Censused models: select-all toolbar + fieldset -->
  <SelectableToolbar
    all_selected={censusedAllSelected}
    some_selected={censusedSomeSelected}
    selected_count={censusedSelection.selected_count}
    on_toggle_select_all={handleToggleSelectAllCensused}
    test_id="cache-censused-toolbar"
  >
    <Button
      variant="soft"
      tone="destructive"
      size="sm"
      onclick={handleBulkDeleteCensused}
      disabled={cache.state.is_deleting}
      data-testid="cache-censused-bulk-delete"
    >
      <Trash2 class="size-3.5" />
      {$t('app.smart.regex.ai.cache.delete')}
      <span class="ml-1 text-xs opacity-70">({censusedSelection.selected_count})</span>
    </Button>
  </SelectableToolbar>

  <SelectableFieldset label={$t('app.smart.regex.ai.cache.censused_title')}>
    {#each censusedModels as model (model.model_id)}
      {@const is_cached = cache.state.cache_status[model.model_id] ?? false}
      {@const is_active = model.model_id === active_model_id}
      {@const is_selected = censusedSelection.isSelected(model.model_id)}
      {@const size = cache.state.model_sizes[model.model_id] ?? 0}
      <SelectableRow
        id={model.model_id}
        selected={is_selected}
        on_toggle_select={(id, checked) => censusedSelection.toggleSelect(id, checked)}
        class="flex items-center justify-between gap-3"
      >
        <div class="flex items-center gap-3 min-w-0">
          <Checkbox
            checked={is_selected}
            onCheckedChange={(checked) => censusedSelection.toggleSelect(model.model_id, checked)}
            data-testid="cache-censused-select-{model.model_id}"
          />
          <ModelIcon model_id={model.model_id} class="size-5 shrink-0" />
          <div class="min-w-0">
            <div class="text-sm font-medium truncate">{model.name}</div>
            <div class="flex items-center gap-2 mt-0.5">
              {#if model_power_levels[model.model_id]}
                <PowerLevelBars level={model_power_levels[model.model_id]} />
              {/if}
              <span class="text-xs {is_cached ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}">
                {#if is_cached}
                  {$t('app.smart.regex.ai.cache.cached')} · {formatBytes(size)}
                {:else}
                  {$t('app.smart.regex.ai.cache.not_cached')}
                {/if}
              </span>
              {#if is_active}
                <span class="text-[10px] text-primary font-medium">· in use</span>
              {/if}
            </div>
          </div>
        </div>
        {#if is_cached}
          <Button
            variant="ghost"
            size="icon"
            onclick={() => handleDelete(model.model_id)}
            disabled={is_active || cache.state.is_deleting}
            class="shrink-0"
            title={is_active ? $t('app.smart.regex.ai.cache.in_use') : $t('app.smart.regex.ai.cache.delete')}
            data-testid="cache-section-delete-{model.model_id}"
          >
            <Trash2 class="size-4 text-destructive" />
          </Button>
        {/if}
      </SelectableRow>
    {/each}
  </SelectableFieldset>

  <!-- Divider -->
  {#if orphanIds.length > 0}
    <div class="border-t border-border/40"></div>

    <!-- Orphaned models: select-all toolbar + fieldset -->
    <SelectableToolbar
      all_selected={orphanAllSelected}
      some_selected={orphanSomeSelected}
      selected_count={orphanSelection.selected_count}
      on_toggle_select_all={handleToggleSelectAllOrphans}
      test_id="cache-orphan-toolbar"
    >
      <Button
        variant="soft"
        tone="destructive"
        size="sm"
        onclick={handleBulkDeleteOrphans}
        disabled={cache.state.is_deleting}
        data-testid="cache-orphan-bulk-delete"
      >
        <Trash2 class="size-3.5" />
        {$t('app.smart.regex.ai.cache.delete')}
        <span class="ml-1 text-xs opacity-70">({orphanSelection.selected_count})</span>
      </Button>
    </SelectableToolbar>

    <SelectableFieldset label={$t('app.smart.regex.ai.cache.orphaned_title')}>
      {#each Object.entries(cache.state.orphaned_models) as [model_id, size] (model_id)}
        {@const is_active = model_id === active_model_id}
        {@const is_selected = orphanSelection.isSelected(model_id)}
        <SelectableRow
          id={model_id}
          selected={is_selected}
          on_toggle_select={(id, checked) => orphanSelection.toggleSelect(id, checked)}
          class="flex items-center justify-between gap-3"
        >
          <div class="flex items-center gap-3 min-w-0">
            <Checkbox
              checked={is_selected}
              onCheckedChange={(checked) => orphanSelection.toggleSelect(model_id, checked)}
              data-testid="cache-orphan-select-{model_id}"
            />
            <div class="min-w-0">
              <div class="text-sm font-medium truncate font-mono">{model_id}</div>
              <span class="text-xs text-green-600 dark:text-green-400">
                {$t('app.smart.regex.ai.cache.cached')} · {formatBytes(size)}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onclick={() => handleDeleteOrphaned(model_id)}
            disabled={is_active || cache.state.is_deleting}
            class="shrink-0"
            title={is_active ? $t('app.smart.regex.ai.cache.in_use') : $t('app.smart.regex.ai.cache.delete')}
            data-testid="cache-section-delete-orphan-{model_id}"
          >
            <Trash2 class="size-4 text-destructive" />
          </Button>
        </SelectableRow>
      {/each}
    </SelectableFieldset>
  {/if}
</div>
