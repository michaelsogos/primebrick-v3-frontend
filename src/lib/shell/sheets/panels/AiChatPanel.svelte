<script lang="ts">
  /**
   * AiChatPanel — the AI chat sheet panel.
   *
   * Layout: header (title + close + new conversation), message thread (scrollable),
   * input box (footer). Streams AI responses via createSsePostStream.
   *
   * Uses the `aiChatStore` composable for state management and the
   * `ClientToolRegistry` for client-side tool execution (e.g. navigate).
   */
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { Sheet } from "@primebrick/ui";
  import { Button } from '@primebrick/ui';
  import { Textarea } from '$lib/components/ui/textarea';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { SheetPanelLayout } from '@primebrick/ui';
  import SheetHeaderAction from '$lib/shell/sheets/SheetHeaderAction.svelte';
  import { aiChatStore } from '$lib/shell/ai-chat/use-ai-chat.svelte';
  import { registerBuiltinClientTools } from '$lib/shell/ai-chat/client-tool-registry';
  import { MessageSquare } from '@primebrick/ui/vendor/lucide';
  import { Send } from '@primebrick/ui/vendor/lucide';
  import { Plus } from '@primebrick/ui/vendor/lucide';
  import { X } from '@primebrick/ui/vendor/lucide';
  import { Square } from '@primebrick/ui/vendor/lucide';
  import { Trash2 } from '@primebrick/ui/vendor/lucide';
  import { Bot } from '@primebrick/ui/vendor/lucide';
  import { BotIcon } from '$lib/components/ui/bot-icon';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { AI_BUBBLE_STYLE, chatAvatarChrome } from '$lib/components/ui/smart-ai/chat-avatar-chrome';
  import { ThumbsUp } from '@primebrick/ui/vendor/lucide';
  import { ThumbsDown } from '@primebrick/ui/vendor/lucide';
  import { FileText } from '@primebrick/ui/vendor/lucide';
  import type { AiCitation } from '$lib/shell/ai-chat/use-ai-chat.svelte';

  /** Build the docs site URL for a citation. */
  function citationUrl(c: AiCitation): string {
    // Pack-layout path ("manual/users.mdx") + repo → "/en/backend/guide/manual/users"
    const stripped = c.path.replace(/\.mdx?$/, '');
    return `https://docs.primebrick.dev/en/${c.repo}/guide/${stripped}`;
  }

  function handleFeedback(messageUuid: string, rating: 'up' | 'down') {
    void aiChatStore.submitFeedback(messageUuid, rating);
  }

  let inputText = $state('');
  let scrollContainer: HTMLElement | null = null;

  // User/AI message chrome — shared via chat-avatar-chrome.ts with every
  // assistant panel (avatar identity = sidebar profile menu).
  const chrome = $derived(chatAvatarChrome(userProfileStore.current));
  const aiBubbleStyle = AI_BUBBLE_STYLE;

  onMount(() => {
    registerBuiltinClientTools();
    void aiChatStore.loadConversations();
  });

  // Auto-scroll to bottom when messages or streaming text change.
  $effect(() => {
    // Touch the reactive deps so the effect re-runs.
    void aiChatStore.messages.length;
    void aiChatStore.streamingText;
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
    if (!text || aiChatStore.isStreaming) return;
    inputText = '';
    void aiChatStore.sendMessage(text);
  }

  function handleKeydown(e: KeyboardEvent) {
    // Enter to send, Shift+Enter for newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleNewConversation() {
    aiChatStore.newConversation();
  }

  function handleStop() {
    aiChatStore.stopStream();
  }

  async function handleConfirmToolCall() {
    await aiChatStore.confirmToolCall();
  }

  function handleDismissToolCall() {
    aiChatStore.dismissToolCall();
  }

  async function handleSelectConversation(uuid: string) {
    await aiChatStore.loadConversation(uuid);
  }

  async function handleDeleteConversation(uuid: string, e: MouseEvent) {
    e.stopPropagation();
    await aiChatStore.deleteConversation(uuid);
  }
</script>

<SheetPanelLayout contentClass="flex min-h-0 flex-col overflow-hidden p-0">
  {#snippet icon()}
    <MessageSquare class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('app.aiChat.title')}
  {/snippet}
  {#snippet actions()}
    <SheetHeaderAction title={$t('app.aiChat.newConversation')} onclick={handleNewConversation}>
      <Plus class="size-4" />
    </SheetHeaderAction>
    <Sheet.Close
      class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
      title={$t('app.common.done')}
      onclick={() => closeSheet()}
    >
      <X class="size-4" />
    </Sheet.Close>
  {/snippet}
  {#snippet footer()}
    <!-- Pending tool call confirmation -->
    {#if aiChatStore.pendingToolCall}
      <div class="bg-muted/30 px-4 py-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-muted-foreground">
            {#if aiChatStore.pendingToolCall.server}
              {$t('app.aiChat.toolCallConfirm', { tool: aiChatStore.pendingToolCall.tool })}
            {:else}
              {$t('app.aiChat.navigateConfirm', { route: (aiChatStore.pendingToolCall.args as { route?: string })?.route ?? '?' })}
            {/if}
          </span>
          <div class="flex gap-1">
            <Button size="sm" variant="default" class="h-7 text-xs" onclick={handleConfirmToolCall}>
              {$t('app.aiChat.yes')}
            </Button>
            <Button size="sm" variant="ghost" class="h-7 text-xs" onclick={handleDismissToolCall}>
              {$t('app.aiChat.no')}
            </Button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Error banner -->
    {#if aiChatStore.error}
      <div class={cn('border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive', aiChatStore.pendingToolCall && 'border-t')}>
        {aiChatStore.error}
      </div>
    {/if}

    <!-- Input box -->
    <div class={cn('p-3', (aiChatStore.pendingToolCall || aiChatStore.error) && 'border-t border-border')}>
      <div class="flex items-end gap-2">
        <Textarea
          bind:value={inputText}
          onkeydown={handleKeydown}
          placeholder={$t('app.aiChat.placeholder')}
          class="min-h-[40px] max-h-[120px] resize-none text-sm"
          rows={1}
        />
        {#if aiChatStore.isStreaming}
          <Button variant="destructive" size="icon" class="size-9 shrink-0" onclick={handleStop} title={$t('app.aiChat.stop')}>
            <Square class="size-4" />
          </Button>
        {:else}
          <Button variant="default" size="icon" class="size-9 shrink-0" onclick={handleSend} disabled={!inputText.trim()} title={$t('app.aiChat.send')}>
            <Send class="size-4" />
          </Button>
        {/if}
      </div>
    </div>
  {/snippet}

  <!-- Body: conversations sidebar + message thread -->
  <div class="flex min-h-0 flex-1">
    <!-- Conversations sidebar (narrow) -->
    {#if aiChatStore.hasConversations}
      <div class="hidden w-48 shrink-0 border-r border-sidebar-border bg-sidebar/50 sm:block">
        <div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {$t('app.aiChat.conversations')}
        </div>
        <div class="flex flex-col gap-0.5 px-1">
          {#each aiChatStore.conversations as conv (conv.uuid)}
            <button
              type="button"
              class={cn(
                'group flex items-center justify-between gap-1 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-sidebar-accent',
                aiChatStore.currentConversationUuid === conv.uuid && 'bg-sidebar-accent font-medium'
              )}
              onclick={() => handleSelectConversation(conv.uuid)}
            >
              <span class="truncate">{conv.title}</span>
              <span
                class="hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block"
                role="button"
                tabindex="0"
                onclick={(e) => handleDeleteConversation(conv.uuid, e)}
                onkeydown={(e) => { if (e.key === 'Enter') handleDeleteConversation(conv.uuid, e as unknown as MouseEvent); }}
              >
                <Trash2 class="size-3" />
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Message thread -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Messages -->
      <div bind:this={scrollContainer} class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {#if aiChatStore.messages.length === 0 && !aiChatStore.streamingText}
          <div class="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Bot class="size-10 opacity-40" />
            <p class="max-w-xs text-sm">{$t('app.aiChat.welcome')}</p>
          </div>
        {:else}
          <div class="flex flex-col gap-3">
            {#each aiChatStore.messages as msg (msg.uuid)}
              {#if msg.role !== 'tool'}
              <div class={cn('flex gap-2.5', msg.role === 'user' && 'flex-row-reverse')}>
                {#if msg.role === 'user'}
                  <Avatar class="size-7 shrink-0 rounded-none avatar-hex">
                    {#if chrome.avatarStyle}
                      <AvatarFallback class={chrome.avatarStyle.class} style={chrome.avatarStyle.style}>
                        {chrome.avatarSeed}
                      </AvatarFallback>
                    {:else}
                      <AvatarFallback class={cn('rounded-none text-xs font-semibold', chrome.fallbackClass)}>
                        {chrome.avatarSeed}
                      </AvatarFallback>
                    {/if}
                  </Avatar>
                {:else}
                  <BotIcon size={26} stroke_width={1.8} class="mt-1 shrink-0" />
                {/if}
                <div class="flex min-w-0 max-w-full flex-col gap-1.5">
                  <div
                    class="rounded-lg px-3 py-2 text-sm gradient-ring"
                    class:bg-primary={msg.role === 'user' && !chrome.bubbleStyle}
                    class:text-primary-foreground={msg.role === 'user' && !chrome.bubbleStyle}
                    style={msg.role === 'user' ? chrome.bubbleStyle : aiBubbleStyle}
                  >
                    {msg.content.text}
                  </div>

                  <!-- Citations (assistant messages only) -->
                  {#if msg.role === 'assistant' && msg.citations && msg.citations.length > 0}
                    <div class="flex flex-wrap gap-1">
                      {#each msg.citations as cit, i (cit.path)}
                        <a
                          href={citationUrl(cit)}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                          title={cit.path}
                        >
                          <FileText class="size-3" />
                          <span>{i + 1}. {cit.title}</span>
                        </a>
                      {/each}
                    </div>
                  {/if}

                  <!-- Feedback buttons (assistant messages only, not while streaming) -->
                  {#if msg.role === 'assistant' && !aiChatStore.isStreaming}
                    <div class="flex gap-1">
                      <button
                        type="button"
                        class={cn(
                          'rounded p-1 text-muted-foreground transition-colors hover:text-foreground',
                          msg.feedback === 'up' && 'text-success',
                          msg.feedback === 'down' && 'text-destructive',
                        )}
                        title={$t('app.aiChat.yes')}
                        onclick={() => handleFeedback(msg.uuid, 'up')}
                        disabled={msg.feedback === 'up'}
                      >
                        <ThumbsUp class="size-3.5" />
                      </button>
                      <button
                        type="button"
                        class={cn(
                          'rounded p-1 text-muted-foreground transition-colors hover:text-foreground',
                          msg.feedback === 'down' && 'text-destructive',
                          msg.feedback === 'up' && 'text-success',
                        )}
                        title={$t('app.aiChat.no')}
                        onclick={() => handleFeedback(msg.uuid, 'down')}
                        disabled={msg.feedback === 'down'}
                      >
                        <ThumbsDown class="size-3.5" />
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
              {/if}
            {/each}

            <!-- Streaming message (in progress) -->
            {#if aiChatStore.streamingText}
              <div class="flex gap-2.5">
                <BotIcon size={26} stroke_width={1.8} class="mt-1 shrink-0" />
                <div class="flex min-w-0 max-w-full flex-col gap-1.5">
                  <div class="rounded-lg px-3 py-2 text-sm gradient-ring" style={aiBubbleStyle}>
                    {aiChatStore.streamingText}
                    <span class="ml-0.5 inline-block h-3 w-1 animate-pulse bg-foreground/40 align-middle"></span>
                  </div>
                  <!-- Live citations (collected during streaming) -->
                  {#if aiChatStore.streamingCitations.length > 0}
                    <div class="flex flex-wrap gap-1">
                      {#each aiChatStore.streamingCitations as cit, i (cit.path)}
                        <a
                          href={citationUrl(cit)}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                          title={cit.path}
                        >
                          <FileText class="size-3" />
                          <span>{i + 1}. {cit.title}</span>
                        </a>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            <!-- Loading indicator (streaming but no text yet) -->
            {#if aiChatStore.isStreaming && !aiChatStore.streamingText}
              <div class="flex gap-2.5">
                <BotIcon size={26} stroke_width={1.8} class="mt-1 shrink-0" />
                <div class="rounded-lg px-3 py-2 text-sm text-muted-foreground gradient-ring" style={aiBubbleStyle}>
                  {$t('app.aiChat.loading')}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

    </div>
  </div>
</SheetPanelLayout>
