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

/** A single chat message in the AI conversation. */
export interface ChatMessage<TChoice = unknown> {
  uuid: string;
  role: 'user' | 'assistant';
  /** Full content sent to / received from the model (for KV cache prefix matching). */
  content: string;
  /** Original user text for UI display (when content has injected prefixes). */
  display_content?: string;
  /** When present, the assistant is offering 1-N structured choices. */
  choices?: TChoice[];
  /** Documentation sources backing this answer — rendered as link chips. */
  sources?: AiSource[];
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
  /** Content stored as the assistant message (raw text for KV prefix reuse). */
  content: string;
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
}

/** Context passed to transform_user_content — lets the hook read history + model config. */
export interface TransformContext<TChoice = unknown> {
  messages: ChatMessage<TChoice>[];
  /** execution_config of the active model (kv_cache_reuse, sliding_window, intent_detection…). */
  exec_config: Record<string, any> | null;
}

/** Assistant-specific behavior injected into the generic composable. */
export interface AiAssistantHooks<TChoice = unknown> {
  /** Build the system prompt sent as the first model message. */
  build_system_prompt: () => string;
  /**
   * Optional: transform the raw user text into the content sent to the model
   * (inject reminders, context prefixes, current-value modifiers).
   * Default: identity.
   */
  transform_user_content?: (text: string, ctx: TransformContext<TChoice>) => string;
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
