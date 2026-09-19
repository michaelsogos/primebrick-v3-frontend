<script lang="ts">
  /**
   * RegexAiChatPanel — regex assistant panel.
   *
   * Thin wrapper over the shared AiChatPanel shell (model loading, chat UX,
   * composer, footer selectors). This file keeps only the regex-specific
   * rendering: choice preview cards (tokenized pattern), deterministic
   * explain/summarize bullets, and the Yes/No + A/B/C apply flow.
   */
  import { Button } from '$lib/components/ui/button';
  import { CopyButton } from '$lib/components/ui/copy-button';
  import * as Accordion from '$lib/components/ui/accordion/index.js';
  import { t } from '$lib/i18n';
  import AiChatPanel from '$lib/components/ui/smart-ai/ai-chat-panel.svelte';
  import type { useAiAssistant } from '$lib/components/ui/smart-ai/use-ai-assistant.svelte';
  import { useRegexAi, type RegexChoice } from '$lib/components/ui/smart-regex-input/use-regex-ai.svelte';
  import { explainRegex, summarizeRegex, type RegexSummary } from '$lib/components/ui/smart-regex-input/regex-explainer';
  import type { DeepReadonly } from '$lib/types/deep-readonly';
  import { AiIcon } from '$lib/components/ui/ai-icon';
  import Bot from '@lucide/svelte/icons/bot';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';

  let {
    on_apply_regex,
    config_type,
    current_regex = '',
    current_flags = '',
  }: {
    on_apply_regex: (pattern: string, flags: string) => void;
    config_type: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
    current_regex?: string;
    current_flags?: string;
  } = $props();

  type AiHandle = ReturnType<typeof useAiAssistant<RegexChoice>>;

  function handleApplyChoice(ai: AiHandle, index: number, message_uuid?: string) {
    const choice = ai.applyChoice(index, message_uuid);
    if (choice) {
      on_apply_regex(choice.pattern, choice.flags);
      // Sheet stays open — the assistant supports iterative refinement.
      // Condense the assistant turn to a compact applied-state summary so
      // future prompts stay small (KV prefix invalidated on mutation).
      if (message_uuid) {
        ai.resolveChoice(message_uuid, 'applied', {
          index,
          condensed_content: `Applied regex: /${choice.pattern}/${choice.flags || ''}`,
        });
      }
    }
  }

  function handleConfirmSingle(ai: AiHandle, message_uuid?: string) {
    handleApplyChoice(ai, 0, message_uuid);
  }

  function handleRejectSingle(ai: AiHandle, message_uuid?: string) {
    if (message_uuid) {
      ai.resolveChoice(message_uuid, 'discarded', {
        condensed_content: 'Regex candidate discarded by the user.',
      });
    } else {
      ai.applyChoice(-1);
    }
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

{#snippet choicesSnippet({ ai, message, is_latest }: {
  ai: AiHandle;
  message: {
    uuid: string;
    choices?: RegexChoice[];
    content: string;
    resolution?: 'applied' | 'discarded';
    resolution_index?: number;
  };
  is_latest: boolean;
})}
  <!-- Assistant message bubble (intro line) -->
  <div class="flex gap-2 justify-start">
    <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
      <Bot class="size-4 text-primary" />
    </div>
    <div class="bg-muted rounded-lg px-3 py-2 text-xs">
      {#if message.choices && message.choices.length === 1 && message.choices[0].description}
        {$t('app.smart.regex.ai.hereYouAreWithDesc', { desc: message.choices[0].description })}
      {:else}
        {$t('app.smart.regex.ai.hereYouAre')}
      {/if}
    </div>
  </div>

  <!-- Single choice: preview + summary + breakdown accordion + Yes/No.
       Discarded → the whole offer collapses; applied → preview stays and
       the CTAs become a success label. -->
  {#if message.choices && message.choices.length === 1 && message.resolution !== 'discarded'}
    {@const choice = message.choices[0]}
    {@const fullRegex = regexDisplay(choice)}
    {@const breakdown = explainRegex(choice.pattern, choice.flags)}
    {@const summary = summarizeRegex(choice.pattern, choice.flags)}

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

    <!-- 4. Question (Yes/No) — only on the latest unresolved message;
         after apply the CTAs collapse into a success label. -->
    {#if message.resolution === 'applied'}
      <div class="flex items-center justify-end" data-testid="smart-regex-ai-applied">
        <span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <Check class="size-3.5" />
          {$t('app.smart.regex.ai.applied')}
        </span>
      </div>
    {:else if is_latest && !ai.state.is_streaming && !message.resolution}
      <div class="flex justify-end gap-2" data-testid="smart-regex-ai-single-confirm">
        <span class="text-xs text-muted-foreground self-center mr-1">
          {$t('app.smart.regex.ai.useThis')}
        </span>
        <Button
          size="sm"
          variant="outline"
          onclick={() => handleRejectSingle(ai, message.uuid)}
          data-testid="smart-regex-ai-confirm-no"
        >
          {$t('app.smart.regex.ai.no')}
        </Button>
        <Button
          size="sm"
          onclick={() => handleConfirmSingle(ai, message.uuid)}
          data-testid="smart-regex-ai-confirm-yes"
        >
          <Check class="size-3.5" />
          {$t('app.smart.regex.ai.yes')}
        </Button>
      </div>
    {/if}
  {/if}

  <!-- Applied resolution (multi-choice) — the choice cards collapse into
       a compact success label; discarded renders nothing. -->
  {#if message.resolution === 'applied' && (!message.choices || message.choices.length !== 1)}
    <div class="flex items-center justify-end" data-testid="smart-regex-ai-applied">
      <span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <Check class="size-3.5" />
        {$t('app.smart.regex.ai.applied')}
      </span>
    </div>
  {/if}

  <!-- After apply: an assistant-style bubble inviting the user to continue -->
  {#if message.resolution === 'applied'}
    <div class="flex gap-2 justify-start" data-testid="smart-regex-ai-continue-hint">
      <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Bot class="size-4 text-primary" />
      </div>
      <div class="bg-muted rounded-lg px-3 py-2 text-xs">
        {$t('app.smart.regex.ai.continue_hint')}
      </div>
    </div>
  {/if}

  <!-- Multiple choices (A/B/C) — hidden once the message is resolved -->
  {#if message.choices && message.choices.length > 1 && !message.resolution}
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
            onclick={() => handleApplyChoice(ai, i, message.uuid)}
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
{/snippet}

<AiChatPanel
  assistant_id="smart_regex"
  i18n_ns="app.smart.regex.ai"
  topic_key="app.smart.regex.ai.topic"
  testid_prefix="smart-regex-ai"
  create_composable={(id) => useRegexAi(id, current_regex, current_flags)}
  choices={choicesSnippet}
/>

<style>
  /* Accordion chevron rotation (kept in the wrapper — shared panel has no accordion) */
  :global([data-state="open"] .accordion-chevron) {
    transform: rotate(180deg);
  }
</style>
