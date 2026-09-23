<script lang="ts">
  /**
   * AiModelDetailsPopover — Microchip-triggered popover showing the active
   * model's identity, size metrics, generation params, and KPI gauges.
   *
   * Shared by all Smart* assistant panels (i18n_ns + testid_prefix props).
   */
  import * as Popover from '$lib/components/ui/popover/index.js';
  import ScoreGauge from '$lib/components/ui/smart-regex-input/ScoreGauge.svelte';
  import ModelIcon from '$lib/components/ui/smart-regex-input/ModelIcon.svelte';
  import { summarizeTestScores } from '$lib/ai/ai-model-test-scores';
  import { resolveEffectiveParams, tuningOverriddenKeys } from '$lib/ai/ai-cerebellum';
  import CerebellumRecommendationBadge from './cerebellum-recommendation-badge.svelte';
  import type { AiCerebellum, AiModel } from '$lib/api-types';
  import type { EffectiveAiParams } from '$lib/ai/ai-cerebellum';
  import { t } from '$lib/i18n';
  import Microchip from '@lucide/svelte/icons/microchip';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import Cpu from '@lucide/svelte/icons/cpu';
  import Thermometer from '@lucide/svelte/icons/thermometer';
  import Gauge from '@lucide/svelte/icons/gauge';
  import Brackets from '@lucide/svelte/icons/brackets';
  import Gavel from '@lucide/svelte/icons/gavel';
  import CircuitBoard from '@lucide/svelte/icons/circuit-board';
  import Database from '@lucide/svelte/icons/database';

  let {
    model,
    cache_size = 0,
    effective_params,
    tuning = null,
    on_open,
    i18n_ns,
    testid_prefix,
  }: {
    /** The active model entity (popover content is empty when undefined). */
    model: AiModel | undefined;
    /** Cached bytes for this model (from useModelCache). */
    cache_size?: number;
    /** Effective generation params after cerebellum resolution. */
    effective_params?: EffectiveAiParams;
    /** Selected cerebellum tuning (null = model defaults). */
    tuning?: AiCerebellum | null;
    /** Called when the popover opens (e.g. refresh cache status). */
    on_open?: () => void;
    /** i18n namespace, e.g. 'app.smart.regex.ai'. */
    i18n_ns: string;
    /** data-testid prefix, e.g. 'smart-regex-ai'. */
    testid_prefix: string;
  } = $props();

  let scores = $derived(summarizeTestScores(model?.test_scores));
  let params = $derived(effective_params ?? resolveEffectiveParams(model, tuning));
  let tunedKeys = $derived(tuningOverriddenKeys(tuning));

  function formatMegabytes(value: number | null | undefined): string {
    if (!value || value <= 0) return '—';
    return value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${Math.round(value)} MB`;
  }

  function formatBytes(value: number): string {
    if (value <= 0) return '—';
    return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${Math.round(value / 1024 ** 2)} MB`;
  }
</script>

