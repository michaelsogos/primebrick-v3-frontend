<script lang="ts">
  /**
   * RegexAiChatPanel — browser-only AI regex assistant panel.
   *
   * Uses WebLLM (Qwen2.5-0.5B-Instruct) to convert natural language descriptions
   * into regex patterns. Runs entirely in-browser via WebGPU — no backend calls.
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
   * - Ready: Sparkles (gentle bounce)
   * - Streaming: Bot + three-dot typing indicator
   * - WebGPU error: Brain (pulse)
   * - Generic error: AlertCircle (shake)
   */
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { CopyButton } from '$lib/components/ui/copy-button';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import { useRegexAi, type RegexChoice } from '$lib/components/ui/smart-regex-input/use-regex-ai.svelte';
  import { explainRegex } from '$lib/components/ui/smart-regex-input/regex-explainer';
  import type { DeepReadonly } from '$lib/types/deep-readonly';
  import Brain from '@lucide/svelte/icons/brain';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Send from '@lucide/svelte/icons/send';
  import X from '@lucide/svelte/icons/x';
  import Bot from '@lucide/svelte/icons/bot';
  import User from '@lucide/svelte/icons/user';
  import Check from '@lucide/svelte/icons/check';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';

  interface $$Props {
    on_apply_regex: (pattern: string, flags: string) => void;
    config_type: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
  }

  let { on_apply_regex, config_type }: $$Props = $props();

  const ai = useRegexAi();
  let inputText = $state('');
  let scrollContainer: HTMLElement | null = null;

  onMount(() => {
    void ai.init();
    return () => {
      void ai.dispose();
    };
  });

  // Auto-scroll to bottom when messages change
  $effect(() => {
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

  function handleSend() {
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

  function handleApplyChoice(index: number) {
    const choice = ai.applyChoice(index);
    if (choice) {
      on_apply_regex(choice.pattern, choice.flags);
      closeSheet();
    }
  }

  function handleConfirmSingle() {
    handleApplyChoice(0);
  }

  function handleRejectSingle() {
    ai.applyChoice(-1); // -1 = just clear without applying
  }

  /**
   * Check if an assistant message is a raw JSON response (should be suppressed).
   * Detects plain JSON, markdown-fenced JSON, and any response containing
   * JSON-like "patterns" or "pattern": fields.
   */
  function isJsonResponse(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) return true;
    if (/^```(?:json)?\s*\n?[\s\S]*\n?```$/.test(trimmed)) return true;
    if (/"patterns"\s*:/.test(trimmed) || /"pattern"\s*:/.test(trimmed)) return true;
    return false;
  }

  /**
   * Build a display string for the regex (pattern + flags).
   */
  function regexDisplay(choice: DeepReadonly<RegexChoice>): string {
    return choice.flags ? `${choice.pattern}/${choice.flags}` : choice.pattern;
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
    <Brain class="size-4" />
    <span>{$t('app.smart.regex.ai.title')}</span>
  </div>
{/snippet}

{#snippet headerActions()}
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

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <!-- Body -->
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- Messages -->
    <div bind:this={scrollContainer} class="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {#if ai.state.messages.length === 0 && !ai.state.is_streaming}
        <!-- ─── Empty states with distinct icons + animations ─── -->
        {#if ai.state.error === 'webgpu_required'}
          <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Brain class="size-8 text-muted-foreground ai-icon-pulse" />
            <p class="text-sm text-muted-foreground px-4">
              {$t('app.smart.regex.ai.webgpuRequired')}
            </p>
          </div>
        {:else if ai.state.is_loading_model}
          <div class="flex flex-col items-center justify-center gap-3 py-8">
            <BrainCircuit class="size-8 text-primary ai-icon-pulse" />
            <p class="text-sm text-muted-foreground" data-testid="smart-regex-ai-loading">
              {$t('app.smart.regex.ai.loadingModel', { progress: ai.state.load_progress })}
            </p>
            <div class="w-full max-w-xs bg-muted rounded-full h-2 overflow-hidden">
              <div
                class="bg-primary h-full transition-all duration-300"
                style="width: {ai.state.load_progress}%"
                data-testid="smart-regex-ai-progress-bar"
              ></div>
            </div>
          </div>
        {:else if ai.state.is_ready}
          <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Sparkles class="size-8 text-primary ai-icon-bounce" />
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
        {#each ai.state.messages as message (message.uuid)}
          <!-- Suppress raw JSON responses from the assistant — show "Here you are!" instead -->
          {#if message.role === 'assistant' && isJsonResponse(message.content)}
            <div class="flex gap-2 justify-start">
              <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bot class="size-4 text-primary" />
              </div>
              <div class="bg-muted rounded-lg px-3 py-2 text-sm">
                {$t('app.smart.regex.ai.hereYouAre')}
              </div>
            </div>
          {:else}
            <div
              class={cn(
                'flex gap-2',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {#if message.role === 'assistant'}
                <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot class="size-4 text-primary" />
                </div>
              {/if}
              <div
                class={cn(
                  'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                {message.content}
              </div>
              {#if message.role === 'user'}
                <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User class="size-4" />
                </div>
              {/if}
            </div>
          {/if}
        {/each}

        <!-- ─── Preview + Bullet list + Question (single choice) ─── -->
        {#if ai.state.pending_choices && ai.state.pending_choices.length === 1}
          {@const choice = ai.state.pending_choices[0]}
          {@const fullRegex = regexDisplay(choice)}
          {@const breakdown = explainRegex(choice.pattern, choice.flags)}

          <!-- 1. Preview card with prettified regex + copy CTA -->
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
              {#each tokenizeRegex(choice.pattern) as token, i (i)}
                <span class={token.class}>{token.text}</span>
              {/each}
              {#if choice.flags}
                <span class="text-muted-foreground">/</span>
                {#each choice.flags.split('') as flag, i (i)}
                  <span class="text-purple-600 dark:text-purple-400 font-bold">{flag}</span>
                {/each}
              {/if}
            </div>
          </div>

          <!-- 2. Deterministic bullet list breakdown -->
          {#if breakdown.length > 0}
            <div class="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5" data-testid="smart-regex-ai-breakdown">
              <div class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                <Brain class="size-3" />
                <span>{$t('app.smart.regex.ai.breakdown')}</span>
              </div>
              <ul class="space-y-1">
                {#each breakdown as part, i (i)}
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
          {/if}

          <!-- 3. Question (Yes/No on the RIGHT) -->
          <div class="flex justify-end gap-2" data-testid="smart-regex-ai-single-confirm">
            <span class="text-sm text-muted-foreground self-center mr-1">
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
              onclick={handleConfirmSingle}
              data-testid="smart-regex-ai-confirm-yes"
            >
              <Check class="size-3.5" />
              {$t('app.smart.regex.ai.yes')}
            </Button>
          </div>
        {/if}

        <!-- ─── Multiple choices (A/B/C) ─── -->
        {#if ai.state.pending_choices && ai.state.pending_choices.length > 1}
          <div class="space-y-3" data-testid="smart-regex-ai-choices">
            <p class="text-sm font-medium text-foreground">
              {$t('app.smart.regex.ai.chooseOption')}
            </p>
            {#each ai.state.pending_choices as choice, i (i)}
              {@const fullRegex = regexDisplay(choice)}
              {@const breakdown = explainRegex(choice.pattern, choice.flags)}
              <div class="space-y-2">
                <!-- Preview card -->
                <button
                  type="button"
                  class="w-full text-left rounded-lg border border-border hover:border-primary/40 hover:bg-accent/50 transition-colors overflow-hidden"
                  onclick={() => handleApplyChoice(i)}
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

                <!-- Deterministic bullet list breakdown -->
                {#if breakdown.length > 0}
                  <div class="rounded-lg border border-border bg-muted/30 p-2.5 space-y-1">
                    <ul class="space-y-1">
                      {#each breakdown as part, i (i)}
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
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <!-- ─── Streaming indicator: Bot + three-dot typing animation ─── -->
        {#if ai.state.is_streaming}
          <div class="flex gap-2 justify-start">
            <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot class="size-4 text-primary" />
            </div>
            <div class="bg-muted rounded-lg px-4 py-3 text-sm flex items-center">
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

    <!-- Input box (only when ready and no WebGPU error) -->
    {#if ai.state.is_ready && ai.state.error !== 'webgpu_required'}
      <div class="border-t border-border p-3">
        <div class="flex gap-2">
          <Textarea
            bind:value={inputText}
            onkeydown={handleKeydown}
            placeholder={$t('app.smart.regex.ai.placeholder')}
            class="min-h-[40px] max-h-[120px] resize-none text-sm"
            data-testid="smart-regex-ai-input"
          />
          <Button
            size="icon"
            onclick={handleSend}
            disabled={!inputText.trim() || ai.state.is_streaming}
            data-testid="smart-regex-ai-send"
          >
            <Send class="size-4" />
          </Button>
        </div>
      </div>
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
</style>
