<script lang="ts">
  /**
   * ModelCachePanel — popover UI for WebLLM model cache management.
   *
   * Shows per-model cache status, estimated sizes, and deletion controls.
   * The active model (currently loaded in VRAM) cannot be deleted —
   * the user is told to switch to another model first.
   *
   * Used inside the AI assistant sheet panel as a popover triggered
   * by a small icon button next to the model dropdown.
   */
  import { t } from '$lib/i18n';
  import { useAiModels } from '$lib/composables/useAiModels.svelte';
  import { useModelCache, friendlyModelName } from '$lib/ai/use-model-cache.svelte';
  import ModelIcon from '$lib/components/ui/smart-regex-input/ModelIcon.svelte';
  import RankMeter from '$lib/components/ui/smart-regex-input/RankMeter.svelte';
  import { Trash2, RefreshCw, HardDrive, AlertTriangle } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { onMount } from 'svelte';

  /** The model ID currently loaded in VRAM (null if none). */
  let { active_model_id, model_ranks }: {
    active_model_id: string | null;
    model_ranks: Record<string, number | null>;
  } = $props();

  const aiModels = useAiModels();
  const cache = useModelCache();

  // Refresh cache status when popover opens (component mounts only when visible)
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

  function handleDeleteAll() {
    void cache.deleteAllModels(active_model_id);
  }

  function handleDeleteOrphaned(model_id: string) {
    void cache.deleteModel(model_id, active_model_id);
  }

  function handleRefresh() {
    const models = aiModels.getEnabledModels();
    void cache.refreshCacheStatus(models.map((m) => m.model_id));
  }
</script>

<div class="w-72 p-3 space-y-3" data-testid="model-cache-panel">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-1.5">
      <HardDrive class="size-3.5 text-foreground/70" />
      <span class="text-xs font-semibold">{$t('app.smart.regex.ai.cache.title')}</span>
    </div>
    <button
      onclick={handleRefresh}
      disabled={cache.state.is_checking}
      class="text-foreground/50 hover:text-foreground transition-colors"
      title={$t('app.smart.regex.ai.cache.refresh')}
      aria-label={$t('app.smart.regex.ai.cache.refresh')}
    >
      <RefreshCw class="size-3 {cache.state.is_checking ? 'animate-spin' : ''}" />
    </button>
  </div>

  <!-- Error message (e.g. "model in use") -->
  {#if cache.state.error === 'in_use'}
    <div class="rounded-md bg-yellow-400/10 px-2 py-1.5 text-[10px] text-yellow-600 dark:text-yellow-400">
      {$t('app.smart.regex.ai.cache.in_use')}
    </div>
  {:else if cache.state.error}
    <div class="rounded-md bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">
      {cache.state.error}
    </div>
  {/if}

  <!-- Model list -->
  <div class="space-y-1.5">
    {#each aiModels.getEnabledModels() as model (model.model_id)}
      {@const is_cached = cache.state.cache_status[model.model_id] ?? false}
      {@const is_active = model.model_id === active_model_id}
      {@const size = cache.state.model_sizes[model.model_id] ?? 0}
      <div class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 {is_active ? 'bg-accent/50' : ''}">
        <div class="flex items-center gap-2 min-w-0">
          <ModelIcon model_id={model.model_id} class="size-4 shrink-0" />
          <div class="min-w-0">
            <div class="text-xs font-medium truncate">{model.name}</div>
            <div class="flex items-center gap-1.5">
              <RankMeter rank={model_ranks[model.model_id]} />
              <span class="text-[9px] {is_cached ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}">
                {#if is_cached}
                  {$t('app.smart.regex.ai.cache.cached')} · {formatBytes(size)}
                {:else}
                  {$t('app.smart.regex.ai.cache.not_cached')}
                {/if}
              </span>
            </div>
          </div>
        </div>
        {#if is_cached}
          <button
            onclick={() => handleDelete(model.model_id)}
            disabled={is_active || cache.state.is_deleting}
            class="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={is_active ? $t('app.smart.regex.ai.cache.in_use') : $t('app.smart.regex.ai.cache.delete')}
            aria-label={$t('app.smart.regex.ai.cache.delete')}
            data-testid={`cache-delete-${model.model_id}`}
          >
            <Trash2 class="size-3" />
          </button>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Orphaned models (cached but not in DB catalog) -->
  {#if Object.keys(cache.state.orphaned_models).length > 0}
    <div class="space-y-1 pt-2 border-t border-border/40">
      <div class="flex items-center gap-1 text-[10px] text-muted-foreground">
        <AlertTriangle class="size-3 text-yellow-500" />
        <span>{$t('app.smart.regex.ai.cache.orphaned_title')}</span>
      </div>
      {#each Object.entries(cache.state.orphaned_models) as [model_id, size] (model_id)}
        <div class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 bg-yellow-500/5">
          <div class="min-w-0">
            <div class="text-xs font-medium truncate">{friendlyModelName(model_id)}</div>
            <div class="text-[9px] text-muted-foreground truncate font-mono">{model_id}</div>
            <span class="text-[9px] text-green-600 dark:text-green-400">
              {$t('app.smart.regex.ai.cache.cached')} · {formatBytes(size)}
            </span>
          </div>
          <button
            onclick={() => handleDeleteOrphaned(model_id)}
            disabled={model_id === active_model_id || cache.state.is_deleting}
            class="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={$t('app.smart.regex.ai.cache.delete')}
            aria-label={$t('app.smart.regex.ai.cache.delete')}
            data-testid={`cache-delete-orphan-${model_id}`}
          >
            <Trash2 class="size-3" />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Storage bar -->
  {#if cache.state.storage_usage !== null && cache.state.storage_quota !== null}
    {@const pct = cache.state.storage_quota > 0 ? Math.min(100, (cache.state.storage_usage / cache.state.storage_quota) * 100) : 0}
    <div class="space-y-1">
      <div class="flex justify-between text-[9px] text-muted-foreground">
        <span>{$t('app.smart.regex.ai.cache.storage_used', { used: formatBytes(cache.state.storage_usage), quota: formatBytes(cache.state.storage_quota) })}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div class="h-1 rounded-full bg-muted overflow-hidden">
        <div
          class="h-full rounded-full transition-all"
          style="width: {pct}%; background-image: linear-gradient(to right, #38bdf8, #6366f1, #8b5cf6, #6366f1, #38bdf8);"
        ></div>
      </div>
    </div>
  {/if}

  <!-- Delete all -->
  <Button
    variant="outline"
    size="sm"
    onclick={handleDeleteAll}
    disabled={cache.state.is_deleting}
    class="w-full text-xs"
    data-testid="cache-delete-all"
  >
    <Trash2 class="size-3" />
    {$t('app.smart.regex.ai.cache.delete_all')}
  </Button>
</div>
