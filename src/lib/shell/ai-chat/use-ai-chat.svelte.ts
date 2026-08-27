/**
 * useAiChat — Svelte 5 runes composable for the AI chat state.
 *
 * Manages:
 *   - conversations list (loaded from GET /api/v1/ai/conversations)
 *   - current conversation + its messages
 *   - streaming state (isStreaming, abort controller)
 *   - pending client tool call (when the AI requests a navigation, etc.)
 *
 * Uses `apiFetch` for REST calls (cookie auth + token refresh) and
 * `createSsePostStream` for the streaming chat endpoint (one-shot POST SSE).
 *
 * Pattern follows `userProfileStore` / `shellNav`: a single `$state` object
 * mutated in place, with a readonly store wrapper exposing getters.
 */
import { apiFetch } from '$lib/api';
import { createSsePostStream, parseSseData } from '$lib/sse/create-sse-connection';
import { invokeClientTool, type ClientToolResult } from './client-tool-registry';

// ─── Types ────────────────────────────────────────────────────────────────

export interface AiConversation {
  uuid: string;
  title: string;
  user_uuid: string;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  uuid: string;
  conversation_uuid: string;
  role: 'user' | 'assistant';
  content: { text?: string; tool_calls?: unknown[] };
  created_at: string;
  /** Citations from search_docs tool calls (assistant messages only). */
  citations?: AiCitation[];
  /** User feedback for this message (assistant messages only). */
  feedback?: 'up' | 'down' | null;
}

/** A documentation citation from a search_docs tool result. */
export interface AiCitation {
  repo: string;
  path: string;
  title: string;
  similarity: number;
}

/** A pending client tool call awaiting user confirmation. */
export interface PendingToolCall {
  tool: string;
  args: unknown;
}

// ─── State ────────────────────────────────────────────────────────────────

interface AiChatState {
  conversations: AiConversation[];
  currentConversationUuid: string | null;
  messages: AiMessage[];
  isStreaming: boolean;
  /** Streaming text accumulator — the in-progress assistant message. */
  streamingText: string;
  /** Citations collected during the current stream (committed on finish). */
  streamingCitations: AiCitation[];
  /** Pending client tool call (e.g. navigate) awaiting user confirmation. */
  pendingToolCall: PendingToolCall | null;
  /** Error message (null when no error). */
  error: string | null;
}

const state = $state<AiChatState>({
  conversations: [],
  currentConversationUuid: null,
  messages: [],
  isStreaming: false,
  streamingText: '',
  streamingCitations: [],
  pendingToolCall: null,
  error: null,
});

/** Close function for the current SSE stream (null when not streaming). */
let closeStream: (() => void) | null = null;

// ─── Store ────────────────────────────────────────────────────────────────

