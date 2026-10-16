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
import { apiFetch, callMcpTool, listMcpTools, type McpToolDef } from '$lib/api';
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
  /** 'tool' rows are the persisted caller-executed results — history only,
   *  never rendered in the panel. */
  role: 'user' | 'assistant' | 'tool';
  content: {
    text?: string;
    tool_calls?: StoredToolCall[];
    tool_results?: StoredToolResult[];
    tool_call_id?: string;
    tool_name?: string;
    output?: unknown;
  };
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

/** A tool call as persisted in ai_messages.content.tool_calls (AI SDK shape). */
interface StoredToolCall {
  toolCallId?: string;
  tool_call_id?: string;
  toolName?: string;
  tool_name?: string;
  input?: unknown;
  args?: unknown;
}
/** A tool result as persisted in ai_messages.content.tool_results. */
interface StoredToolResult {
  toolCallId?: string;
  tool_call_id?: string;
  toolName?: string;
  tool_name?: string;
  output?: unknown;
  result?: unknown;
}

/** A pending client tool call awaiting user confirmation. */
export interface PendingToolCall {
  /** Echoed back in the tool-result message so the model pairs call↔result. */
  tool_call_id: string;
  tool: string;
  args: unknown;
  /** Server tool (callMcpTool) vs local client tool (invokeClientTool). */
  server: boolean;
}

/** A client-tool call emitted by the stream, waiting to be executed. */
interface LoopToolCall {
  tool_call_id: string;
  tool: string;
  args: unknown;
}

/** LLM transcript message (opaque JSON — the AI SDK ModelMessage shape). */
type LlmMessage = Record<string, unknown>;

/** Hard cap on agentic loop continuations per user turn (same bound the
 *  old server-side loop used: stepCountIs(8)). */
const MAX_LOOP_STEPS = 8;

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

// ─── Agentic loop state (module-private — the FE is the loop driver, B3) ──

/** Cached MCP tool catalog (name → def). */
let serverTools: Map<string, McpToolDef> | null = null;
/** Client-tool calls emitted by the CURRENT stream step. */
let loopCalls: LoopToolCall[] = [];
/** Transcript generated during the loop (assistant tool-call + tool messages). */
let loopMessages: LlmMessage[] = [];
/** Results to persist on the next /chat call (tool_results field). */
let loopResults: { tool_call_id: string; tool_name: string; output: unknown }[] = [];
/** Loop continuation depth for the current user turn. */
let loopDepth = 0;
/** state.messages length at turn start — history rebuilds from THIS prefix
 *  + loopMessages; loop-step messages committed to state.messages would
 *  otherwise be duplicated/reordered by toLlmHistory. */
let turnBaseCount = 0;

async function getServerTools(): Promise<Map<string, McpToolDef>> {
  if (!serverTools) {
    const defs = await listMcpTools();
    serverTools = new Map(defs.map((d) => [d.name, d]));
  }
  return serverTools;
}

/**
 * Rebuild the LLM transcript from persisted messages.
 * user → {role:'user',content:text}
 * assistant → text + tool-call parts, followed by a 'tool' message when the
 *             server executed tools (search_docs results are stored inline)
 * tool → {role:'tool',content:[tool-result]} (caller-executed results)
 */
function toLlmHistory(msgs: AiMessage[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const m of msgs) {
    if (m.role === 'tool') {
      out.push({
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: m.content.tool_call_id,
          toolName: m.content.tool_name,
          output: { type: 'json', value: m.content.output ?? null },
        }],
      });
      continue;
    }
    if (m.role === 'assistant') {
      const parts: LlmMessage[] = [];
      if (m.content.text) parts.push({ type: 'text', text: m.content.text });
      for (const tc of m.content.tool_calls ?? []) {
        parts.push({
          type: 'tool-call',
          toolCallId: tc.toolCallId ?? tc.tool_call_id,
          toolName: tc.toolName ?? tc.tool_name,
          input: tc.input ?? tc.args,
        });
      }
      out.push({ role: 'assistant', content: parts.length > 0 ? parts : (m.content.text ?? '') });
      const trs = m.content.tool_results ?? [];
      if (trs.length > 0) {
        out.push({
          role: 'tool',
          content: trs.map((tr) => ({
            type: 'tool-result',
            toolCallId: tr.toolCallId ?? tr.tool_call_id,
            toolName: tr.toolName ?? tr.tool_name,
            output: tr.output ?? { type: 'json', value: tr.result ?? null },
          })),
        });
      }
      continue;
    }
    out.push({ role: 'user', content: m.content.text ?? '' });
  }
  return out;
}

