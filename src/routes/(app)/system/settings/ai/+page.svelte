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
  import { useConfigEntries } from '$lib/composables/useConfigEntries.svelte';
  import ModelCacheSection from '$lib/components/ui/smart-regex-input/ModelCacheSection.svelte';
  import ModelIcon from '$lib/components/ui/smart-regex-input/ModelIcon.svelte';
  import ScoreGauge, { gaugeColor } from '$lib/components/ui/smart-regex-input/ScoreGauge.svelte';
  import { HardDrive, BrainCircuit, Cpu, Thermometer, Gauge, Brackets, Gavel, Download, MemoryStick, ShieldCheck, ShieldX, Trash2, RotateCcw, CircuitBoard, Star } from '@lucide/svelte';
  import type { AiModel, AiCerebellum } from '$lib/api-types';
  import { fetchAiCerebellum } from '$lib/api';
  import { resolveEffectiveParams, tuningOverriddenKeys } from '$lib/ai/ai-cerebellum';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import ComboSelect from '$lib/components/ui/combo-select/combo-select.svelte';
  import CerebellumRecommendationBadge from '$lib/components/ui/smart-ai/cerebellum-recommendation-badge.svelte';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import { Button } from '$lib/components/ui/button';
  import DeletionFilterToggle from '$lib/components/entity-list-table/toolbar/DeletionFilterToggle.svelte';
  import { useMfaStepUp } from '$lib/composables/useMfaStepUp.svelte';
  import MfaStepUpDialog from '$lib/components/auth/MfaStepUpDialog.svelte';
  import { pushNotification } from '$lib/errors/app-errors';
  import { apiFetch, updateConfigEntry } from '$lib/api';
  import { Badge } from '$lib/components/ui/badge';
  import { summarizeTestScores } from '$lib/ai/ai-model-test-scores';
  import AiModelTestReport from '$lib/components/ui/smart-ai/ai-model-test-report.svelte';

  const aiModels = useAiModels();
  const configEntries = useConfigEntries();
  const stepUp = useMfaStepUp();

  // Default model = the `ai_assistant_model` config entry value. This is the
  // persisted default every Smart* assistant resolves at mount (distinct from
  // a runtime model switch inside a panel).
  let defaultEntry = $derived(configEntries.state.entries.find((e) => e.key === 'ai_assistant_model'));
  let defaultModelId = $derived(defaultEntry?.value != null ? String(defaultEntry.value) : null);
  let settingDefaultFor = $state<string | null>(null);

  async function setDefaultModel(model: AiModel) {
    const entry = defaultEntry;
    if (!entry || settingDefaultFor !== null) return;
    settingDefaultFor = model.model_id;
    try {
      await updateConfigEntry(entry.uuid, { value: model.model_id }, entry.version);
      await configEntries.refresh();
      pushNotification({
        impact: 'NONE',
        message: `${model.name} → ${$t('system.entities.ai_model.default')}`,
        scope: 'AI Model',
        toast: true,
      });
    } catch (err) {
      pushNotification({
        impact: 'MEDIUM',
        messageKey: 'system.entities.ai_model.set_as_default',
        scope: 'AI Model',
        detail: err instanceof Error ? err.message : 'Set default failed',
        toast: true,
      });
    } finally {
      settingDefaultFor = null;
    }
  }

  // Rank map for ModelCacheSection (model_id → rank).
  let modelRanks = $state<Record<string, number | null>>({});

  // Cerebellum tunings (assistant × model), fetched once alongside the catalog.
  let cerebellumRows = $state<AiCerebellum[]>([]);
  let cerebellumError = $state<string | null>(null);

  onMount(async () => {
    await Promise.all([aiModels.ensureLoaded(), configEntries.ensureLoaded()]);
    modelRanks = Object.fromEntries(
      aiModels.getEnabledModels().map((m) => [m.model_id, m.rank]),
    );
    try {
      cerebellumRows = await fetchAiCerebellum();
    } catch (err) {
      cerebellumError = err instanceof Error ? err.message : 'Failed to load cerebellum tunings';
    }
  });

  // Selected assistant in the models-toolbar dropdown — null = model defaults
  // (no tuning override applied to the params shown per model row).
  let selectedAssistantKey = $state<string>('');

  // Enabled, non-deleted tunings — the only rows that can override params.
  let enabledTunings = $derived(cerebellumRows.filter((r) => r.is_enabled && !r.deleted_at));

  // Distinct assistants that own ≥1 tuning (dropdown options). `name` is the
  // assistant's i18n key shared by all its rows (verified in DB).
  let cerebellumAssistants = $derived.by(() => {
    const byKey = new Map<string, AiCerebellum>();
    for (const row of enabledTunings) {
      if (!byKey.has(row.assistant_key)) byKey.set(row.assistant_key, row);
    }
    return [...byKey.entries()].map(([key, row]) => ({ key, name: row.name }));
  });

  /** Tuning for a (model_id, selected assistant) pair, or null. */
  function tuningFor(model_id: string): AiCerebellum | null {
    if (!selectedAssistantKey) return null;
    return enabledTunings.find(
      (r) => r.assistant_key === selectedAssistantKey && r.model_id === model_id,
    ) ?? null;
  }

  /** Enabled tunings of a model carrying a recommendation, grouped by type —
   *  shown on the card when no assistant is selected (model defaults). */
  function recommendationsFor(model_id: string): { recommendation: 'RECOMMENDED' | 'NOT_RECOMMENDED'; names: string[] }[] {
    const names: Record<string, string[]> = { RECOMMENDED: [], NOT_RECOMMENDED: [] };
    for (const r of enabledTunings) {
      if (r.model_id === model_id && r.recommendation) names[r.recommendation].push(r.name);
    }
    return (Object.keys(names) as ('RECOMMENDED' | 'NOT_RECOMMENDED')[])
      .filter((k) => names[k].length > 0)
      .map((k) => ({ recommendation: k, names: names[k] }));
  }

  function openCerebellumCreate() {
    openSheet('shell.aiCerebellum', {
      models: aiModels.getEnabledModels(),
      assistants: cerebellumAssistants,
      rows: cerebellumRows,
      onCreated: () => {
        cerebellumRows = [];
        fetchAiCerebellum().then((rows) => (cerebellumRows = rows));
      },
    });
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
      <!-- Toolbar: cerebellum assistant selector + create CTA + deletion filter + refresh -->
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CircuitBoard class="size-3.5" />
          <span>{$t('app.smart.ai.cerebellum.title')}</span>
        </div>
        <ComboSelect
          mode="single"
          bind:value={selectedAssistantKey}
          options={[
            { key: '', label: $t('app.smart.ai.cerebellum.model_defaults') },
            ...cerebellumAssistants.map((a) => ({ key: a.key, label: $t(a.name) })),
          ]}
          valueField="key"
          labelField="label"
          searchable={false}
          class="w-44"
          aria-label={$t('app.smart.ai.cerebellum.title')}
          data-testid="ai-cerebellum-assistant-trigger"
        />
        <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>
        <Button
          variant="default"
          size="sm"
          type="button"
          onclick={openCerebellumCreate}
          data-testid="ai-cerebellum-create-cta"
        >
          {$t('system.entities.ai_cerebellum.create')}
        </Button>
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
          {@const tuning = tuningFor(model.model_id)}
          {@const eff = resolveEffectiveParams(model, tuning)}
          {@const overridden = tuningOverriddenKeys(tuning)}
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
                    {#if model.model_id === defaultModelId}
                      <Badge
                        variant="outline"
                        class="border-sky-400/60 bg-gradient-to-r from-sky-400/15 to-indigo-500/15 text-sky-700 dark:text-sky-300"
                        data-testid={`ai-model-default-${model.model_id}`}
                      >
                        <Star class="size-3 fill-current" />
                        {$t('system.entities.ai_model.default')}
                      </Badge>
                    {/if}
                    {#if tuning?.recommendation}
                      <CerebellumRecommendationBadge recommendation={tuning.recommendation} size="md" />
                    {:else if !selectedAssistantKey}
                      {#each recommendationsFor(model.model_id) as rec (rec.recommendation)}
                        <CerebellumRecommendationBadge recommendation={rec.recommendation} names={rec.names} size="md" />
                      {/each}
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
                      {#if eff.enable_thinking}
                        <BrainCircuit class="size-3" />
                        <span class={overridden.has('enable_thinking') ? 'text-primary-gradient' : ''}>{$t('system.entities.ai_model.thinking.true')}</span>
                      {:else}
                        <Cpu class="size-3" />
                        <span class={overridden.has('enable_thinking') ? 'text-primary-gradient' : ''}>{$t('system.entities.ai_model.thinking.false')}</span>
                      {/if}
                    </span>
                  </div>
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.temperature')}>
                      <Thermometer class="size-3" />
                      <span class={overridden.has('temperature') ? 'text-primary-gradient' : ''}>T={eff.temperature}</span>
                    </span>
                    <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.top_p')}>
                      <Gauge class="size-3" />
                      <span class={overridden.has('top_p') ? 'text-primary-gradient' : ''}>top_p={eff.top_p}</span>
                    </span>
                    <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.max_tokens')}>
                      <Brackets class="size-3" />
                      <span class={overridden.has('max_tokens') ? 'text-primary-gradient' : ''}>max_tokens={eff.max_tokens}</span>
                    </span>
                    <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.repetition_penalty')}>
                      <Gavel class="size-3" />
                      <span class={overridden.has('repetition_penalty') ? 'text-primary-gradient' : ''}>rep_penalty={eff.repetition_penalty}</span>
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

                <!-- Test scores gauge: minimal popover + details CTA → side sheet -->
                <AiModelTestReport {model} />

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
                      <!-- Speed rubric as a gradient bar: each 1/6 band is the
                           gaugeColor bucket; scores sit above their color, the
                           second thresholds below. Marker = model's speed. -->
                      <div class="px-0.5 pb-3 pt-3.5">
                        <div class="relative">
                          <div class="absolute inset-x-0 -top-3 flex">
                            {#each [0, 1, 2, 3, 4, 5] as s (s)}
                              <span class="flex-1 text-center font-mono text-[9px] font-bold" style="color:{gaugeColor(s, 5)}">{s}</span>
                            {/each}
                          </div>
                          <div
                            class="h-1.5 rounded-full"
                            style="background:linear-gradient(to right, #ef4444 0% 30%, #f97316 30% 50%, #eab308 50% 70%, #84cc16 70% 90%, #22c55e 90% 100%)"
                          ></div>
                          {#if tsSummary.speed !== null}
                            <div
                              class="absolute -top-1 h-3.5 w-px bg-foreground"
                              style="left:{Math.min(100, Math.max(0, (tsSummary.speed / 5) * 100))}%"
                              title={$t('system.entities.ai_model.fields.speed')}
                            ></div>
                          {/if}
                          <div class="absolute inset-x-0 top-3.5 flex font-mono text-[9px] text-muted-foreground">
                            {#each ['> 10s', '≤ 10s', '≤ 9s', '≤ 7s', '≤ 5s', '≤ 3s'] as sec, i (i)}
                              <span class="flex-1 text-center">{sec}</span>
                            {/each}
                          </div>
                        </div>
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
                  <!-- Active non-default: offer "set as default" (updates the
                       persisted ai_assistant_model config entry) -->
                  {#if model.model_id !== defaultModelId && model.is_enabled}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onclick={() => setDefaultModel(model)}
                      disabled={settingDefaultFor !== null}
                      title={$t('system.entities.ai_model.set_as_default')}
                      aria-label={$t('system.entities.ai_model.set_as_default')}
                      data-testid={`ai-model-set-default-${model.model_id}`}
                    >
                      <Star class={settingDefaultFor === model.model_id ? 'size-4 animate-spin' : 'size-4'} />
                    </Button>
                  {/if}
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