export const aiChatStore = {
  get conversations() { return state.conversations; },
  get currentConversationUuid() { return state.currentConversationUuid; },
  get messages() { return state.messages; },
  get isStreaming() { return state.isStreaming; },
  get streamingText() { return state.streamingText; },
  get streamingCitations() { return state.streamingCitations; },
  get pendingToolCall() { return state.pendingToolCall; },
  get error() { return state.error; },
  get hasConversations() { return state.conversations.length > 0; },

  /** Load the user's conversation list from the BE. */
  async loadConversations(): Promise<void> {
    try {
      const res = await apiFetch('/api/v1/ai/conversations');
      if (!res.ok) return;
      const data = await res.json() as { conversations: AiConversation[] };
      state.conversations = data.conversations ?? [];
    } catch (err) {
      console.error('[ai-chat] Failed to load conversations:', err);
    }
  },

  /** Load a conversation and its messages. */
  async loadConversation(uuid: string): Promise<void> {
    try {
      const res = await apiFetch(`/api/v1/ai/conversations/${uuid}`);
      if (!res.ok) return;
      const data = await res.json() as { conversation: AiConversation; messages: AiMessage[] };
      state.currentConversationUuid = uuid;
      state.messages = data.messages ?? [];
      state.error = null;
    } catch (err) {
      console.error('[ai-chat] Failed to load conversation:', err);
      state.error = 'Failed to load conversation.';
    }
  },

  /** Start a new conversation (clears current state). */
  newConversation(): void {
    this.stopStream();
    state.currentConversationUuid = null;
    state.messages = [];
    state.streamingText = '';
    state.pendingToolCall = null;
    state.error = null;
  },

  /**
   * Send a message and stream the AI response.
   * Appends the user message immediately, then opens a POST SSE stream to
   * /api/v1/ai/chat. The assistant response is accumulated in `streamingText`
   * and committed to `messages` on `finish`.
   */
  async sendMessage(text: string): Promise<void> {
    if (!text.trim() || state.isStreaming) return;

    // Append the user message immediately (optimistic)
    const userMsg: AiMessage = {
      uuid: crypto.randomUUID(),
      conversation_uuid: state.currentConversationUuid ?? '',
      role: 'user',
      content: { text },
      created_at: new Date().toISOString(),
    };
    state.messages = [...state.messages, userMsg];
    state.streamingText = '';
    state.streamingCitations = [];
    state.isStreaming = true;
    state.error = null;
    state.pendingToolCall = null;

    // Build the history for the LLM (exclude the optimistic user message —
    // the BE inserts it itself and includes it in the LLM context).
    const history = state.messages
      .filter((m) => m.uuid !== userMsg.uuid)
      .map((m) => ({
        role: m.role,
        content: m.content.text ?? '',
      }));

    closeStream = createSsePostStream({
      url: '/api/v1/ai/chat',
      body: {
        message: text,
        conversation_uuid: state.currentConversationUuid,
        history,
      },
      onOpen: (res) => {
        // The BE returns the conversation UUID in the X-Conversation-UUID header.
        const convUuid = res.headers.get('X-Conversation-UUID');
        if (convUuid && !state.currentConversationUuid) {
          state.currentConversationUuid = convUuid;
        }
      },
      onMessage: (msg) => {
        switch (msg.event) {
          case 'text-delta': {
            const data = parseSseData<{ text: string }>(msg.data);
            state.streamingText += data.text;
            break;
          }
          case 'tool-call': {
            // Server-side tool call (MCP) — no FE action needed, just display.
            const data = parseSseData<{ tool: string; args: unknown }>(msg.data);
            // Could show a "calling tool X" indicator here.
            break;
          }
          case 'tool-result': {
            // Capture search_docs citations for rendering as clickable chips.
            const data = parseSseData<{ tool: string; result?: { results?: AiCitation[] } }>(msg.data);
            if (data.tool === 'search_docs' && data.result?.results) {
              // Append new citations (dedup by path to avoid repeats across steps).
              const existingPaths = new Set(state.streamingCitations.map((c) => c.path));
              const newCitations = data.result.results.filter((c) => !existingPaths.has(c.path));
              state.streamingCitations = [...state.streamingCitations, ...newCitations];
            }
            break;
          }
          case 'client-tool-call': {
            // Client-side tool call (e.g. navigate) — requires FE execution.
            const data = parseSseData<{ tool: string; args: unknown }>(msg.data);
            state.pendingToolCall = { tool: data.tool, args: data.args };
            break;
          }
          case 'error': {
            const data = parseSseData<{ message: string }>(msg.data);
            state.error = data.message;
            state.isStreaming = false;
            closeStream = null;
            break;
          }
        }
      },
      onClose: () => {
        // Stream ended — commit the streaming text as a message if any.
        if (state.streamingText) {
          const assistantMsg: AiMessage = {
            uuid: crypto.randomUUID(),
            conversation_uuid: state.currentConversationUuid ?? '',
            role: 'assistant',
            content: { text: state.streamingText },
            created_at: new Date().toISOString(),
            citations: state.streamingCitations.length > 0 ? state.streamingCitations : undefined,
            feedback: null,
          };
          state.messages = [...state.messages, assistantMsg];
          state.streamingText = '';
          state.streamingCitations = [];
        }
        state.isStreaming = false;
        closeStream = null;
        // Refresh the conversation list (the new conversation was created server-side).
        void this.loadConversations();
      },
      onError: (err) => {
        console.error('[ai-chat] Stream error:', err);
        state.error = 'Something went wrong. Please try again.';
        state.isStreaming = false;
        closeStream = null;
      },
      onHttpError: (status, body) => {
        if (status === 429) {
          state.error = 'Too many requests. Please wait a moment.';
        } else {
          const detail = (body as { detail?: string })?.detail ?? `HTTP ${status}`;
          state.error = detail;
        }
        state.isStreaming = false;
        closeStream = null;
      },
    });
  },

  /** Stop the current stream (user clicked Stop or closed the panel). */
  stopStream(): void {
    if (closeStream) {
      closeStream();
      closeStream = null;
    }
    state.isStreaming = false;
    // Commit any partial streaming text.
    if (state.streamingText) {
      const assistantMsg: AiMessage = {
        uuid: crypto.randomUUID(),
        conversation_uuid: state.currentConversationUuid ?? '',
        role: 'assistant',
        content: { text: state.streamingText + ' […stopped]' },
        created_at: new Date().toISOString(),
      };
      state.messages = [...state.messages, assistantMsg];
      state.streamingText = '';
    }
  },

  /**
   * Confirm a pending client tool call — execute it and clear the pending state.
   */
  async confirmToolCall(): Promise<ClientToolResult> {
    if (!state.pendingToolCall) return { ok: false, error: 'No pending tool call' };
    const { tool, args } = state.pendingToolCall;
    const result = await invokeClientTool(tool, args);
    state.pendingToolCall = null;
    return result;
  },

  /** Dismiss the pending client tool call (user clicked No). */
  dismissToolCall(): void {
    state.pendingToolCall = null;
  },

  /** Delete a conversation. */
  async deleteConversation(uuid: string): Promise<void> {
    try {
      const res = await apiFetch(`/api/v1/ai/conversations/${uuid}`, { method: 'DELETE' });
      if (!res.ok) return;
      state.conversations = state.conversations.filter((c) => c.uuid !== uuid);
      if (state.currentConversationUuid === uuid) {
        this.newConversation();
      }
    } catch (err) {
      console.error('[ai-chat] Failed to delete conversation:', err);
    }
  },

  /**
   * Submit feedback (thumbs up/down) for an assistant message.
   * Updates the message's `feedback` field optimistically and POSTs to the BE.
   */
  async submitFeedback(messageUuid: string, rating: 'up' | 'down'): Promise<void> {
    // Optimistic update.
    state.messages = state.messages.map((m) =>
      m.uuid === messageUuid ? { ...m, feedback: rating } : m,
    );
    try {
      await apiFetch('/api/v1/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_uuid: messageUuid,
          conversation_uuid: state.currentConversationUuid,
          rating,
        }),
      });
    } catch (err) {
      console.error('[ai-chat] Failed to submit feedback:', err);
      // Revert optimistic update on error.
      state.messages = state.messages.map((m) =>
        m.uuid === messageUuid ? { ...m, feedback: null } : m,
      );
    }
  },
};