/** Commit the accumulated streaming text as an assistant message. */
function commitStreamingText(extra?: { tool_calls?: StoredToolCall[] }): void {
  if (!state.streamingText && !extra?.tool_calls?.length) return;
  const assistantMsg: AiMessage = {
    uuid: crypto.randomUUID(),
    conversation_uuid: state.currentConversationUuid ?? '',
    role: 'assistant',
    content: {
      text: state.streamingText || undefined,
      tool_calls: extra?.tool_calls,
    },
    created_at: new Date().toISOString(),
    citations: state.streamingCitations.length > 0 ? state.streamingCitations : undefined,
    feedback: null,
  };
  state.messages = [...state.messages, assistantMsg];
  state.streamingText = '';
  state.streamingCitations = [];
}

/**
 * Open a /chat SSE stream. Shared by sendMessage (new user turn) and the
 * agentic loop continuation (tool_results + loop transcript in history).
 */
function openChatStream(opts: {
  message?: string;
  tool_results?: { tool_call_id: string; tool_name: string; output: unknown }[];
  history: LlmMessage[];
  tools: McpToolDef[];
}): void {
  closeStream = createSsePostStream({
    url: '/api/v1/ai/chat',
    body: {
      message: opts.message,
      conversation_uuid: state.currentConversationUuid,
      history: opts.history,
      tools: opts.tools,
      tool_results: opts.tool_results,
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
          // Server-side tool call (search_docs) — display only.
          break;
        }
        case 'tool-result': {
          // Capture search_docs citations for rendering as clickable chips.
          const data = parseSseData<{ tool: string; result?: { results?: AiCitation[] } }>(msg.data);
          if (data.tool === 'search_docs' && data.result?.results) {
            const existingPaths = new Set(state.streamingCitations.map((c) => c.path));
            const newCitations = data.result.results.filter((c) => !existingPaths.has(c.path));
            state.streamingCitations = [...state.streamingCitations, ...newCitations];
          }
          break;
        }
        case 'client-tool-call': {
          // Caller-executed tool call — collected for the loop driver.
          const data = parseSseData<{ tool_call_id: string; tool: string; args: unknown }>(msg.data);
          loopCalls.push({ tool_call_id: data.tool_call_id, tool: data.tool, args: data.args });
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
      closeStream = null;
      void finishStreamStep();
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
}

/**
 * A stream step ended — commit its output, then either run the agentic
 * loop (execute pending client-tool calls and resubmit) or finish the turn.
 */
async function finishStreamStep(): Promise<void> {
  // The assistant message for THIS step carries its tool calls — both for
  // the UI transcript and for the history rebuild on resubmission.
  commitStreamingText({
    tool_calls: loopCalls.map((c) => ({
      tool_call_id: c.tool_call_id,
      tool_name: c.tool,
      args: c.args,
    })),
  });
  if (loopCalls.length > 0) {
    loopMessages.push({
      role: 'assistant',
      content: loopCalls.map((c) => ({
        type: 'tool-call',
        toolCallId: c.tool_call_id,
        toolName: c.tool,
        input: c.args,
      })),
    });
  }

  await processLoopCalls();
}

/**
 * Drain the pending client-tool calls: read-only server tools auto-execute
 * via /system/mcp/call; write tools and local client tools (navigate) are
 * gated behind user confirmation. Resubmits the loop when a step completes.
 */
async function processLoopCalls(): Promise<void> {
  while (loopCalls.length > 0 && loopDepth < MAX_LOOP_STEPS) {
    const call = loopCalls[0];
    const def = serverTools?.get(call.tool);
    if (def && def.read_only) {
      loopCalls.shift();
      await executeServerCall(call);
      continue;
    }
    // Gated — wait for the user.
    state.pendingToolCall = {
      tool_call_id: call.tool_call_id,
      tool: call.tool,
      args: call.args,
      server: Boolean(def),
    };
    state.isStreaming = false;
    return;
  }

  if (loopCalls.length > 0) {
    // Loop budget exhausted — stop cleanly with what we have.
    loopCalls = [];
  }

  if (loopResults.length > 0) {
    resubmitLoop();
    return;
  }

  // No tool work pending — the turn is complete.
  state.isStreaming = false;
  void aiChatStore.loadConversations();
}

/** Execute a server tool via the BE REST shim and record the result. */
async function executeServerCall(call: LoopToolCall): Promise<void> {
  const res = await callMcpTool(call.tool, (call.args ?? {}) as Record<string, unknown>);
  const output = res.ok ? res.result : { error: res.error ?? 'Tool call failed' };
  loopMessages.push({
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId: call.tool_call_id,
      toolName: call.tool,
      output: { type: 'json', value: output ?? null },
    }],
  });
  loopResults.push({ tool_call_id: call.tool_call_id, tool_name: call.tool, output });
  // Keep the result in state.messages too — future turns rebuild the
  // transcript from it, and a reloaded conversation gets the same rows
  // back from the server (persisted via the tool_results field).
  state.messages = [...state.messages, {
    uuid: crypto.randomUUID(),
    conversation_uuid: state.currentConversationUuid ?? '',
    role: 'tool',
    content: { tool_call_id: call.tool_call_id, tool_name: call.tool, output },
    created_at: new Date().toISOString(),
  }];
}

/** Resubmit the loop: the tool results become the next turn's input. */
function resubmitLoop(): void {
  loopDepth++;
  const tool_results = loopResults;
  loopResults = [];
  loopCalls = [];
  state.isStreaming = true;
  void (async () => {
    const tools = await getServerTools();
    openChatStream({
      history: [...toLlmHistory(state.messages.slice(0, turnBaseCount)), ...loopMessages],
      tools: [...tools.values()],
      tool_results,
    });
  })();
}

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
   * /api/v1/ai/chat. The agentic loop is caller-driven (B3): MCP tool calls
   * come back as client-tool-call events, the FE executes them via
   * /system/mcp/call (read-only auto, write gated) and resubmits.
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

    // New agentic turn — reset loop state and snapshot the base transcript.
    loopCalls = [];
    loopMessages = [];
    loopResults = [];
    loopDepth = 0;
    // Exclude the optimistic user message — the BE inserts it itself.
    turnBaseCount = state.messages.length - 1;

    const tools = await getServerTools();
    openChatStream({
      message: text,
      history: toLlmHistory(state.messages.slice(0, turnBaseCount)),
      tools: [...tools.values()],
    });
  },

  /** Stop the current stream (user clicked Stop or closed the panel). */
  stopStream(): void {
    if (closeStream) {
      closeStream();
      closeStream = null;
    }
    state.isStreaming = false;
    loopCalls = [];
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
   * Confirm a pending tool call — server tools go through
   * /system/mcp/call (write tools, RBAC-enforced by the BE), local client
   * tools (navigate) through the client registry. The result feeds the
   * loop, then the queue keeps draining.
   */
  async confirmToolCall(): Promise<ClientToolResult> {
    if (!state.pendingToolCall) return { ok: false, error: 'No pending tool call' };
    const call: LoopToolCall = {
      tool_call_id: state.pendingToolCall.tool_call_id,
      tool: state.pendingToolCall.tool,
      args: state.pendingToolCall.args,
    };
    const server = state.pendingToolCall.server;
    state.pendingToolCall = null;
    loopCalls.shift();

    if (server) {
      await executeServerCall(call);
      state.isStreaming = true;
      await processLoopCalls();
      return { ok: true };
    }
    // Local client tool (navigate) — its result is already produced and
    // persisted server-side (the tool HAS execute); the FE only performs
    // the UI action, no transcript entry is recorded here.
    const result = await invokeClientTool(call.tool, call.args);
    state.isStreaming = true;
    await processLoopCalls();
    return result;
  },

  /** Dismiss the pending tool call — the model gets a declined result so
   *  the loop can continue or end gracefully. */
  dismissToolCall(): void {
    if (!state.pendingToolCall) return;
    const call: LoopToolCall = {
      tool_call_id: state.pendingToolCall.tool_call_id,
      tool: state.pendingToolCall.tool,
      args: state.pendingToolCall.args,
    };
    const wasServer = state.pendingToolCall.server;
    state.pendingToolCall = null;
    loopCalls.shift();
    // Only server tools need a recorded result — local client tools were
    // already executed + persisted server-side (they have `execute`).
    if (wasServer) {
      const output = { declined: true };
      loopMessages.push({
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: call.tool_call_id,
          toolName: call.tool,
          output: { type: 'json', value: output },
        }],
      });
      loopResults.push({ tool_call_id: call.tool_call_id, tool_name: call.tool, output });
    }
    state.isStreaming = true;
    void processLoopCalls();
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
