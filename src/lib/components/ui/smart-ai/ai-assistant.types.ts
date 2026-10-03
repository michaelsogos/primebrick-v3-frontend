/**
 * Shared types for browser-local AI assistants (Smart* components).
 * Consumed by the generic use-ai-assistant composable and the shared
 * ai-chat-panel — every assistant wrapper imports from here.
 */

/** A documentation source attached to an assistant answer (RAG citation). */
export interface AiSource {
  repo: string;
  path: string;
  title: string;
  similarity: number;
}

/**
 * An actionable step proposed by an assistant answer. Rendered as CTA
 * chips/cards under the message (max 5 per message — enforced at parse).
 *
 * - `navigate` — in-app route, executed via the client-tool registry (goto,
 *   same tab).
 * - `tool` — an MCP tool call executed through POST /api/v1/system/mcp/call.
 *   Mutating tools always go through the confirm dialog (meta-driven form,
 *   entity resolution card, `_blank` edit-page link).
 */
export type AiAction =
  | {
      kind: 'navigate';
      route: string;
      query?: Record<string, string>;
      label: string;
    }
  | {
      kind: 'tool';
      tool: string;
      args: Record<string, unknown>;
      label: string;
      /**
       * Optional app route of the entity's list page (e.g.
       * "/system/settings/users") — used to build the `_blank` edit-page
       * link in the confirm dialog (`{page_route}/{uuid}`). The model fills
       * it ONLY from routes seen in documentation excerpts.
       */
      page_route?: string;
    };

/** A single chat message in the AI conversation. */
export interface ChatMessage<TChoice = unknown> {
  uuid: string;
  role: 'user' | 'assistant';
  /** Content rendered in the conversation (user input or assistant display answer). */
  content: string;
  /** Exact assistant model output when content was parsed/normalized for display. */
  model_content?: string;
  /** Original user text for UI display (when content has injected prefixes). */
  display_content?: string;
  /** When present, the assistant is offering 1-N structured choices. */
  choices?: TChoice[];
  /** Documentation sources backing this answer — rendered as link chips. */
  sources?: AiSource[];
  /** Actionable steps proposed by the answer — rendered as CTA chips. */
  actions?: AiAction[];
  /**
   * Resolution of a choices-bearing message: the user applied or discarded
   * the offered config. The CTAs are replaced by a status label; the sheet
   * stays open so the conversation can continue (iterative refinement).
   */
  resolution?: 'applied' | 'discarded';
  /** Index of the applied choice (multi-choice messages). */
  resolution_index?: number;
}

/** Result of processing a raw model response into displayable content. */
export interface ProcessedResponse<TChoice = unknown> {
  /** Content rendered in the assistant bubble. */
  content: string;
  /** Exact raw model output for history/KV-cache prefix matching when transformed. */
  model_content?: string;
  /**
   * Optional short intro line for the chat bubble — when the raw content is
   * machine output (e.g. a JSON document) that would look odd in the bubble.
   * `content` still carries the raw model response for KV prefix reuse.
   */
  display_content?: string;
  /** Parsed structured choices, if any. */
  choices?: TChoice[] | null;
  /** Documentation sources to attach to the assistant message (citations). */
  sources?: AiSource[];
  /** Actionable steps to attach to the assistant message (CTA chips). */
  actions?: AiAction[];
}

export interface OneOffGenerationOptions {
  max_new_tokens?: number;
  temperature?: number;
  top_p?: number;
  repetition_penalty?: number;
}

export interface LocalAssistantResponse<TChoice = unknown> {
  kind: 'local_response';
  response: ProcessedResponse<TChoice>;
}

export type UserContentTransformResult<TChoice = unknown> =
  | string
  | LocalAssistantResponse<TChoice>;

/** Context passed to transform_user_content — lets the hook read history + model config. */
export interface TransformContext<TChoice = unknown> {
  messages: ChatMessage<TChoice>[];
  /** execution_config of the active model (kv_cache_reuse, sliding_window, intent_detection…). */
  exec_config: Record<string, any> | null;
  /** Serialized one-off generation allowed only during this turn's preflight hook. */
  generate_preflight: (
    system_prompt: string,
    user_prompt: string,
    params?: OneOffGenerationOptions,
  ) => Promise<string>;
}

/** Assistant-specific behavior injected into the generic composable. */
export interface AiAssistantHooks<TChoice = unknown> {
  /** Build the system prompt sent as the first model message. */
  build_system_prompt: () => string;
  /**
   * Optional: transform the raw user text into the content sent to the model
   * (inject reminders, context prefixes, current-value modifiers). May be
   * async — e.g. for retrieval phases; the user bubble + typing indicator
   * are already on screen while it runs. Throwing aborts the turn and
   * surfaces the error banner (no generation happens).
   * Default: identity.
   */
  transform_user_content?: (
    text: string,
    ctx: TransformContext<TChoice>,
  ) => UserContentTransformResult<TChoice> | Promise<UserContentTransformResult<TChoice>>;
  /**
   * Optional: post-process the raw model output. `regenerate(extra_user_content)`
   * sends another generation round with an appended repair user message —
   * use it for validate-and-repair loops (e.g. JSON schema validation).
   * Default: `{ content: raw }`.
   */
  process_response?: (
    raw: string,
    regenerate: (extra_user_content: string) => Promise<string>,
  ) => Promise<ProcessedResponse<TChoice>> | ProcessedResponse<TChoice>;
}
