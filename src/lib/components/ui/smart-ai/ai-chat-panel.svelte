<script lang="ts" generics="TChoice">
  /**
   * AiChatPanel — shared browser-local AI assistant panel shell.
   *
   * Owns the generic machinery every Smart* assistant needs:
   * - model resolution (ai_assistant_model config + ai_models catalog)
   * - engine lifecycle (lazy load, progress UI, errors, WebGPU check)
   * - message list (user/assistant bubbles, streaming indicator)
   * - composer (textarea, source selector, model selector, cache popover,
   *   model details popover, send CTA)
   *
   * Assistant-specific rendering (choice cards, previews, confirm actions)
   * is injected via the `choices` snippet prop.
   *
   * Props:
   * - `assistant_id` — stable id (sessionStorage keys, future cerebellum)
   * - `i18n_ns` — translation namespace (e.g. 'app.smart.regex.ai')
   * - `topic_key` — header topic key inside i18n_ns (e.g. '.topic')
   * - `testid_prefix` — data-testid prefix (e.g. 'smart-regex-ai')
   * - `create_composable` — factory: (model_id) => assistant composable
   * - `choices` — snippet: renders an assistant message with choices
   */
  import { onMount, type Snippet } from 'svelte';
  import { browser } from '$app/environment';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import { useConfigEntries } from '$lib/composables/useConfigEntries.svelte';
  import { useAiModels } from '$lib/composables/useAiModels.svelte';
  import type { AiModel } from '$lib/api-types';
  import type { ChatMessage } from './ai-assistant.types';
  import type { useAiAssistant } from './use-ai-assistant.svelte';
  import { dropdownMenuItemWithSelectedClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import ModelCachePanel from '$lib/components/ui/smart-regex-input/ModelCachePanel.svelte';
  import { useModelCache } from '$lib/ai/use-model-cache.svelte';
  import AiModelSelector from './ai-model-selector.svelte';
  import AiModelDetailsPopover from './ai-model-details-popover.svelte';
  import AiCerebellumSelector from './ai-cerebellum-selector.svelte';
  import { AiIcon } from '$lib/components/ui/ai-icon';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import Send from '@lucide/svelte/icons/send';
  import X from '@lucide/svelte/icons/x';
  import Bot from '@lucide/svelte/icons/bot';
  import User from '@lucide/svelte/icons/user';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import CircleStop from '@lucide/svelte/icons/circle-stop';
  import Cpu from '@lucide/svelte/icons/cpu';
  import Server from '@lucide/svelte/icons/server';
  import Info from '@lucide/svelte/icons/info';
  import StickyNotePlus from '@lucide/svelte/icons/sticky-note-plus';
  import HardDrive from '@lucide/svelte/icons/hard-drive';

  type AiHandle = ReturnType<typeof useAiAssistant<TChoice>>;

  let {
    assistant_id,
    i18n_ns,
    topic_key,
    testid_prefix,
    create_composable,
    choices,
  }: {
    /** Stable assistant identifier (sessionStorage keys, cerebellum). */
    assistant_id: string;
    /** i18n namespace, e.g. 'app.smart.regex.ai'. */
    i18n_ns: string;
    /** Header topic translation key (full key). */
    topic_key: string;
    /** data-testid prefix, e.g. 'smart-regex-ai'. */
    testid_prefix: string;
    /** Factory creating the assistant composable once the model id resolves. */
    create_composable: (model_id: string) => AiHandle;
    /** Snippet rendering an assistant message that carries structured choices. */
    choices?: Snippet<[{
      ai: AiHandle;
      message: ChatMessage<TChoice>;
      msg_idx: number;
      is_latest: boolean;
    }]>;
  } = $props();

  const config = useConfigEntries();
  const aiModels = useAiModels();

  let ai = $state<AiHandle | null>(null);
  let modelId = $state<string | null>(null);
  let inputText = $state('');
  let scrollContainer = $state<HTMLElement | null>(null);

  // AI source: "local" (default, in-browser) or "backend" (coming soon).
  let aiSource = $state<'local' | 'backend'>('local');

  // All available local models for the model dropdown (from BE entity).
  let availableModels = $state<AiModel[]>([]);

  // Model cache composable for MRU tracking and auto-eviction.
  const modelCache = useModelCache();

  // Resolve the clean display name for the current model.
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
  // lets E2E tests observe the real state machine.
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

  let currentModelCacheSize = $derived(currentModel ? modelCache.state.model_sizes[currentModel.model_id] ?? 0 : 0);

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

      // Check for a pending model switch from sessionStorage.
      let switchModelId: string | null = null;
      try {
        switchModelId = sessionStorage.getItem(`${assistant_id}-switch-model`);
        if (switchModelId) sessionStorage.removeItem(`${assistant_id}-switch-model`);
      } catch { /* sessionStorage unavailable */ }

      modelId = switchModelId ?? configuredId;

      // 2. Load the model catalog from the BE entity.
      await aiModels.ensureLoaded();
      availableModels = aiModels.getEnabledModels();

      // 3. Create the AI composable with the resolved model ID.
      ai = create_composable(modelId);

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
      const ta = document.querySelector(`[data-testid="${testid_prefix}-input"]`) as HTMLTextAreaElement | null;
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
</script>

{#snippet headerTitle()}
  <div class="flex items-center gap-2">
    <AiIcon size={16} />
    <span class="text-primary-gradient font-semibold">{$t('app.common.ai.assistant_prefix')}</span>
    <span>{$t(topic_key)}</span>
  </div>
{/snippet}

{#snippet headerActions()}
  <Button
    variant="ghost"
    size="icon"
    class="size-7"
    title={$t(`${i18n_ns}.newSession`)}
    onclick={() => { void ai?.clearConversation(); }}
    disabled={!ai || ai.state.messages.length === 0}
    data-testid="{testid_prefix}-new-session"
  >
    <StickyNotePlus class="size-4" />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    class="size-7"
    title={$t('app.common.close')}
    onclick={() => closeSheet()}
    data-testid="{testid_prefix}-close"
  >
    <X class="size-4" />
  </Button>
{/snippet}

<div class="flex h-full flex-col" data-testid="{testid_prefix}-panel" data-ai-phase={aiPhase}>
  <SheetHeader title={headerTitle} actions={headerActions} />

  <!-- Body -->
  <div class="flex min-h-0 flex-1 flex-col">
    {#if !ai}
      <!-- Config still loading (or missing) — show spinner -->
      <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
        {#if modelId === null}
          <AlertCircle class="size-8 text-destructive ai-icon-shake" />
          <p class="text-sm text-destructive px-4">
            {$t(`${i18n_ns}.modelNotConfigured`)}
          </p>
        {:else}
          <LoaderCircle class="size-6 animate-spin text-muted-foreground" />
          <p class="text-sm text-muted-foreground">{$t('app.common.ai.initializing')}</p>
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
              {$t(`${i18n_ns}.webgpuRequired`)}
            </p>
          </div>
        {:else if ai.state.is_loading_model}
          <div class="flex flex-col items-center justify-center gap-3 py-8">
            <BrainCircuit class="size-8 text-primary ai-icon-pulse" />
            <p class="text-sm text-muted-foreground" data-testid="{testid_prefix}-loading">
              {#if ai.state.load_phase === 'vram'}
                {$t(`${i18n_ns}.loadingVram`)} ({(ai.state.vram_elapsed_ms / 1000).toFixed(1)}s)
              {:else}
                {$t(`${i18n_ns}.loadingModel`, { progress: ai.state.load_progress })}
              {/if}
            </p>
            {#if ai.state.load_phase === 'vram'}
              <!-- VRAM phase: time-based determinate progress bar -->
              <div class="w-full max-w-xs bg-muted rounded-full h-2 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-150"
                  style="width: {ai.state.vram_progress}%; background-image: linear-gradient(to right, #38bdf8, #6366f1, #8b5cf6);"
                  data-testid="{testid_prefix}-progress-bar"
                ></div>
              </div>
            {:else}
              <!-- Download phase: determinate progress bar -->
              <div class="w-full max-w-xs bg-muted rounded-full h-2 overflow-hidden">
                <div
                  class="h-full rounded-full animate-gradient-pan transition-all duration-300"
                  style="width: {ai.state.load_progress}%; background-image: linear-gradient(to right, #38bdf8, #6366f1, #8b5cf6, #6366f1, #38bdf8);"
                  data-testid="{testid_prefix}-progress-bar"
                ></div>
              </div>
            {/if}
            {#if ai.state.load_phase === 'downloading' && ai.state.total_files > 0}
              <p class="text-xs text-muted-foreground" data-testid="{testid_prefix}-loading-files">
                {ai.state.completed_files}/{ai.state.total_files} files
                {#if ai.state.slowest_file && ai.state.slowest_file.progress < 100}
                  — {ai.state.slowest_file.name.replace(/^onnx\//, '')}
                {/if}
              </p>
              <!-- Per-file progress bars -->
              <div class="w-full max-w-xs space-y-1" data-testid="{testid_prefix}-file-progress">
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
              <p class="text-xs text-muted-foreground" data-testid="{testid_prefix}-loading-model-name">
                {modelDisplayName}
              </p>
            {/if}
            <!-- Cancel download CTA -->
            <Button
              size="sm"
              variant="outline"
              onclick={() => { void ai?.cancelLoad(); }}
              class="mt-1 gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50"
              data-testid="{testid_prefix}-cancel-load"
            >
              <CircleStop class="size-3.5" />
              {$t(`${i18n_ns}.cancelLoad`)}
            </Button>
          </div>
        {:else if ai.state.is_ready}
          <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <AiIcon size={32} class="ai-icon-bounce" />
            <p class="text-sm font-medium text-foreground">
              {$t(`${i18n_ns}.modelReady`)}
            </p>
            <p class="text-xs text-muted-foreground px-4">
              {$t(`${i18n_ns}.welcome`)}
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
            <p class="text-sm text-muted-foreground">{$t('app.common.ai.initializing')}</p>
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
          {:else if message.role === 'assistant' && message.choices && message.choices.length > 0 && choices}
            <!-- Assistant message with structured choices — rendered by the
                 assistant-specific snippet. -->
            {@render choices({
              ai: ai!,
              message: message as ChatMessage<TChoice>,
              msg_idx,
              is_latest: msg_idx === ai.state.messages.length - 1,
            })}
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
                <span class="text-xs text-muted-foreground" data-testid="{testid_prefix}-status">
                  {$t(`${i18n_ns}.thinking`)}
                </span>
              {:else}
                <span class="text-xs text-muted-foreground" data-testid="{testid_prefix}-status">
                  {$t(`${i18n_ns}.generating`)}
                </span>
              {/if}
              <div class="ai-typing-dots text-primary" data-testid="{testid_prefix}-typing">
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
        <p class="flex items-center justify-center gap-1 text-[11px] text-muted-foreground" data-testid="{testid_prefix}-disclaimer">
          <Info class="size-3 shrink-0" />
          <span>{$t(`${i18n_ns}.disclaimer`)}</span>
        </p>
      </div>

      <!-- Gradient primary border wrapper: textarea + CTA row -->
      <div class="p-3 pt-0">
        <div
          class="rounded-lg bg-gradient-to-r from-sky-400/60 via-indigo-500/60 to-violet-500/60 p-px"
          data-testid="{testid_prefix}-input-wrapper"
        >
          <div class="rounded-[7px] bg-muted/40 overflow-hidden">
            <Textarea
              bind:value={inputText}
              onkeydown={handleKeydown}
              placeholder={$t(`${i18n_ns}.placeholder`)}
              disabled={!ai.state.is_ready}
              class="min-h-[2.5rem] max-h-[5.5rem] overflow-y-auto resize-none !text-xs !bg-background !border !border-border/60 rounded-none !bg-none focus-visible:!ring-0 focus-visible:!ring-offset-0 !py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="{testid_prefix}-input"
            />

            <div class="space-y-0.5 px-2 pb-1 pt-1">
              <!-- Row 1: execution source + model selector -->
              <div class="flex items-center gap-1">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
                    data-testid="{testid_prefix}-source-trigger"
                  >
                    {#if aiSource === 'local'}
                      <Cpu class="size-3.5" />
                    {:else}
                      <Server class="size-3.5" />
                    {/if}
                    <span>
                      {#if aiSource === 'local'}
                        {$t(`${i18n_ns}.source.local`)}
                      {:else}
                        {$t(`${i18n_ns}.source.backend`)}
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
                      data-testid="{testid_prefix}-source-local"
                    >
                      <Cpu class="size-3.5" />
                      {$t(`${i18n_ns}.source.local`)}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      disabled
                      class="flex items-center gap-2 text-xs opacity-50 cursor-not-allowed"
                      data-testid="{testid_prefix}-source-backend"
                    >
                      <Server class="size-3.5" />
                      {$t(`${i18n_ns}.source.backend`)}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>

                <AiModelSelector
                  models={availableModels}
                  current_model_id={ai?.state.model_id ?? modelId}
                  loading={ai?.state.is_loading_model ?? false}
                  on_switch={handleSwitchModel}
                  {i18n_ns}
                  {testid_prefix}
                />
              </div>

              <!-- Row 2: cerebellum selector (left) — details, cache, send (right) -->
              <div class="flex items-center justify-between gap-1 pt-0.5">
                {#if ai && ai.tunings.length > 0}
                  <AiCerebellumSelector
                    tunings={ai.tunings}
                    selected_tuning_uuid={ai.state.selected_tuning_uuid}
                    on_select={(uuid) => ai?.setTuning(uuid)}
                    {i18n_ns}
                    {testid_prefix}
                  />
                {:else}
                  <span></span>
                {/if}

                <div class="flex items-center gap-1.5">
                  <AiModelDetailsPopover
                    model={currentModel}
                    cache_size={currentModelCacheSize}
                    effective_params={ai?.effective_params}
                    tuning={ai?.selected_tuning ?? null}
                    on_open={refreshCurrentModelCache}
                    {i18n_ns}
                    {testid_prefix}
                  />

                  <Popover.Root>
                    <Popover.Trigger
                      class="inline-flex items-center justify-center rounded-md p-1 text-foreground/50 hover:bg-accent hover:text-foreground transition-colors"
                      title={$t(`${i18n_ns}.cache.title`)}
                      aria-label={$t(`${i18n_ns}.cache.title`)}
                      data-testid="{testid_prefix}-cache-trigger"
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
                    data-testid="{testid_prefix}-send"
                  >
                    <Send class="size-3.5" />
                  </Button>
                </div>
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
  :global(.ai-icon-bounce) { animation: ai-gentle-bounce 2s infinite ease-in-out; }

  /* Pulse (loading model + WebGPU error states) */
  @keyframes ai-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  :global(.ai-icon-pulse) { animation: ai-pulse 1.5s infinite ease-in-out; }

  /* Shake (error state) */
  @keyframes ai-shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-3px); }
    75% { transform: translateX(3px); }
  }
  :global(.ai-icon-shake) { animation: ai-shake 0.4s ease-in-out 2; }
</style>
