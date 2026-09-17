<script lang="ts">
  /**
   * RegexAiChatPanel — browser-only AI regex assistant panel.
   *
   * Uses WebLLM to convert natural language descriptions into regex patterns.
   * The model ID is loaded dynamically from the `ai_assistant_model` config row
   * (reserved, type `single_select` with `values_source: "ai_models"`).
   * Runs entirely in-browser via WebGPU — no backend AI calls.
   *
   * Flow:
   * 1. User types a description (e.g. "only lowercase letters, 3 to 5 characters")
   * 2. LLM generates 1-3 regex candidates (pattern + flags + description)
   * 3. The assistant message is suppressed (no raw JSON shown)
   * 4. A preview card shows the prettified regex + copy CTA
   * 5. A deterministic bullet list (from @eslint-community/regexpp) explains each part
   * 6. If 1 candidate: preview + bullet list + question (Yes/No on the right)
   * 7. If 2-3 candidates: preview cards (A/B/C) with bullet lists — click to apply
   *
   * AI states have distinct icons + CSS-only animations:
   * - Initializing: LoaderCircle (spin)
   * - Loading model: BrainCircuit (pulse) + progress bar
   * - Ready: AiIcon (gentle bounce, animated gradient)
   * - Streaming: Bot + three-dot typing indicator
   * - WebGPU error: AiIcon (pulse, no animation)
   * - Generic error: AlertCircle (shake)
   */
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { CopyButton } from '$lib/components/ui/copy-button';
  import * as Accordion from '$lib/components/ui/accordion/index.js';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import { useRegexAi, type RegexChoice } from '$lib/components/ui/smart-regex-input/use-regex-ai.svelte';
  import { explainRegex, summarizeRegex, type RegexSummary } from '$lib/components/ui/smart-regex-input/regex-explainer';
  import { useConfigEntries } from '$lib/composables/useConfigEntries.svelte';
  import { useAiModels } from '$lib/composables/useAiModels.svelte';
  import type { DeepReadonly } from '$lib/types/deep-readonly';
  import type { AiModel } from '$lib/api-types';
  import { summarizeTestScores, rankColor } from '$lib/ai/ai-model-test-scores';
  import RankMeter from '$lib/components/ui/smart-regex-input/RankMeter.svelte';
  import ScoreGauge from '$lib/components/ui/smart-regex-input/ScoreGauge.svelte';
  import ModelIcon from '$lib/components/ui/smart-regex-input/ModelIcon.svelte';
  import { dropdownMenuItemWithSelectedClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import ModelCachePanel from '$lib/components/ui/smart-regex-input/ModelCachePanel.svelte';
  import { useModelCache } from '$lib/ai/use-model-cache.svelte';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import { AiIcon } from '$lib/components/ui/ai-icon';
  import Send from '@lucide/svelte/icons/send';
  import X from '@lucide/svelte/icons/x';
  import Bot from '@lucide/svelte/icons/bot';
  import User from '@lucide/svelte/icons/user';
  import Check from '@lucide/svelte/icons/check';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import CircleStop from '@lucide/svelte/icons/circle-stop';
  import Cpu from '@lucide/svelte/icons/cpu';
  import Server from '@lucide/svelte/icons/server';
  import Info from '@lucide/svelte/icons/info';
  import StickyNotePlus from '@lucide/svelte/icons/sticky-note-plus';
  import HardDrive from '@lucide/svelte/icons/hard-drive';
  import Microchip from '@lucide/svelte/icons/microchip';
  import Thermometer from '@lucide/svelte/icons/thermometer';
  import Gauge from '@lucide/svelte/icons/gauge';
  import Brackets from '@lucide/svelte/icons/brackets';
  import Gavel from '@lucide/svelte/icons/gavel';
  import ArrowDownWideNarrow from '@lucide/svelte/icons/arrow-down-wide-narrow';

  interface $$Props {
    on_apply_regex: (pattern: string, flags: string) => void;
    config_type: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
    current_regex?: string;
    current_flags?: string;
  }

  let { on_apply_regex, config_type, current_regex = '', current_flags = '' }: $$Props = $props();

  // Load the configured AI model ID from the shared config composable.
  // The `ai_assistant_model` row is reserved and stores the full WebLLM ID.
  const config = useConfigEntries();
  const aiModels = useAiModels();

  // svelte-ignore state_referenced_locally
  // current_regex/current_flags are captured at panel open time — the sheet
  // creates a fresh panel instance each time, so these props are genuinely
  // static for the panel's lifetime (not reactive after initialization).
  // The AI composable is created lazily once the model ID is resolved.
  let ai = $state<ReturnType<typeof useRegexAi> | null>(null);
  let modelId = $state<string | null>(null);
  let inputText = $state('');
  let scrollContainer: HTMLElement | null = null;

  // AI source: "local" (default, WebLLM in-browser) or "backend" (coming soon).
  // The backend option is disabled — it will eventually point to the AI microservice.
  let aiSource = $state<'local' | 'backend'>('local');

  // All available local models for the model dropdown (from BE entity).
  let availableModels = $state<AiModel[]>([]);

  // Model cache composable for MRU tracking and auto-eviction.
  const modelCache = useModelCache();

  // Resolve the clean display name for the current model (e.g. "Qwen2.5 1.5B").
  // Reads from the AI composable's reactive state so it updates after switchModel.
  let modelDisplayName = $derived.by(() => {
    const currentId = ai?.state.model_id ?? modelId;
    if (!currentId) return '';
    const modelInfo = aiModels.getModelByModelId(currentId);
    return modelInfo ? modelInfo.name : '';
  });

  let currentModel = $derived.by<AiModel | undefined>(() => {
    const current_id = ai?.state.model_id ?? modelId;
    return current_id ? aiModels.getModelByModelId(current_id) : undefined;
  });

  // Panel lifecycle phase exposed as data-ai-phase on the root element —
  // lets E2E tests (and debugging) observe the real state machine instead
  // of polling for individual testids.
  let aiPhase = $derived(
    !ai
      ? 'init'
      : ai.state.error === 'webgpu_required'
        ? 'webgpu_required'
        : ai.state.is_loading_model
          ? `loading_${ai.state.load_phase ?? 'model'}`
          : ai.state.error
            ? 'error'
            : ai.state.is_ready
              ? 'ready'
              : 'idle'
  );

  // Rank of the currently active model — drives the trigger circle color
  // via the continuous red→green interpolation (rankColor).
  let currentRank = $derived(currentModel?.rank ?? null);

  // Sort criteria for the model dropdown. Fixed direction per key:
  // metrics descending (best first), alphabetic ascending A→Z.
  type ModelSortKey = 'rank' | 'alphabetic' | 'speed' | 'quality' | 'power';
  let modelSortBy = $state<ModelSortKey>('rank');

  const SORT_LABEL_KEYS: Record<ModelSortKey, string> = {
    rank: 'app.smart.regex.ai.model_details.rank',
    alphabetic: 'app.smart.regex.ai.sort.alphabetic',
    speed: 'app.smart.regex.ai.model_details.speed',
    quality: 'app.smart.regex.ai.model_details.test_score',
    power: 'app.smart.regex.ai.model_details.power',
  };

  const modelScoreCache = new Map<string, ReturnType<typeof summarizeTestScores>>();
  function scoresFor(model: AiModel) {
    let s = modelScoreCache.get(model.model_id);
    if (!s) {
      s = summarizeTestScores(model.test_scores);
      modelScoreCache.set(model.model_id, s);
    }
    return s;
  }

  let sortedModels = $derived.by<AiModel[]>(() => {
    const models = [...availableModels];
    switch (modelSortBy) {
      case 'alphabetic':
        return models.sort((a, b) => a.name.localeCompare(b.name));
      case 'speed':
        return models.sort((a, b) => (scoresFor(b).speed ?? -1) - (scoresFor(a).speed ?? -1));
      case 'quality':
        return models.sort((a, b) => (scoresFor(b).score ?? -1) - (scoresFor(a).score ?? -1));
      case 'power':
        return models.sort((a, b) => (b.power_level ?? -1) - (a.power_level ?? -1));
      case 'rank':
      default:
        return models.sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1));
    }
  });

  /**
   * Value of the active sort metric for a model row (all metrics are 0-5).
   * Null for rank/alphabetic — those rows show only the rank meter.
   */
  function sortMetricValue(model: AiModel): number | null {
    switch (modelSortBy) {
      case 'speed':
        return scoresFor(model).speed;
      case 'quality':
        return scoresFor(model).score;
      case 'power':
        return model.power_level;
      default:
        return null;
    }
  }

  let currentModelScores = $derived(summarizeTestScores(currentModel?.test_scores));
  let currentModelCacheSize = $derived(currentModel ? modelCache.state.model_sizes[currentModel.model_id] ?? 0 : 0);

  function formatMegabytes(value: number | null | undefined): string {
    if (!value || value <= 0) return '—';
    return value >= 1024 ? `${(value / 1024).toFixed(1)} GB` : `${Math.round(value)} MB`;
  }

  function formatBytes(value: number): string {
    if (value <= 0) return '—';
    return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${Math.round(value / 1024 ** 2)} MB`;
  }

  function refreshCurrentModelCache() {
    if (!currentModel) return;
    void modelCache.refreshCacheStatus([currentModel.model_id]);
  }

  /**
   * Switch to a different local model at runtime.
   * The composable unloads the current engine and loads the new one.
   */
  function handleSwitchModel(new_model_id: string) {
    if (!ai) return;
    void ai.switchModel(new_model_id);
  }

  onMount(() => {
    void (async () => {
      // 1. Resolve the configured model ID before creating the AI composable.
      await config.ensureLoaded();
      const entry = config.getEntry('ai_assistant_model');
      const configuredId = entry?.value ? String(entry.value) : null;
      if (!configuredId) {
        // Mandatory config missing — surface the error instead of faking a model.
        modelId = null;
        return;
      }

      // Check for a pending model switch from sessionStorage (set by
      // switchModel before page reload). If present, use that model ID
      // instead of the configured default.
      let switchModelId: string | null = null;
      try {
        switchModelId = sessionStorage.getItem('regex-ai-switch-model');
        if (switchModelId) sessionStorage.removeItem('regex-ai-switch-model');
      } catch { /* sessionStorage unavailable */ }

      modelId = switchModelId ?? configuredId;

      // 2. Load the model catalog from the BE entity (useAiModels).
      //    The dropdown + power levels are now backend-driven.
      await aiModels.ensureLoaded();
      availableModels = aiModels.getEnabledModels();

      // 3. Create the AI composable with the resolved model ID.
      ai = useRegexAi(modelId, current_regex, current_flags);

      // 4. Initialize the engine.
      void ai.init();
    })();

    return () => {
      void ai?.dispose();
    };
  });

  // Auto-scroll to bottom when messages change
  $effect(() => {
    if (!ai) return;
    void ai.state.messages.length;
    void ai.state.streaming_text;
    if (browser && scrollContainer) {
      queueMicrotask(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      });
    }
  });

  // Auto-focus the textarea as soon as the model is ready and the input is visible.
  $effect(() => {
    if (!ai || !ai.state.is_ready || ai.state.error) return;
    queueMicrotask(() => {
      const ta = document.querySelector('[data-testid="smart-regex-ai-input"]') as HTMLTextAreaElement | null;
      ta?.focus();
    });
  });

  // Record model use for MRU tracking + auto-eviction when a model becomes ready.
  $effect(() => {
    if (!ai || !ai.state.is_ready || ai.state.error) return;
    const currentId = ai.state.model_id;
    if (currentId) {
      void modelCache.recordModelUse(currentId);
    }
  });

  function handleSend() {
    if (!ai) return;
    const text = inputText.trim();
    if (!text || ai.state.is_streaming) return;
    inputText = '';
    void ai.sendMessage(text);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleApplyChoice(index: number, message_uuid?: string) {
    if (!ai) return;
    const choice = ai.applyChoice(index, message_uuid);
    if (choice) {
      on_apply_regex(choice.pattern, choice.flags);
      closeSheet();
    }
  }

  function handleConfirmSingle(message_uuid?: string) {
    handleApplyChoice(0, message_uuid);
  }

  function handleRejectSingle() {
    ai?.applyChoice(-1);
  }

  /**
   * Build a display string for the regex (pattern + flags).
   */
  function regexDisplay(choice: DeepReadonly<RegexChoice>): string {
    return choice.flags ? `${choice.pattern}/${choice.flags}` : choice.pattern;
  }

  /**
   * Recursively resolve a RegexSummary (which may contain nested RegexSummary
   * objects in its params) into a single translated string.
   */
  function resolveSummary(summary: RegexSummary): string {
    const resolved: Record<string, string> = {};
    for (const [k, v] of Object.entries(summary.params ?? {})) {
      if (typeof v === 'string' || typeof v === 'number') {
        resolved[k] = String(v);
      } else {
        resolved[k] = resolveSummary(v);
      }
    }
    return $t(summary.key, resolved);
  }

  /**
   * Tokenize a regex pattern into colored fragments for the prettifier.
   */
  function tokenizeRegex(pattern: string): { text: string; class: string }[] {
    const tokens: { text: string; class: string }[] = [];
    let i = 0;
    while (i < pattern.length) {
      const char = pattern[i];
      if (char === '^' || char === '$') {
        tokens.push({ text: char, class: 'text-rose-500 font-bold' });
        i++;
      }
      else if (char === '[') {
        let j = i + 1;
        while (j < pattern.length && pattern[j] !== ']') j++;
        if (j < pattern.length) j++;
        tokens.push({ text: pattern.slice(i, j), class: 'text-emerald-600 dark:text-emerald-400' });
        i = j;
      }
      else if (char === '{') {
        let j = i + 1;
        while (j < pattern.length && pattern[j] !== '}') j++;
        if (j < pattern.length) j++;
        tokens.push({ text: pattern.slice(i, j), class: 'text-violet-600 dark:text-violet-400 font-semibold' });
        i = j;
      }
      else if (char === '*' || char === '+' || char === '?') {
        tokens.push({ text: char, class: 'text-violet-600 dark:text-violet-400 font-semibold' });
        i++;
      }
      else if (char === '\\') {
        const end = i + 1 < pattern.length ? i + 2 : i + 1;
        tokens.push({ text: pattern.slice(i, end), class: 'text-blue-600 dark:text-blue-400' });
        i = end;
      }
      else if (char === '(') {
        let j = i + 1;
        let depth = 1;
        while (j < pattern.length && depth > 0) {
          if (pattern[j] === '(') depth++;
          else if (pattern[j] === ')') depth--;
          j++;
        }
        tokens.push({ text: pattern.slice(i, j), class: 'text-amber-600 dark:text-amber-400' });
        i = j;
      }
      else if (char === '.') {
        tokens.push({ text: char, class: 'text-cyan-600 dark:text-cyan-400' });
        i++;
      }
      else if (char === '|') {
        tokens.push({ text: char, class: 'text-orange-600 dark:text-orange-400 font-bold' });
        i++;
      }
      else {
        let j = i;
        while (j < pattern.length && !'^$[]{}*+?\\().|'.includes(pattern[j])) j++;
        if (j === i) j++;
        tokens.push({ text: pattern.slice(i, j), class: 'text-foreground' });
        i = j;
      }
    }
    return tokens;
  }
</script>

{#snippet headerTitle()}
  <div class="flex items-center gap-2">
    <AiIcon size={16} />
    <span class="text-primary-gradient font-semibold">{$t('app.common.ai.assistant_prefix')}</span>
    <span>{$t('app.smart.regex.ai.topic')}</span>
  </div>
{/snippet}

{#snippet headerActions()}
  <Button
    variant="ghost"
    size="icon"
    class="size-7"
    title={$t('app.smart.regex.ai.newSession')}
    onclick={() => { void ai?.clearConversation(); }}
    disabled={!ai || ai.state.messages.length === 0}
    data-testid="smart-regex-ai-new-session"
  >
    <StickyNotePlus class="size-4" />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    class="size-7"
    title={$t('app.common.close')}
    onclick={() => closeSheet()}
    data-testid="smart-regex-ai-close"
  >
    <X class="size-4" />
  </Button>
{/snippet}

<div class="flex h-full flex-col" data-testid="smart-regex-ai-panel" data-ai-phase={aiPhase}>
  <SheetHeader title={headerTitle} actions={headerActions} />

  <!-- Body -->
  <div class="flex min-h-0 flex-1 flex-col">
    {#if !ai}
      <!-- Config still loading (or missing) — show spinner -->
      <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
        {#if modelId === null}
          <AlertCircle class="size-8 text-destructive ai-icon-shake" />
          <p class="text-sm text-destructive px-4">
            {$t('app.smart.regex.ai.modelNotConfigured')}
          </p>
        {:else}
          <LoaderCircle class="size-6 animate-spin text-muted-foreground" />
          <p class="text-sm text-muted-foreground">Initializing...</p>
        {/if}
      </div>
    {:else if ai}
    <!-- Messages -->
    <div bind:this={scrollContainer} class="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {#if ai.state.messages.length === 0 && !ai.state.is_streaming}
        <!-- ─── Empty states with distinct icons + animations ─── -->
        {#if ai.state.error === 'webgpu_required'}
          <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <AiIcon size={32} no_animation class="ai-icon-pulse" />
            <p class="text-sm text-muted-foreground px-4">
              {$t('app.smart.regex.ai.webgpuRequired')}
            </p>
          </div>
        {:else if ai.state.is_loading_model}
          <div class="flex flex-col items-center justify-center gap-3 py-8">
            <BrainCircuit class="size-8 text-primary ai-icon-pulse" />
            <p class="text-sm text-muted-foreground" data-testid="smart-regex-ai-loading">
              {#if ai.state.load_phase === 'vram'}
                {$t('app.smart.regex.ai.loadingVram')} ({(ai.state.vram_elapsed_ms / 1000).toFixed(1)}s)
              {:else}
                {$t('app.smart.regex.ai.loadingModel', { progress: ai.state.load_progress })}
              {/if}
            </p>
            {#if ai.state.load_phase === 'vram'}
              <!-- VRAM phase: time-based determinate progress bar (capped at 95% until load_complete) -->
              <div class="w-full max-w-xs bg-muted rounded-full h-2 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-150"
                  style="width: {ai.state.vram_progress}%; background-image: linear-gradient(to right, #38bdf8, #6366f1, #8b5cf6);"
                  data-testid="smart-regex-ai-progress-bar"
                ></div>
              </div>
            {:else}
              <!-- Download phase: determinate progress bar -->
              <div class="w-full max-w-xs bg-muted rounded-full h-2 overflow-hidden">
                <div
                  class="h-full rounded-full animate-gradient-pan transition-all duration-300"
                  style="width: {ai.state.load_progress}%; background-image: linear-gradient(to right, #38bdf8, #6366f1, #8b5cf6, #6366f1, #38bdf8);"
                  data-testid="smart-regex-ai-progress-bar"
                ></div>
              </div>
            {/if}
            {#if ai.state.load_phase === 'downloading' && ai.state.total_files > 0}
              <p class="text-xs text-muted-foreground" data-testid="smart-regex-ai-loading-files">
                {ai.state.completed_files}/{ai.state.total_files} files
                {#if ai.state.slowest_file && ai.state.slowest_file.progress < 100}
                  — {ai.state.slowest_file.name.replace(/^onnx\//, '')}
                {/if}
              </p>
              <!-- Per-file progress bars -->
              <div class="w-full max-w-xs space-y-1" data-testid="smart-regex-ai-file-progress">
                {#each Object.entries(ai.state.file_progress) as [file, progress] (file)}
                  <div class="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span class="truncate flex-1">{file.replace(/^onnx\//, '')}</span>
                    <div class="flex-1 bg-muted rounded-full h-1 overflow-hidden">
                      <div
                        class="h-full rounded-full bg-primary/60 transition-all duration-200"
                        style="width: {progress}%"
                      ></div>
                    </div>
                    <span class="tabular-nums w-8 text-right">{Math.round(progress)}%</span>
                  </div>
                {/each}
              </div>
            {/if}
            {#if modelDisplayName}
              <p class="text-xs text-muted-foreground" data-testid="smart-regex-ai-loading-model-name">
                {modelDisplayName}
              </p>
            {/if}
            <!-- Cancel download CTA -->
            <Button
              size="sm"
              variant="outline"
              onclick={() => { void ai?.cancelLoad(); }}
              class="mt-1 gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50"
              data-testid="smart-regex-ai-cancel-load"
            >
              <CircleStop class="size-3.5" />
              {$t('app.smart.regex.ai.cancelLoad')}
            </Button>
          </div>
        {:else if ai.state.is_ready}
          <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <AiIcon size={32} class="ai-icon-bounce" />
            <p class="text-sm font-medium text-foreground">
              {$t('app.smart.regex.ai.modelReady')}
            </p>
            <p class="text-xs text-muted-foreground px-4">
              {$t('app.smart.regex.ai.welcome')}
            </p>
          </div>
        {:else if ai.state.error}
          <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <AlertCircle class="size-8 text-destructive ai-icon-shake" />
            <p class="text-sm text-destructive px-4">
              {ai.state.error}
            </p>
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <LoaderCircle class="size-6 animate-spin text-muted-foreground" />
            <p class="text-sm text-muted-foreground">Initializing...</p>
          </div>
        {/if}
      {:else}
        {#each ai.state.messages as message, msg_idx (message.uuid)}
          {#if message.role === 'user'}
            <!-- User message bubble -->
            <div class="flex gap-2 justify-end">
              <div class="max-w-[80%] rounded-lg px-3 py-2 text-xs bg-primary text-primary-foreground">
                {message.display_content ?? message.content}
              </div>
              <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <User class="size-4" />
              </div>
            </div>
          {:else if message.role === 'assistant' && message.choices && message.choices.length > 0}
            <!-- Assistant message with regex choices -->
            <div class="flex gap-2 justify-start">
              <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bot class="size-4 text-primary" />
              </div>
              <div class="bg-muted rounded-lg px-3 py-2 text-xs">
                {#if message.choices.length === 1 && message.choices[0].description}
                  {$t('app.smart.regex.ai.hereYouAreWithDesc', { desc: message.choices[0].description })}
                {:else}
                  {$t('app.smart.regex.ai.hereYouAre')}
                {/if}
              </div>
            </div>

            <!-- Single choice: preview + summary + breakdown accordion + Yes/No -->
            {#if message.choices.length === 1}
              {@const choice = message.choices[0]}
              {@const fullRegex = regexDisplay(choice)}
              {@const breakdown = explainRegex(choice.pattern, choice.flags)}
              {@const summary = summarizeRegex(choice.pattern, choice.flags)}
              {@const is_latest = msg_idx === ai.state.messages.length - 1}

              <!-- 1. Preview card -->
              <div class="rounded-lg border border-border bg-background overflow-hidden" data-testid="smart-regex-ai-preview">
                <div class="flex items-center justify-between gap-2 px-3 py-2 bg-muted/50 border-b border-border">
                  <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Regex</span>
                  <CopyButton
                    text={fullRegex}
                    variant="ghost"
                    size="icon"
                    class="size-7 text-muted-foreground hover:text-foreground"
                    title={$t('app.common.copy')}
                    data-testid="smart-regex-ai-copy"
                  />
                </div>
                <div class="px-3 py-2.5 font-mono text-sm leading-relaxed overflow-x-auto">
                  {#each tokenizeRegex(choice.pattern) as token, j (j)}
                    <span class={token.class}>{token.text}</span>
                  {/each}
                  {#if choice.flags}
                    <span class="text-muted-foreground">/</span>
                    {#each choice.flags.split('') as flag, j (j)}
                      <span class="text-purple-600 dark:text-purple-400 font-bold">{flag}</span>
                    {/each}
                  {/if}
                </div>
              </div>

              <!-- 2. Summary (deterministic, from AST) -->
              {#if summary}
                <p class="text-xs text-muted-foreground px-1" data-testid="smart-regex-ai-summary">
                  {resolveSummary(summary)}
                </p>
              {/if}

              <!-- 3. Detailed breakdown (collapsible accordion, closed by default) -->
              {#if breakdown.length > 0}
                <Accordion.Root type="single" class="w-full" data-testid="smart-regex-ai-breakdown">
                  <Accordion.Item value="breakdown">
                    <Accordion.Trigger class="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 hover:text-foreground transition-colors">
                      <AiIcon size={12} no_animation />
                      <span>{$t('app.smart.regex.ai.breakdown')}</span>
                      <ChevronDown class="size-3.5 transition-transform duration-200 accordion-chevron" />
                    </Accordion.Trigger>
                    <Accordion.Content class="pb-1">
                      <div class="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                        <ul class="space-y-1">
                          {#each breakdown as part, j (j)}
                            <li class="flex items-start gap-2 text-xs">
                              <span class="text-muted-foreground pt-0.5 shrink-0">•</span>
                              <code class="shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-foreground border border-border min-w-[2rem] text-center">
                                {part.fragment}
                              </code>
                              <span class="text-muted-foreground pt-0.5">{$t(part.meaning_key, part.meaning_params ?? {})}</span>
                            </li>
                          {/each}
                        </ul>
                      </div>
                    </Accordion.Content>
                  </Accordion.Item>
                </Accordion.Root>
              {/if}

              <!-- 3. Question (Yes/No) — only on the latest message -->
              {#if is_latest && !ai.state.is_streaming}
                <div class="flex justify-end gap-2" data-testid="smart-regex-ai-single-confirm">
                  <span class="text-xs text-muted-foreground self-center mr-1">
                    {$t('app.smart.regex.ai.useThis')}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={handleRejectSingle}
                    data-testid="smart-regex-ai-confirm-no"
                  >
                    {$t('app.smart.regex.ai.no')}
                  </Button>
                  <Button
                    size="sm"
                    onclick={() => handleConfirmSingle(message.uuid)}
                    data-testid="smart-regex-ai-confirm-yes"
                  >
                    <Check class="size-3.5" />
                    {$t('app.smart.regex.ai.yes')}
                  </Button>
                </div>
              {/if}
            {/if}

            <!-- Multiple choices (A/B/C) -->
            {#if message.choices.length > 1}
              {@const is_latest = msg_idx === ai.state.messages.length - 1}
              <div class="space-y-3" data-testid="smart-regex-ai-choices">
                <p class="text-xs font-medium text-foreground">
                  {$t('app.smart.regex.ai.chooseOption')}
                </p>
                {#each message.choices as choice, i (i)}
                  {@const fullRegex = regexDisplay(choice)}
                  {@const breakdown = explainRegex(choice.pattern, choice.flags)}
                  <div class="space-y-2">
                    <!-- Preview card -->
                    <button
                      type="button"
                      class="w-full text-left rounded-lg border border-border hover:border-primary/40 hover:bg-accent/50 transition-colors overflow-hidden"
                      onclick={() => handleApplyChoice(i, message.uuid)}
                      data-testid={`smart-regex-ai-choice-${i}`}
                    >
                      <div class="flex items-center justify-between gap-2 px-3 py-2 bg-muted/50 border-b border-border">
                        <div class="flex items-center gap-2">
                          <span class="flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Regex</span>
                        </div>
                        <CopyButton
                          text={fullRegex}
                          variant="ghost"
                          size="icon"
                          class="size-6 text-muted-foreground hover:text-foreground"
                          title={$t('app.common.copy')}
                          data-testid={`smart-regex-ai-copy-${i}`}
                        />
                      </div>
                      <div class="px-3 py-2.5 font-mono text-sm leading-relaxed overflow-x-auto">
                        {#each tokenizeRegex(choice.pattern) as token, j (j)}
                          <span class={token.class}>{token.text}</span>
                        {/each}
                        {#if choice.flags}
                          <span class="text-muted-foreground">/</span>
                          {#each choice.flags.split('') as flag, j (j)}
                            <span class="text-purple-600 dark:text-purple-400 font-bold">{flag}</span>
                          {/each}
                        {/if}
                      </div>
                    </button>
                    {#if choice.description}
                      <p class="text-xs text-muted-foreground px-1">{choice.description}</p>
                    {/if}

                    <!-- Detailed breakdown (collapsible accordion, closed by default) -->
                    {#if breakdown.length > 0}
                      <Accordion.Root type="single" class="w-full" data-testid={`smart-regex-ai-breakdown-${i}`}>
                        <Accordion.Item value={`breakdown-${i}`}>
                          <Accordion.Trigger class="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 hover:text-foreground transition-colors">
                            <AiIcon size={12} no_animation />
                            <span>{$t('app.smart.regex.ai.breakdown')}</span>
                            <ChevronDown class="size-3.5 transition-transform duration-200 accordion-chevron" />
                          </Accordion.Trigger>
                          <Accordion.Content class="pb-1">
                            <div class="rounded-lg border border-border bg-muted/30 p-2.5 space-y-1">
                              <ul class="space-y-1">
                                {#each breakdown as part, j (j)}
                                  <li class="flex items-start gap-2 text-xs">
                                    <span class="text-muted-foreground pt-0.5 shrink-0">•</span>
                                    <code class="shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-foreground border border-border min-w-[2rem] text-center">
                                      {part.fragment}
                                    </code>
                                    <span class="text-muted-foreground pt-0.5">{$t(part.meaning_key, part.meaning_params ?? {})}</span>
                                  </li>
                                {/each}
                              </ul>
                            </div>
                          </Accordion.Content>
                        </Accordion.Item>
                      </Accordion.Root>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {:else if message.role === 'assistant'}
            <!-- Assistant message without choices (fallback text) -->
            <div class="flex gap-2 justify-start">
              <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bot class="size-4 text-primary" />
              </div>
              <div class="max-w-[80%] rounded-lg px-3 py-2 text-xs bg-muted">
                {message.content}
              </div>
            </div>
          {/if}
        {/each}

        <!-- ─── Streaming indicator: Bot + three-dot typing animation + status ─── -->
        {#if ai.state.is_streaming}
          <div class="flex gap-2 justify-start">
            <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot class="size-4 text-primary" />
            </div>
            <div class="bg-muted rounded-lg px-4 py-3 text-xs flex items-center gap-2">
              {#if ai.state.ai_status === 'thinking'}
                <span class="text-xs text-muted-foreground" data-testid="smart-regex-ai-status">
                  {$t('app.smart.regex.ai.thinking')}
                </span>
              {:else}
                <span class="text-xs text-muted-foreground" data-testid="smart-regex-ai-status">
                  {$t('app.smart.regex.ai.generating')}
                </span>
              {/if}
              <div class="ai-typing-dots text-primary" data-testid="smart-regex-ai-typing">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Input area (when ready OR on load error — keep selectors visible so
         the user can switch model; textarea is disabled when not ready) -->
    {#if ai && ai.state.error !== 'webgpu_required' && (ai.state.is_ready || ai.state.error)}
      <!-- Disclaimer -->
      <div class="px-4 pb-1.5">
        <p class="flex items-center justify-center gap-1 text-[11px] text-muted-foreground" data-testid="smart-regex-ai-disclaimer">
          <Info class="size-3 shrink-0" />
          <span>{$t('app.smart.regex.ai.disclaimer')}</span>
        </p>
      </div>

      <!-- Gradient primary border wrapper: textarea (2 lines, white bg, light border) + CTA row -->
      <div class="p-3 pt-0">
        <div
          class="rounded-lg bg-gradient-to-r from-sky-400/60 via-indigo-500/60 to-violet-500/60 p-px"
          data-testid="smart-regex-ai-input-wrapper"
        >
          <div class="rounded-[7px] bg-muted/40 overflow-hidden">
            <!-- Textarea (2 lines, white bg, light border slightly darker than wrapper bg) -->
            <Textarea
              bind:value={inputText}
              onkeydown={handleKeydown}
              placeholder={$t('app.smart.regex.ai.placeholder')}
              disabled={!ai.state.is_ready}
              class="min-h-[2.5rem] max-h-[5.5rem] overflow-y-auto resize-none !text-xs !bg-background !border !border-border/60 rounded-none !bg-none focus-visible:!ring-0 focus-visible:!ring-offset-0 !py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="smart-regex-ai-input"
            />

            <div class="space-y-0.5 px-2 pb-1 pt-1">
              <div class="flex items-center justify-between gap-1">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
                    data-testid="smart-regex-ai-source-trigger"
                  >
                    {#if aiSource === 'local'}
                      <Cpu class="size-3.5" />
                    {:else}
                      <Server class="size-3.5" />
                    {/if}
                    <span>
                      {#if aiSource === 'local'}
                        {$t('app.smart.regex.ai.source.local')}
                      {:else}
                        {$t('app.smart.regex.ai.source.backend')}
                      {/if}
                    </span>
                    <ChevronDown class="size-3" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="start" class="min-w-[10rem]">
                    <DropdownMenu.Item
                      onclick={() => (aiSource = 'local')}
                      class={dropdownMenuItemWithSelectedClass(
                        'flex items-center gap-2 text-xs',
                        aiSource === 'local'
                      )}
                      data-testid="smart-regex-ai-source-local"
                    >
                      <Cpu class="size-3.5" />
                      {$t('app.smart.regex.ai.source.local')}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      disabled
                      class="flex items-center gap-2 text-xs opacity-50 cursor-not-allowed"
                      data-testid="smart-regex-ai-source-backend"
                    >
                      <Server class="size-3.5" />
                      {$t('app.smart.regex.ai.source.backend')}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>

                <div class="flex items-center gap-1.5">
                  <Popover.Root>
                    <Popover.Trigger
                      class="inline-flex items-center justify-center rounded-md p-1 text-foreground/50 hover:bg-accent hover:text-foreground transition-colors"
                      title={$t('app.smart.regex.ai.cache.title')}
                      aria-label={$t('app.smart.regex.ai.cache.title')}
                      data-testid="smart-regex-ai-cache-trigger"
                    >
                      <HardDrive class="size-3.5" />
                    </Popover.Trigger>
                    <Popover.Content align="end" class="w-72 p-0">
                      <ModelCachePanel
                        active_model_id={ai?.state.model_id ?? modelId}
                        model_ranks={Object.fromEntries(availableModels.map((m) => [m.model_id, m.rank]))}
                      />
                    </Popover.Content>
                  </Popover.Root>

                  <Button
                    size="icon"
                    onclick={handleSend}
                    disabled={!inputText.trim() || ai.state.is_streaming || !ai.state.is_ready}
                    class="size-7 rounded-full shadow-md !bg-white !bg-none hover:!bg-white/90 border border-border/40 text-foreground disabled:opacity-40 disabled:shadow-none"
                    data-testid="smart-regex-ai-send"
                  >
                    <Send class="size-3.5" />
                  </Button>
                </div>
              </div>

              <div class="flex items-center justify-between gap-1 pt-0.5">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    class="min-w-0 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
                    data-testid="smart-regex-ai-model-trigger"
                  >
                    <BrainCircuit class="size-3.5 shrink-0" />
                    <span class="truncate font-medium">{modelDisplayName || '—'}</span>
                    {#if currentRank}
                      <span
                        class="size-2 shrink-0 rounded-full ring-1 ring-foreground/20"
                        style="background: {rankColor(currentRank)};"
                        data-testid="smart-regex-ai-power-circle"
                      ></span>
                    {/if}
                    <ChevronDown class="size-3 shrink-0" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="start" class="min-w-[12rem]">
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger class="text-xs" data-testid="smart-regex-ai-sort-trigger">
                        <ArrowDownWideNarrow class="size-3.5" />
                        <span>{$t('app.smart.regex.ai.sort.by')}: {$t(SORT_LABEL_KEYS[modelSortBy])}</span>
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.SubContent>
                        <DropdownMenu.RadioGroup bind:value={modelSortBy}>
                          {#each ['rank', 'alphabetic', 'speed', 'quality', 'power'] as key (key)}
                            <DropdownMenu.RadioItem
                              value={key}
                              class="text-xs"
                              data-testid={`smart-regex-ai-sort-${key}`}
                              onSelect={(e) => {
                                e.preventDefault();
                                modelSortBy = key as ModelSortKey;
                              }}
                            >
                              {$t(SORT_LABEL_KEYS[key as ModelSortKey])}
                            </DropdownMenu.RadioItem>
                          {/each}
                        </DropdownMenu.RadioGroup>
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Sub>
                    <DropdownMenu.Separator />
                    {#each sortedModels as model (model.model_id)}
                      <DropdownMenu.Item
                        onclick={() => handleSwitchModel(model.model_id)}
                        disabled={ai.state.is_loading_model}
                        class={dropdownMenuItemWithSelectedClass(
                          'flex items-center justify-between gap-2 text-xs',
                          ai?.state.model_id === model.model_id
                        )}
                        data-testid={`smart-regex-ai-model-${model.model_id}`}
                      >
                        {@const metric = sortMetricValue(model)}
                        <div class="flex items-center gap-2">
                          <ModelIcon model_id={model.model_id} class="size-4 shrink-0" />
                          <span>{model.name}</span>
                        </div>
                        <div class="flex flex-col gap-0.5">
                          {#if metric !== null}
                            <RankMeter rank={metric} label={$t(SORT_LABEL_KEYS[modelSortBy])} />
                            <RankMeter rank={model.rank} label={$t(SORT_LABEL_KEYS.rank)} score_below />
                          {:else}
                            <RankMeter rank={model.rank} />
                          {/if}
                        </div>
                      </DropdownMenu.Item>
                    {/each}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>

                <Popover.Root>
                  <Popover.Trigger
                    class="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-foreground/50 hover:bg-accent hover:text-foreground transition-colors"
                    title={$t('app.smart.regex.ai.model_details.title')}
                    aria-label={$t('app.smart.regex.ai.model_details.title')}
                    onclick={refreshCurrentModelCache}
                    data-testid="smart-regex-ai-model-details-trigger"
                  >
                    <Microchip class="size-3.5" />
                  </Popover.Trigger>
                  <Popover.Content align="end" class="w-72 p-0">
                    {#if currentModel}
                      <div class="space-y-3 p-3" data-testid="smart-regex-ai-model-details">
                        <div class="flex items-start gap-2 border-b border-border/50 pb-2">
                          <ModelIcon model_id={currentModel.model_id} class="mt-0.5 size-5 shrink-0" />
                          <div class="min-w-0">
                            <p class="truncate text-xs font-semibold">{currentModel.name}</p>
                            <p class="truncate font-mono text-[10px] text-muted-foreground">{currentModel.model_id}</p>
                          </div>
                        </div>
                        <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs">
                          <dt class="text-muted-foreground">{$t('app.smart.regex.ai.model_details.engine')}</dt>
                          <dd class="font-medium">{currentModel.engine_type}</dd>
                          <dt class="text-muted-foreground">{$t('app.smart.regex.ai.model_details.quantization')}</dt>
                          <dd class="font-medium">{currentModel.dtype ?? '—'}</dd>
                          <dt class="text-muted-foreground">{$t('app.smart.regex.ai.model_details.download_size')}</dt>
                          <dd class="font-medium">{formatMegabytes(currentModel.download_size_mb)}</dd>
                          <dt class="text-muted-foreground">{$t('app.smart.regex.ai.model_details.cache_size')}</dt>
                          <dd class="font-medium">{formatBytes(currentModelCacheSize)}</dd>
                          <dt class="text-muted-foreground">{$t('app.smart.regex.ai.model_details.vram_size')}</dt>
                          <dd class="font-medium">{formatMegabytes(currentModel.vram_mb)}</dd>
                        </dl>
                        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                          <span
                            class="flex items-center gap-1"
                            title={$t('system.entities.ai_model.fields.enable_thinking')}
                          >
                            {#if currentModel.enable_thinking}
                              <BrainCircuit class="size-3" />
                              <span>{$t('system.entities.ai_model.thinking.true')}</span>
                            {:else}
                              <Cpu class="size-3" />
                              <span>{$t('system.entities.ai_model.thinking.false')}</span>
                            {/if}
                          </span>
                          <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.temperature')}>
                            <Thermometer class="size-3" />
                            T={currentModel.temperature}
                          </span>
                          <span class="flex items-center gap-1" title={$t('system.entities.ai_model.fields.top_p')}>
                            <Gauge class="size-3" />
                            top_p={currentModel.top_p}
                          </span>
                          <span
                            class="flex items-center gap-1"
                            title={$t('system.entities.ai_model.fields.max_tokens')}
                          >
                            <Brackets class="size-3" />
                            max_tokens={currentModel.max_tokens}
                          </span>
                          <span
                            class="flex items-center gap-1"
                            title={$t('system.entities.ai_model.fields.repetition_penalty')}
                          >
                            <Gavel class="size-3" />
                            rep_penalty={currentModel.repetition_penalty}
                          </span>
                        </div>
                        <div class="flex items-start justify-between gap-1 border-t border-border/50 pt-2" data-testid="smart-regex-ai-model-kpis">
                          <ScoreGauge
                            value={currentModel.power_level}
                            size={42}
                            label={$t('app.smart.regex.ai.model_details.power')}
                          />
                          <ScoreGauge
                            value={currentModelScores.score}
                            size={42}
                            label={$t('app.smart.regex.ai.model_details.test_score')}
                          />
                          <ScoreGauge
                            value={currentModelScores.speed}
                            size={42}
                            label={$t('app.smart.regex.ai.model_details.speed')}
                          />
                          <ScoreGauge
                            value={currentModel.rank}
                            size={42}
                            label={$t('app.smart.regex.ai.model_details.rank')}
                          />
                        </div>
                      </div>
                    {/if}
                  </Popover.Content>
                </Popover.Root>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
    {/if}
  </div>
</div>

<style>
  /* ─── AI Status Animations (CSS-only) ─── */

  /* Three-dot typing indicator (streaming state) */
  .ai-typing-dots {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }
  .ai-typing-dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    animation: ai-dot-bounce 1.4s infinite ease-in-out both;
  }
  .ai-typing-dots span:nth-child(1) { animation-delay: -0.32s; }
  .ai-typing-dots span:nth-child(2) { animation-delay: -0.16s; }
  .ai-typing-dots span:nth-child(3) { animation-delay: 0s; }

  @keyframes ai-dot-bounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  /* Gentle bounce (ready state) */
  @keyframes ai-gentle-bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  .ai-icon-bounce { animation: ai-gentle-bounce 2s infinite ease-in-out; }

  /* Pulse (loading model + WebGPU error states) */
  @keyframes ai-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .ai-icon-pulse { animation: ai-pulse 1.5s infinite ease-in-out; }

  /* Shake (error state) */
  @keyframes ai-shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-3px); }
    75% { transform: translateX(3px); }
  }
  .ai-icon-shake { animation: ai-shake 0.4s ease-in-out 2; }

  /* Accordion chevron rotation */
  :global([data-state="open"] .accordion-chevron) {
    transform: rotate(180deg);
  }
</style>
