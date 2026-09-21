<script lang="ts">
  /**
   * AI settings page — generic AI configuration area.
   *
   * Currently hosts:
   *   - The `ai_model` entity list (read-only display from useAiModels)
   *   - WebLLM model cache management (ModelCacheSection)
   *
   * The page label is generic ("AI") so future AI configuration
   * (RAG, prompts, etc.) can live here without a rename.
   *
   * Full admin CRUD for ai_model rows is handled by the BE entity API
   * (/api/v1/entities/ai_model/*). This page shows the current catalog
   * and the browser cache management UI.
   */
  import { t } from '$lib/i18n';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { useAiModels } from '$lib/composables/useAiModels.svelte';
  import ModelCacheSection from '$lib/components/ui/smart-regex-input/ModelCacheSection.svelte';
  import ModelIcon from '$lib/components/ui/smart-regex-input/ModelIcon.svelte';
  import ScoreGauge from '$lib/components/ui/smart-regex-input/ScoreGauge.svelte';
  import { HardDrive, BrainCircuit, Cpu, Thermometer, Gauge, Brackets, Gavel, Download, MemoryStick, ShieldCheck, ShieldX, Trash2, RotateCcw, CircuitBoard } from '@lucide/svelte';
  import type { AiModel, AiCerebellum } from '$lib/api-types';
  import { fetchAiCerebellum } from '$lib/api';
  import { resolveEffectiveParams } from '$lib/ai/ai-cerebellum';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import { Button } from '$lib/components/ui/button';
  import DeletionFilterToggle from '$lib/components/entity-list-table/toolbar/DeletionFilterToggle.svelte';
  import { useMfaStepUp } from '$lib/composables/useMfaStepUp.svelte';
  import MfaStepUpDialog from '$lib/components/auth/MfaStepUpDialog.svelte';
  import { pushNotification } from '$lib/errors/app-errors';
  import { apiFetch } from '$lib/api';
  import { summarizeTestScores, testCaseLabel } from '$lib/ai/ai-model-test-scores';

  const aiModels = useAiModels();
  const stepUp = useMfaStepUp();

  // Rank map for ModelCacheSection (model_id → rank).
  let modelRanks = $state<Record<string, number | null>>({});

  // Cerebellum tunings (assistant × model), fetched once alongside the catalog.
  let cerebellumRows = $state<AiCerebellum[]>([]);
  let cerebellumError = $state<string | null>(null);

  onMount(async () => {
    await aiModels.ensureLoaded();
    modelRanks = Object.fromEntries(
      aiModels.getEnabledModels().map((m) => [m.model_id, m.rank]),
    );
    try {
      cerebellumRows = await fetchAiCerebellum();
    } catch (err) {
      cerebellumError = err instanceof Error ? err.message : 'Failed to load cerebellum tunings';
    }
  });

  // Tunings grouped by assistant_key: each group lists its tunings with the
  // resolved params (tuning override ← model default). The model row the
  // tuning targets is matched by model_id.
  let cerebellumGroups = $derived.by(() => {
    const byAssistant = new Map<string, AiCerebellum[]>();
    for (const row of cerebellumRows) {
      if (!row.is_enabled || row.deleted_at) continue;
      const list = byAssistant.get(row.assistant_key) ?? [];
      list.push(row);
      byAssistant.set(row.assistant_key, list);
    }
    return [...byAssistant.entries()].map(([assistant_key, rows]) => ({
      assistant_key,
      rows: rows.sort((a, b) => a.sort_order - b.sort_order),
    }));
  });

  function modelFor(model_id: string): AiModel | undefined {
    return aiModels.state.models.find((m) => m.model_id === model_id);
  }

  /** Short override summary for one tuning, e.g. "T=0.10 · max_tokens=512". */
  function tuningOverrides(t: AiCerebellum): string {
    const parts: string[] = [];
    if (t.temperature !== null && t.temperature !== undefined) parts.push(`T=${t.temperature}`);
    if (t.top_p !== null && t.top_p !== undefined) parts.push(`top_p=${t.top_p}`);
    if (t.max_tokens !== null && t.max_tokens !== undefined) parts.push(`max_tokens=${t.max_tokens}`);
    if (t.repetition_penalty !== null && t.repetition_penalty !== undefined) parts.push(`rep_penalty=${t.repetition_penalty}`);
    if (t.enable_thinking !== null && t.enable_thinking !== undefined) parts.push(t.enable_thinking ? 'thinking' : 'no-thinking');
    if (t.execution_config && Object.keys(t.execution_config).length) parts.push('exec_config');
    return parts.join(' · ');
  }

  // All models sorted by rank DESC (top ranked first).
  let allModels = $derived.by(() => {
    void aiModels.state.models;
    void aiModels.state.fetched;
    return [...aiModels.state.models].sort((a, b) => b.rank - a.rank);
  });

  // Deletion filter mode (non_deleted | deleted | all).
  let deletionFilterMode = $state<'non_deleted' | 'deleted' | 'all'>('non_deleted');

  function onDeletionFilterModeChange(mode: 'non_deleted' | 'deleted' | 'all') {
    deletionFilterMode = mode;
    aiModels.setDeletionFilterMode(mode);
  }

  // Delete dialog state.
  let deleteDialogOpen = $state(false);
  let modelToDelete = $state<{ uuid: string; name: string; version: number } | null>(null);
  let isDeleting = $state(false);

  function handleDeleteClick(uuid: string, name: string, version: number) {
    modelToDelete = { uuid, name, version };
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!modelToDelete) return;
    const targetUuid = modelToDelete.uuid;
    isDeleting = true;
    // Always go through step-up MFA — the BE requires it (403 + mfa_step_up_required).
    // executeWithToken: first attempt without token → BE 403 → dialog opens →
    // user verifies → retry with X-MFA-Action-Authorization header → DELETE succeeds.
    const resp = await stepUp.executeWithToken(
      (token) => apiFetch(`/api/v1/entities/ai_model/${targetUuid}?version=${modelToDelete!.version}`, {
        method: 'DELETE',
        headers: token ? { 'X-MFA-Action-Authorization': token } : {},
      }),
      { action: 'delete', target_resource: 'ai_model' },
    );
    if (resp.ok) {
      await aiModels.reload();
    } else {
      pushNotification({
        impact: 'MEDIUM',
        messageKey: 'system.entities.list.deleteFailed',
        scope: 'AI Model',
        detail: `Delete failed (${resp.status})`,
        toast: true,
      });
    }
    isDeleting = false;
    deleteDialogOpen = false;
    modelToDelete = null;
  }

  function cancelDelete() {
    deleteDialogOpen = false;
    modelToDelete = null;
  }

  // Restore handler.
  async function handleRestore(uuid: string, version: number) {
    const ok = await aiModels.restoreModel(uuid, version);
    if (!ok) {
      pushNotification({
        impact: 'MEDIUM',
        messageKey: 'system.entities.list.restoreFailed',
        scope: 'AI Model',
        detail: 'Restore failed',
        toast: true,
      });
    }
  }

  // Rank formula explanation (quality × 0.8 + speed × 0.2).
  function rankExplanation(model: AiModel): string {
    const s = summarizeTestScores(model.test_scores);
    if (s.quality !== null && s.speed !== null) {
      const raw = s.quality * 0.8 + s.speed * 0.2;
      return `(${s.quality.toFixed(2)} × 0.8) + (${s.speed.toFixed(2)} × 0.2) = ${raw.toFixed(1)} → ${model.rank}`;
    }
    return `quality × 0.8 + speed × 0.2 → ${model.rank}`;
  }

  // Power level explanation: parameters (from name/model_id) + dtype.
  function powerExplanation(model: AiModel): string {
    const m = `${model.name} ${model.model_id}`.match(/(\d+(?:\.\d+)?)\s*([bBmM])\b/);
    const params = m ? `${m[1]}${m[2].toUpperCase()}` : '?';
    return `${params} · ${model.dtype ?? '?'} → power ${model.power_level}/5`;
  }
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('app.system') },
          { label: $t('system.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key),
          }),
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">
        {$t('system.settings.ai.title')}
      </h1>
      <p class="text-sm text-muted-foreground">
        {$t('system.settings.ai.description')}
      </p>
    </div>
  {/snippet}

  <div class="flex-1 overflow-auto">
    <div class="space-y-6 p-4">
    <!-- AI Models catalog -->
    <section class="space-y-3" data-testid="ai-settings-models-section">
    <div
      class="sticky top-0 z-20 -mx-4 -mt-4 flex items-center justify-between gap-2 bg-background px-4 pb-2 pt-4"
      data-testid="ai-settings-models-sticky-header"
    >
      <div class="flex items-center gap-2">
        <BrainCircuit class="size-4 text-foreground/70" />
        <h2 class="text-sm font-semibold">{$t('system.settings.ai.models_section.title')}</h2>
      </div>
      <!-- Toolbar: deletion filter toggle + refresh -->
      <div class="flex items-center gap-2">
        <DeletionFilterToggle
          deletionFilterMode={deletionFilterMode}
          onDeletionFilterModeChange={onDeletionFilterModeChange}
        />
        <Button
          variant="soft"
          size="icon-sm"
          disabled={aiModels.state.loading}
          onclick={() => aiModels.reload()}
          aria-label={$t('system.entities.list.refresh')}
          title={$t('system.entities.list.refresh')}
        >
          <RotateCcw class={aiModels.state.loading ? 'size-4 animate-spin' : 'size-4'} />
        </Button>
      </div>
    </div>

    {#if aiModels.state.loading}
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <div class="size-4 animate-spin rounded-full border-2 border-muted border-t-foreground"></div>
        {$t('app.common.loading')}
      </div>
    {:else if aiModels.state.error}
      <div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {aiModels.state.error}
      </div>
    {:else}
      <div class="space-y-2">
        {#each allModels as model (model.uuid)}
          <div
            class="rounded-lg border border-border/60 p-3 {model.is_enabled && !model.deleted_at ? '' : 'opacity-50'}"
            data-testid={`ai-model-row-${model.model_id}`}
          >
            <div class="flex items-start gap-4 min-w-0">
              <!-- Column 1: title + metadata (34%) -->
              <div class="flex items-start gap-3 min-w-0" style="flex: 34 1 0%;">
                <ModelIcon model_id={model.model_id} class="size-5 shrink-0 mt-0.5" />
                <div class="min-w-0 space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium">{model.name}</span>
                    {#if model.compatibility_status === 'COMPATIBLE'}
                      <span class="flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400" title={$t('system.entities.ai_model.compatibility.COMPATIBLE')}>
                        <ShieldCheck class="size-3" />
                      </span>
                    {:else if model.compatibility_status === 'NOT_COMPATIBLE'}
                      <span class="flex items-center gap-0.5 text-[10px] text-rose-600 dark:text-rose-400" title={$t('system.entities.ai_model.compatibility.NOT_COMPATIBLE')}>
                        <ShieldX class="size-3" />
                      </span>
                    {/if}
                    {#if !model.is_enabled}
                      <span class="text-[10px] text-muted-foreground">({$t('system.entities.ai_model.enabled.false')})</span>
                    {/if}
                  </div>
                  <div class="text-xs text-muted-foreground font-mono break-all">{model.model_id}</div>
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {#if model.download_size_mb}
                      <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.download_size_mb')}>
                        <Download class="size-3" />
                        {model.download_size_mb} MB
                      </span>
                    {/if}
                    {#if model.vram_mb}
                      <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.vram_mb')}>
                        <MemoryStick class="size-3" />
                        {Math.round(model.vram_mb)} MB
                      </span>
                    {/if}
                    <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.enable_thinking')}>
                      {#if model.enable_thinking}
                        <BrainCircuit class="size-3" />
                        <span>{$t('system.entities.ai_model.thinking.true')}</span>
                      {:else}
                        <Cpu class="size-3" />
                        <span>{$t('system.entities.ai_model.thinking.false')}</span>
                      {/if}
                    </span>
                  </div>
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.temperature')}>
                      <Thermometer class="size-3" />
                      T={model.temperature}
                    </span>
                    <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.top_p')}>
                      <Gauge class="size-3" />
                      top_p={model.top_p}
                    </span>
                    <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.max_tokens')}>
                      <Brackets class="size-3" />
                      max_tokens={model.max_tokens}
                    </span>
                    <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.repetition_penalty')}>
                      <Gavel class="size-3" />
                      rep_penalty={model.repetition_penalty}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Column 2: gauges (33%, vertically centered) -->
              <div class="flex items-center gap-3 shrink-0 justify-center" style="flex: 33 1 0%;">
                <!-- Power level gauge with explanation popover -->
                <Popover.Root>
                  <Popover.Trigger
                    class="inline-flex"
                    title={$t('system.entities.ai_model.fields.power_level')}
                    data-testid={`ai-model-power-cta-${model.model_id}`}
                  >
                    <ScoreGauge value={model.power_level} label={$t('system.entities.ai_model.fields.power_level')} />
                  </Popover.Trigger>
                  <Popover.Content align="start" class="w-64 p-0">
                    <div class="space-y-1 p-2" data-testid={`ai-model-power-dropdown-${model.model_id}`}>
                      <div class="text-xs font-semibold border-b border-border/40 pb-1 mb-1">
                        {$t('system.entities.ai_model.fields.power_level')}
                      </div>
                      <div class="text-[10px] text-muted-foreground space-y-1">
                        <p>{$t('system.entities.ai_model.power_level.explanation')}</p>
                        <p class="font-mono text-xs">{powerExplanation(model)}</p>
                        <p class="border-t border-border/40 pt-1">
                          {$t('system.entities.ai_model.power_level.disclaimer')}
                        </p>
                      </div>
                    </div>
                  </Popover.Content>
                </Popover.Root>

                <!-- Test scores gauge with popover dropdown -->
                <Popover.Root>
                  {@const tsSummary = summarizeTestScores(model.test_scores)}
                  <Popover.Trigger
                    class="inline-flex"
                    title={$t('system.entities.ai_model.fields.test_scores')}
                    data-testid={`ai-model-test-scores-cta-${model.model_id}`}
                  >
                    <ScoreGauge value={tsSummary.score} label={$t('system.entities.ai_model.fields.test_scores')} />
                  </Popover.Trigger>
                  <Popover.Content align="start" class="w-64 p-0">
                    <div
                      class="space-y-1 p-2"
                      data-testid={`ai-model-test-scores-dropdown-${model.model_id}`}
                    >
                      <div class="flex items-center justify-between border-b border-border/40 pb-1 mb-1">
                        <span class="text-xs font-semibold">{$t('system.entities.ai_model.fields.test_scores')}</span>
                        <span class="text-sm font-bold">{tsSummary.score?.toFixed(1) ?? '—'}</span>
                      </div>
                      {#if tsSummary.quality !== null || tsSummary.speed !== null || tsSummary.success}
                        <div class="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {#if tsSummary.quality !== null}<span>quality <b class="text-foreground">{tsSummary.quality.toFixed(1)}</b></span>{/if}
                          {#if tsSummary.speed !== null}<span>speed <b class="text-foreground">{tsSummary.speed.toFixed(1)}</b></span>{/if}
                          {#if tsSummary.success}<span>success <b class="text-foreground">{tsSummary.success}</b></span>{/if}
                        </div>
                      {/if}
                      {#each tsSummary.cases as testCase (testCase.key)}
                        <div class="space-y-0.5 py-0.5">
                          <div class="flex items-center justify-between text-xs font-medium">
                            <span class="capitalize">{testCaseLabel(testCase.key)}</span>
                            <span class="font-bold">{testCase.score !== null ? testCase.score.toFixed(1) : '—'}</span>
                          </div>
                          {#if testCase.runs?.length || testCase.method}
                            <div class="flex items-center gap-1 text-[10px] text-muted-foreground">
                              {#if testCase.runs?.length}
                                <span>runs:</span>
                                {#each testCase.runs as run, i (i)}
                                  <span class="rounded bg-muted px-1">{run}</span>
                                {/each}
                              {/if}
                              {#if testCase.method}<span class="ml-1">({testCase.method})</span>{/if}
                            </div>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  </Popover.Content>
                </Popover.Root>

                <Popover.Root>
                  {@const tsSummary = summarizeTestScores(model.test_scores)}
                  <Popover.Trigger
                    class="inline-flex"
                    title={$t('system.entities.ai_model.fields.speed')}
                    data-testid={`ai-model-speed-cta-${model.model_id}`}
                  >
                    <ScoreGauge value={tsSummary.speed} label={$t('system.entities.ai_model.fields.speed')} />
                  </Popover.Trigger>
                  <Popover.Content align="start" class="w-72 p-0">
                    <div class="space-y-2 p-2" data-testid={`ai-model-speed-dropdown-${model.model_id}`}>
                      <div class="flex items-center justify-between border-b border-border/40 pb-1">
                        <span class="text-xs font-semibold">{$t('system.entities.ai_model.fields.speed')}</span>
                        <span class="text-sm font-bold">{tsSummary.speed?.toFixed(1) ?? '—'}</span>
                      </div>
                      <p class="text-[10px] text-muted-foreground">
                        {$t('system.entities.ai_model.speed.explanation')}
                      </p>
                      {#if tsSummary.avg_response_s !== null}
                        <div class="flex items-center justify-between rounded bg-muted/40 px-2 py-1 font-mono text-xs">
                          <span class="text-muted-foreground">{$t('system.entities.ai_model.speed.avg_response')}</span>
                          <span class="font-semibold">{tsSummary.avg_response_s.toFixed(1)}s</span>
                        </div>
                      {/if}
                      <div class="grid grid-cols-2 gap-x-3 font-mono text-[10px] text-muted-foreground">
                        <span>≤ 3s → 5</span><span>≤ 5s → 4</span>
                        <span>≤ 7s → 3</span><span>≤ 9s → 2</span>
                        <span>≤ 10s → 1</span><span>&gt; 10s → 0</span>
                      </div>
                    </div>
                  </Popover.Content>
                </Popover.Root>

                <!-- Rank gauge with explanation popover -->
                <Popover.Root>
                  <Popover.Trigger
                    class="inline-flex"
                    title={$t('system.entities.ai_model.fields.rank')}
                    data-testid={`ai-model-rank-cta-${model.model_id}`}
                  >
                    <ScoreGauge value={model.rank} label={$t('system.entities.ai_model.fields.rank')} />
                  </Popover.Trigger>
                  <Popover.Content align="start" class="w-56 p-0">
                    <div class="space-y-1 p-2" data-testid={`ai-model-rank-dropdown-${model.model_id}`}>
                      <div class="text-xs font-semibold border-b border-border/40 pb-1 mb-1">
                        {$t('system.entities.ai_model.fields.rank')}
                      </div>
                      <div class="text-[10px] text-muted-foreground space-y-1">
                        <p>{$t('system.entities.ai_model.rank.explanation')}</p>
                        <p class="font-mono text-xs">{rankExplanation(model)}</p>
                      </div>
                    </div>
                  </Popover.Content>
                </Popover.Root>
              </div>

              <!-- Column 3: actions (33%, right-aligned) -->
              <div class="flex items-center shrink-0 justify-end gap-2 min-w-0" style="flex: 33 1 0%;" data-testid={`ai-model-actions-${model.model_id}`}>
                {#if model.deleted_at}
                  <!-- Deleted: show restore button -->
                  <Button
                    variant="soft"
                    size="sm"
                    onclick={() => handleRestore(model.uuid, model.version)}
                    disabled={aiModels.state.loading}
                    title={$t('app.common.restore')}
                    data-testid={`ai-model-restore-${model.model_id}`}
                  >
                    <RotateCcw class="size-3.5" />
                    {$t('app.common.restore')}
                  </Button>
                {:else}
                  <!-- Active: show delete (disable) button -->
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="text-destructive hover:text-destructive"
                    onclick={() => handleDeleteClick(model.uuid, model.name, model.version)}
                    disabled={aiModels.state.loading}
                    title={$t('app.common.delete')}
                    aria-label={$t('app.common.delete')}
                    data-testid={`ai-model-delete-${model.model_id}`}
                  >
                    <Trash2 class="size-4" />
                  </Button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Cerebellum section — per-assistant, per-model tuned params -->
  <section class="space-y-3" data-testid="ai-settings-cerebellum-section">
    <div class="flex items-center gap-2">
      <CircuitBoard class="size-4 text-foreground/70" />
      <h2 class="text-sm font-semibold">{$t('system.settings.ai.cerebellum_section.title')}</h2>
    </div>
    <p class="text-xs text-muted-foreground">{$t('system.settings.ai.cerebellum_section.description')}</p>
    {#if cerebellumError}
      <div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{cerebellumError}</div>
    {:else if cerebellumGroups.length === 0}
      <div class="text-sm text-muted-foreground" data-testid="ai-cerebellum-empty">{$t('system.settings.ai.cerebellum_section.empty')}</div>
    {:else}
      <div class="space-y-2">
        {#each cerebellumGroups as group (group.assistant_key)}
          <div class="rounded-lg border border-border/60 p-3 space-y-2" data-testid={`ai-cerebellum-group-${group.assistant_key}`}>
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium font-mono">{group.assistant_key}</span>
              <span class="text-[10px] text-muted-foreground">{$t('system.settings.ai.cerebellum_section.assistant')}</span>
            </div>
            {#each group.rows as row (row.uuid)}
              {@const model = modelFor(row.model_id)}
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/30 px-2 py-1.5 text-xs" data-testid={`ai-cerebellum-row-${group.assistant_key}-${row.name}`}>
                <span class="font-medium">{$t(row.name)}</span>
                <span class="text-muted-foreground font-mono break-all">{model?.name ?? row.model_id}</span>
                {#if tuningOverrides(row)}
                  <span class="font-mono text-foreground/80">{tuningOverrides(row)}</span>
                {:else}
                  <span class="text-muted-foreground">{$t('app.smart.ai.cerebellum.model_defaults')}</span>
                {/if}
                {#if model}
                  {@const eff = resolveEffectiveParams(model, row)}
                  <span class="text-[10px] text-muted-foreground font-mono">
                    → T={eff.temperature} top_p={eff.top_p} max={eff.max_tokens} rep={eff.repetition_penalty} {eff.enable_thinking ? 'thinking' : 'no-thinking'}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- AI model cache management section -->
  <section class="space-y-3" data-testid="ai-settings-cache-section">
    <ModelCacheSection model_ranks={modelRanks}>
      {#snippet header()}
        <div class="flex items-center gap-2">
          <HardDrive class="size-4 text-foreground/70" />
          <h2 class="text-sm font-semibold">{$t('system.settings.ai.cache_section.title')}</h2>
        </div>
      {/snippet}
    </ModelCacheSection>
  </section>
    </div>
  </div>
</AppPageScaffold>

<!-- Delete confirmation dialog -->
<DialogBordered bind:open={deleteDialogOpen} severity="destructive" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('app.common.deleteConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      {$t('app.common.deleteConfirm')}
      {#if modelToDelete}
        <span class="block mt-1 font-medium">{modelToDelete.name}</span>
      {/if}
    </Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={cancelDelete}
      disabled={isDeleting}
    >
      {$t('app.common.cancel')}
    </Button>
    <Button
      variant="destructive"
      class="hover:scale-105 transition-all"
      onclick={confirmDelete}
      disabled={isDeleting}
      data-testid="ai-model-delete-confirm"
    >
      {#if isDeleting}
        {$t('app.common.deleting')}
      {:else}
        {$t('app.common.delete')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>

<!-- MFA step-up dialog -->
<MfaStepUpDialog
  bind:open={stepUp.dialogOpen}
  action={stepUp.pendingAction}
  target_resource={stepUp.pendingTargetResource}
  onauthorized={stepUp.handleAuthorized}
/>