<Popover.Root>
  <Popover.Trigger
    class="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-foreground/50 hover:bg-accent hover:text-foreground transition-colors"
    title={$t(`${i18n_ns}.model_details.title`)}
    aria-label={$t(`${i18n_ns}.model_details.title`)}
    onclick={on_open}
    data-testid="{testid_prefix}-model-details-trigger"
  >
    <Microchip class="size-3.5" />
  </Popover.Trigger>
  <Popover.Content align="end" class="w-72 p-0">
    {#if model}
      <div class="space-y-3 p-3" data-testid="{testid_prefix}-model-details">
        <div class="flex items-start gap-2 border-b border-border/50 pb-2">
          <ModelIcon model_id={model.model_id} class="mt-0.5 size-5 shrink-0" />
          <div class="min-w-0">
            <p class="truncate text-xs font-semibold">{model.name}</p>
            <p class="truncate font-mono text-[10px] text-muted-foreground">{model.model_id}</p>
          </div>
        </div>
        <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs">
          <dt class="text-muted-foreground">{$t(`${i18n_ns}.model_details.engine`)}</dt>
          <dd class="font-medium">{model.engine_type}</dd>
          <dt class="text-muted-foreground">{$t(`${i18n_ns}.model_details.quantization`)}</dt>
          <dd class="font-medium">{model.dtype ?? '—'}</dd>
          <dt class="text-muted-foreground">{$t(`${i18n_ns}.model_details.download_size`)}</dt>
          <dd class="font-medium">{formatMegabytes(model.download_size_mb)}</dd>
          <dt class="text-muted-foreground">{$t(`${i18n_ns}.model_details.cache_size`)}</dt>
          <dd class="font-medium">{formatBytes(cache_size)}</dd>
          <dt class="text-muted-foreground">{$t(`${i18n_ns}.model_details.vram_size`)}</dt>
          <dd class="font-medium">{formatMegabytes(model.vram_mb)}</dd>
        </dl>
        {#if tuning}
          <div class="flex items-center gap-1.5 rounded-md bg-accent/50 px-2 py-1 text-[10px]">
            <CircuitBoard class="size-3 shrink-0 text-foreground/60" />
            <span class="text-muted-foreground">{$t(`app.smart.ai.cerebellum.title`)}:</span>
            <span class="font-medium text-foreground">{tuning.name}</span>
            <CerebellumRecommendationBadge recommendation={tuning.recommendation} />
          </div>
        {/if}
        <div class="space-y-1.5 text-[10px]">
          <div class="flex items-center justify-between">
            <span class="uppercase tracking-wide text-muted-foreground/70">
              {$t(`app.smart.ai.model_details.sampling`)}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span
              class="flex items-center gap-1"
              class:text-foreground={tunedKeys.has('temperature')}
              class:font-semibold={tunedKeys.has('temperature')}
              title={$t('system.entities.ai_model.fields.temperature')}
            >
              <Thermometer class="size-3" />
              T={params.temperature}
            </span>
            <span
              class="flex items-center gap-1"
              class:text-foreground={tunedKeys.has('top_p')}
              class:font-semibold={tunedKeys.has('top_p')}
              title={$t('system.entities.ai_model.fields.top_p')}
            >
              <Gauge class="size-3" />
              top_p={params.top_p}
            </span>
            <span
              class="flex items-center gap-1"
              class:text-foreground={tunedKeys.has('repetition_penalty')}
              class:font-semibold={tunedKeys.has('repetition_penalty')}
              title={$t('system.entities.ai_model.fields.repetition_penalty')}
            >
              <Gavel class="size-3" />
              rep_penalty={params.repetition_penalty}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-1.5 text-muted-foreground">
            <span
              class="flex items-center gap-1"
              class:text-foreground={tunedKeys.has('max_tokens')}
              class:font-semibold={tunedKeys.has('max_tokens')}
              title={$t('system.entities.ai_model.fields.max_tokens')}
            >
              <Brackets class="size-3" />
              max_tokens={params.max_tokens}
            </span>
            <span
              class="flex items-center gap-1"
              class:text-foreground={tunedKeys.has('enable_thinking')}
              class:font-semibold={tunedKeys.has('enable_thinking')}
              title={$t('system.entities.ai_model.fields.enable_thinking')}
            >
              {#if params.enable_thinking}
                <BrainCircuit class="size-3" />
                <span>{$t('system.entities.ai_model.thinking.true')}</span>
              {:else}
                <Cpu class="size-3" />
                <span>{$t('system.entities.ai_model.thinking.false')}</span>
              {/if}
            </span>
            <span
              class="flex items-center gap-1"
              class:text-foreground={tunedKeys.has('execution_config')}
              class:font-semibold={tunedKeys.has('execution_config')}
              title={$t(`app.smart.ai.model_details.kv_cache`)}
            >
              <Database class="size-3" />
              {#if params.execution_config?.kv_cache_reuse}
                <span>{$t(`app.smart.ai.model_details.kv_cache_on`)}</span>
              {:else}
                <span>{$t(`app.smart.ai.model_details.kv_cache_off`)}</span>
              {/if}
            </span>
          </div>
        </div>
        <div class="flex items-start justify-between gap-1 border-t border-border/50 pt-2" data-testid="{testid_prefix}-model-kpis">
          <ScoreGauge
            value={model.power_level}
            size={42}
            label={$t(`${i18n_ns}.model_details.power`)}
          />
          <ScoreGauge
            value={scores.score}
            size={42}
            label={$t(`${i18n_ns}.model_details.test_score`)}
          />
          <ScoreGauge
            value={scores.speed}
            size={42}
            label={$t(`${i18n_ns}.model_details.speed`)}
          />
          <ScoreGauge
            value={model.rank}
            size={42}
            label={$t(`${i18n_ns}.model_details.rank`)}
          />
        </div>
      </div>
    {/if}
  </Popover.Content>
</Popover.Root>
