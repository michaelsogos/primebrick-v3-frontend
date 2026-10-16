/**
 * useRegexAi — composable managing the WebLLM engine lifecycle for the
 * SmartRegexInput AI chat panel.
 *
 * The WebLLM model ID is passed in as a parameter — it is loaded dynamically
 * from the `ai_assistant_model` configuration row (reserved, type
 * `single_select` with `values_source: "ai_models"`). The model runs
 * entirely in-browser via WebGPU.
 * The model is lazy-loaded into VRAM only when the brain CTA is clicked.
 * VRAM is released when the panel closes (engine.unload()).
 *
 * Follows the composable state exposure pattern (mandatory AGENTS.md rule):
 * - Consolidated `_state` object (underscore = internal)
 * - Exposed via `get state(): DeepReadonly<typeof _state>`
 * - Mutations only through exposed mutator functions
 * - `$derived` values exposed via individual getters
 */
import type { DeepReadonly } from '$lib/types/deep-readonly';
import { useAiModels } from '$lib/composables/useAiModels.svelte';

/** A single chat message in the AI conversation. */
export interface ChatMessage {
  uuid: string;
  role: 'user' | 'assistant';
  /** Full content sent to / received from the model (for KV cache prefix matching). */
  content: string;
  /** Original user text for UI display (when content has injected prefixes). */
  display_content?: string;
  /** When present, the assistant is offering 1-3 regex choices. */
  choices?: RegexChoice[];
}

/** A regex option offered by the AI. */
export interface RegexChoice {
  /** The regex pattern (without flags). */
  pattern: string;
  /** Suggested flags (may be empty). */
  flags: string;
  /** Human-readable description of what the regex validates. */
  description: string;
}

/** A single part of a regex breakdown. */
export interface RegexPart {
  /** The regex fragment (e.g. "^", "[a-z]", "{3,5}", "$"). */
  fragment: string;
  /** Translation key for what this fragment matches (e.g. "app.smart.regex.explainer.start"). */
  meaning_key: string;
  /** Optional params for the translation key (e.g. { content: "a-z" }). */
  meaning_params?: Record<string, string | number>;
}

/** Build the system prompt for the LLM. */
function buildSystemPrompt(): string {
  return `/no_think
You are a regex generator. Convert the user's natural language request into JavaScript regex patterns.

RULES:
1. Output ONLY valid JSON: {"patterns":[{"pattern":"...","flags":""}]}
2. Anchor with ^ and $.
3. No markdown, no explanation, just JSON.
4. If the user message starts with "Current regex:", MODIFY that regex. Add new characters INSIDE the existing character class brackets [...]. Keep all existing characters.
5. If the user says "cancel", "annulla", "reset", or "instead", IGNORE the previous regex and generate a fresh one.
6. "punto" means dot (.), "virgola" means comma (,), "punto e virgola" means dot AND comma (. and ,), "puntoevirgola" or ";" means semicolon (;). "lettere" means letters, "numeri" means numbers.
7. Use ONLY ASCII characters (U+0020 to U+007E) in regex patterns. NEVER use Unicode look-alikes: use - (U+002D HYPHEN-MINUS) for "trattino"/"dash"/"minus", NEVER the Unicode minus sign (U+2212) or en-dash (U+2013) or em-dash (U+2014). Use ' (U+0027 APOSTROPHE) for apostrophe, NEVER the Unicode right single quote (U+2019). Use " (U+0022 QUOTATION MARK) for quotes, NEVER the Unicode left/right double quotes (U+201C/U+201D).

Examples:

User: any word
{"patterns":[{"pattern":"^\\w+$","flags":""}]}

User: email address
{"patterns":[{"pattern":"^[\\w.]+@[\\w.]+\\.[a-z]{2,}$","flags":"i"}]}

User: numero di 3-5 cifre
{"patterns":[{"pattern":"^\\d{3,5}$","flags":""}]}

User: lettere e numeri
{"patterns":[{"pattern":"^[a-zA-Z0-9]+$","flags":""}]}

User: Current regex: ^[a-z]+$
aggiungi numeri
{"patterns":[{"pattern":"^[a-z0-9]+$","flags":""}]}

User: Current regex: ^[a-zA-Z0-9.,]+$
aggiungi underscore e trattino
{"patterns":[{"pattern":"^[a-zA-Z0-9.,_-]+$","flags":""}]}`;
}

export function useRegexAi(
  model_id: string,
  initial_regex: string = '',
  initial_flags: string = '',
) {
  const aiModels = useAiModels();

  const _state = $state({
    /** The WebLLM model ID currently loaded (or being loaded). */
    model_id,
    is_loading_model: false,
    load_progress: 0,
    is_ready: false,
    is_streaming: false,
    /** 'thinking' while model reasoning, 'generating' while producing final output. */
    ai_status: 'idle' as 'idle' | 'thinking' | 'generating',
    messages: [] as ChatMessage[],
    streaming_text: '',
    error: null as string | null,
    pending_choices: null as RegexChoice[] | null,
    webgpu_available: false,
  });

  // WebLLM engine (lazy-loaded via dynamic import)
  let engine: Awaited<ReturnType<typeof import('@mlc-ai/web-llm').CreateMLCEngine>> | null = null;

  /**
   * Check if WebGPU is available in the current browser.
   * WebGPU requires Chrome 113+/Edge 113+ or other Chromium-based browsers.
   */
  async function checkWebGpu(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false;
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the AI engine. Called when the brain CTA panel opens.
   * Checks WebGPU availability, then loads the model into VRAM with a progress callback.
   */
  async function init(): Promise<void> {
    if (_state.is_ready || _state.is_loading_model) return;

    _state.webgpu_available = await checkWebGpu();
    if (!_state.webgpu_available) {
      _state.error = 'webgpu_required';
      return;
    }

    _state.is_loading_model = true;
    _state.error = null;

    try {
      const webllm = await import('@mlc-ai/web-llm');
      engine = await webllm.CreateMLCEngine(_state.model_id, {
        initProgressCallback: (report: { progress: number }) => {
          _state.load_progress = Math.round(report.progress * 100);
        },
      });
      _state.is_loading_model = false;
      _state.is_ready = true;
    } catch (err) {
      _state.is_loading_model = false;
      _state.error = err instanceof Error ? err.message : 'Failed to load AI model';
    }
  }

  /**
   * Switch to a different WebLLM model at runtime.
   * Unloads the current engine, resets state, and loads the new model.
   * The conversation is cleared because different models produce different patterns.
   */
  async function switchModel(new_model_id: string): Promise<void> {
    if (new_model_id === _state.model_id && _state.is_ready) return;
    if (!new_model_id) return;

    // Unload current engine
    if (engine) {
      try {
        await engine.unload();
      } catch {
        // Ignore errors during unload
      }
      engine = null;
    }

    // Reset state for the new model
    _state.model_id = new_model_id;
    _state.is_ready = false;
    _state.is_loading_model = false;
    _state.load_progress = 0;
    _state.error = null;
    _state.messages = [];
    _state.pending_choices = null;
    _state.streaming_text = '';
    _state.ai_status = 'idle';

    // Reload with the new model
    await init();
  }

  /**
   * Send a user message to the LLM and stream the response.
   * Parses the response for regex patterns and sets pending_choices if found.
   */
  async function sendMessage(text: string): Promise<void> {
    if (!engine || _state.is_streaming || !text.trim()) return;

    _state.is_streaming = true;
    _state.streaming_text = '';
    _state.error = null;
    _state.pending_choices = null;
    _state.ai_status = 'thinking';

    try {
      const systemPrompt = buildSystemPrompt();
      console.log('[SmartRegex] System prompt:', systemPrompt);

      // Find the last regex from previous assistant messages (if any).
      // This gives the model explicit context for incremental edits like
      // "aggiungiamo punto e virgola" — without it, a 0.6B model can't infer
      // which regex to modify from conversation history alone.
      // Falls back to the initial regex passed from the input field when
      // the panel was opened (handles reopen after confirm/close cycle).
      let lastRegex: RegexChoice | null = null;
      for (let i = _state.messages.length - 1; i >= 0; i--) {
        const m = _state.messages[i];
        if (m.role === 'assistant' && m.choices && m.choices.length > 0) {
          lastRegex = m.choices[0];
          break;
        }
      }
      // If no conversation history but the input already has a regex, use it
      if (!lastRegex && initial_regex) {
        lastRegex = { pattern: initial_regex, flags: initial_flags, description: '' };
      }

      // Build the user content for the model: inject current regex if available.
      // Small models (≤2B) forget the system prompt format after 2-3 turns,
      // so we append a compact JSON reminder with /no_think to every user message.
      // The /no_think directive suppresses untagged reasoning text in Qwen3 models
      // even when enable_thinking=false is ignored by WebLLM.
      const JSON_REMINDER = '\n/no_think\n[Respond ONLY with JSON: {"patterns":[{"pattern":"...","flags":""}]}]';
      let userContentForModel = text + JSON_REMINDER;
      if (lastRegex) {
        userContentForModel = `Current regex: ${lastRegex.pattern}\n${text}${JSON_REMINDER}`;
      }

      // Store the FULL user content sent to the model (including Current regex
      // prefix and JSON_REMINDER) as the message content. This is critical for
      // WebLLM's automatic prefix KV cache reuse: subsequent turns must pass the
      // exact same tokenized prefix. Storing only the bare text would break the
      // prefix match and force a full prompt reprocess every turn.
      // The UI displays display_content (the original user text) instead.
      const userMessage: ChatMessage = {
        uuid: crypto.randomUUID(),
        role: 'user',
        content: userContentForModel,
        display_content: text,
      };
      _state.messages = [..._state.messages, userMessage];

      // Build messages array directly from stored state.
      // All messages (user and assistant) store the exact content sent to /
      // received from the model, so no transformation is needed. This enables
      // WebLLM's automatic prefix KV cache reuse across turns.
      const modelMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];
      for (const m of _state.messages) {
        if (m.role === 'user') {
          modelMessages.push({ role: 'user', content: m.content });
        } else if (m.role === 'assistant') {
          modelMessages.push({ role: 'assistant', content: m.content });
        }
      }
      // Look up the selected model's params from the BE entity via useAiModels.
      // This is the critical fix: Qwen3 (hybrid thinking) gets enable_thinking=true
      // + T=0.6/TopP=0.95, while Qwen2.5 (Instruct, non-thinking) gets
      // enable_thinking=false + T=0.3/TopP=0.8. Previously all models used
      // hardcoded enable_thinking=false with no sampling params.
      const modelParams = aiModels.getModelByModelId(_state.model_id);
      const request = {
        messages: modelMessages,
        stream: true as const,
        enable_thinking: modelParams?.enable_thinking ?? false,
        temperature: modelParams?.temperature ?? 0.7,
        top_p: modelParams?.top_p ?? 0.9,
        max_tokens: modelParams?.max_tokens ?? 256,
        repetition_penalty: modelParams?.repetition_penalty ?? 1.1,
      };
      const stream = (await engine.chat.completions.create(
        request as Parameters<typeof engine.chat.completions.create>[0],
      )) as AsyncIterable<{ choices: Array<{ delta?: { content?: string } }> }>;

      let responseText = '';
      let thinkingText = '';
      let inThinking = false;
      let thinkingEnded = false;

      // Thinking tag patterns: , <thought>, </thought>, <analysis>, </analysis>
      const THINK_OPEN = /<(?:think|thought|analysis)>\s*$/;
      const THINK_CLOSE = /<\/(?:think|thought|analysis)>\s*$/;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (!delta) continue;

        // If we haven't seen any thinking tags yet, check for them
        if (!thinkingEnded) {
          // Accumulate raw text for tag detection
          const rawAccum = responseText + delta;

          // Check if we're entering a thinking block
          if (!inThinking && THINK_OPEN.test(rawAccum)) {
            inThinking = true;
            // Extract any text before the thinking tag
            const beforeThink = rawAccum.replace(/<(?:think|thought|analysis)>.*$/s, '');
            responseText = beforeThink;
            thinkingText = rawAccum.slice(beforeThink.length);
            _state.ai_status = 'thinking';
            continue;
          }

          // If we're inside a thinking block, check for closing tag
          if (inThinking) {
            thinkingText += delta;
            if (THINK_CLOSE.test(thinkingText)) {
              // Extract text after the closing tag
              const afterThink = thinkingText.replace(/^.*<\/(?:think|thought|analysis)>\s*/s, '');
              inThinking = false;
              thinkingEnded = true;
              thinkingText = '';
              if (afterThink) {
                responseText += afterThink;
                _state.streaming_text = responseText;
                _state.ai_status = 'generating';
              }
            }
            continue;
          }

          // No thinking tags detected — treat as normal output
          responseText += delta;
          _state.streaming_text = responseText;
          // Switch to 'generating' as soon as we get real content
          if (_state.ai_status === 'thinking') {
            _state.ai_status = 'generating';
          }
        } else {
          // After thinking ended — normal streaming
          responseText += delta;
          _state.streaming_text = responseText;
        }
      }

      // Fallback: if stream ended while still in thinking (max_tokens reached
      // before model closed the thinking tag), try to extract any JSON from
      // the thinking text as a last resort.
      if (inThinking && thinkingText && !responseText) {
        console.warn('[SmartRegex] Stream ended inside thinking block (max_tokens likely too low). Attempting fallback extraction from thinking text.');
        responseText = thinkingText;
        _state.streaming_text = responseText;
      }

      console.log('[SmartRegex] Raw AI response:', responseText.slice(0, 200));
      if (thinkingText) {
        console.log('[SmartRegex] Thinking (hidden):', thinkingText.slice(0, 200) + '...');
      }

      // Try to parse regex patterns from the response
      const choices = parseRegexChoices(responseText);
      if (choices && choices.length > 0) {
        _state.pending_choices = choices;
      }

      // Store the RAW model response (after thinking block stripping) as the
      // assistant message content. This is critical for WebLLM's automatic
      // prefix KV cache reuse: the next turn must pass the exact same tokenized
      // assistant content as part of the conversation prefix. Storing a
      // simplified "Regex: <pattern>" string would break the prefix match.
      // The UI uses parseRegexChoices() to extract choices for display,
      // and falls back to showing raw content when parsing fails.
      const assistantMessage: ChatMessage = {
        uuid: crypto.randomUUID(),
        role: 'assistant',
        content: responseText,
        choices: choices ?? undefined,
      };
      _state.messages = [..._state.messages, assistantMessage];
    } catch (err) {
      _state.error = err instanceof Error ? err.message : 'Failed to generate response';
    } finally {
      _state.is_streaming = false;
      _state.streaming_text = '';
      _state.ai_status = 'idle';
    }
  }

  /**
   * Parse the LLM response for regex patterns.
   * Expects JSON: {"patterns": [{"pattern": "...", "flags": "", "description": "..."}, ...]}
   * Handles markdown code fences, "json" prefix, invalid JSON backslashes,
   * and malformed JSON by falling back to regex field extraction.
   */
  function parseRegexChoices(response: string): RegexChoice[] | null {
    // Step 1: Aggressively strip markdown fences and "json" prefix
    let text = response.trim();
    // Strip opening fence: ```json\n or ```\n
    text = text.replace(/^```(?:json)?\s*\n?/i, '');
    // Strip "json" prefix without backticks (LLM sometimes outputs this)
    text = text.replace(/^json\s*\n/i, '');
    // Strip closing fence: ``` at the end
    text = text.replace(/\n?```\s*$/i, '').trim();

    // Step 2: Try JSON.parse with backslash sanitization
    // The LLM (especially small models like Qwen 0.5B) often produces technically
    // invalid JSON where regex backslashes like \d are not properly escaped as \\d.
    const sanitized = text.replace(/\\(?!["\\bfnrtu/])/g, '\\\\');
    try {
      const parsed = JSON.parse(sanitized);
      if (parsed && Array.isArray(parsed.patterns)) {
        return parsed.patterns
          .filter((p: any) => p && typeof p.pattern === 'string')
          .slice(0, 3)
          .map((p: any) => ({
            pattern: p.pattern,
            flags: typeof p.flags === 'string' ? p.flags : '',
            description: typeof p.description === 'string' ? p.description : '',
          }));
      }
    } catch {
      // Not valid JSON — try regex field extraction
    }

    // Step 3: Regex field extraction — pull out "pattern": "..." fields directly.
    // This handles invalid JSON (e.g. multi-value flags field, missing brackets).
    const patternRegex = /"pattern"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const flagsRegex = /"flags"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

    const patterns: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = patternRegex.exec(text)) !== null) {
      // Unescape JSON string escapes: \\ → \, \" → "
      patterns.push(match[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"'));
    }

    if (patterns.length > 0) {
      const flags: string[] = [];
      while ((match = flagsRegex.exec(text)) !== null) {
        flags.push(match[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"'));
      }

      return patterns.slice(0, 3).map((p, i) => ({
        pattern: p,
        flags: flags[i] ?? '',
        description: '',
      }));
    }

    // Step 4: Fallback — extract pattern from "Regex: <pattern>" prefix.
      // Small models sometimes output "Regex: ^[a-z]+$" instead of JSON.
      const regexPrefixMatch = text.match(/^Regex:\s*(.+)$/i);
      if (regexPrefixMatch) {
        const candidate = regexPrefixMatch[1].trim();
        if (candidate.length > 0 && candidate.includes('[')) {
          return [{ pattern: candidate, flags: '', description: '' }];
        }
      }

      // Step 5: Fallback — extract a bare regex-like string from free text.
      // Accepts strings that start with ^ or contain [ and end with $.
      const bareRegexMatch = text.match(/\^.*\$|\^\^.*\$|\^[^]*\$/);
      if (bareRegexMatch) {
        const candidate = bareRegexMatch[0].trim();
        if (candidate.length > 2 && candidate.includes('[')) {
          return [{ pattern: candidate, flags: '', description: '' }];
        }
      }

      // Step 6: Final fallback — extract backtick-wrapped patterns
      // Only accept if they look like regex (not JSON with { or "patterns")
      const backtickMatches = response.match(/`([^`]+)`/g);
      if (backtickMatches && backtickMatches.length > 0) {
        const candidates = backtickMatches
          .map((m) => m.replace(/`/g, '').trim())
          .filter((p) => p.length > 0 && !p.startsWith('{') && !p.includes('"patterns"'));
        if (candidates.length > 0) {
          return candidates.slice(0, 3).map((p) => ({
            pattern: p,
            flags: '',
            description: '',
          }));
        }
      }

    return null;
  }

  /**
   * Apply a chosen regex option. Called when the user selects A/B/C or confirms a single regex.
   * Returns the chosen pattern and flags for the parent to apply to the input.
   */
  function applyChoice(index: number, message_uuid?: string): RegexChoice | null {
    // If message_uuid provided, find choices in that specific message
    if (message_uuid) {
      const msg = _state.messages.find((m) => m.uuid === message_uuid);
      if (!msg || !msg.choices || index < 0 || index >= msg.choices.length) return null;
      return msg.choices[index];
    }
    // Fallback: use pending_choices
    if (!_state.pending_choices || index < 0 || index >= _state.pending_choices.length) {
      return null;
    }
    const choice = _state.pending_choices[index];
    _state.pending_choices = null;
    return choice;
  }

  /**
   * Test a regex pattern against sample values.
   * Returns an array of { value, passed } results.
   */
  async function testRegex(
    pattern: string,
    flags: string,
    samples: string[],
  ): Promise<{ value: string; passed: boolean }[]> {
    try {
      const regex = new RegExp(pattern, flags);
      return samples.map((value) => ({ value, passed: regex.test(value) }));
    } catch {
      return samples.map((value) => ({ value, passed: false }));
    }
  }

  /**
   * Generate up to 5 positive and 5 negative examples for a regex pattern.
   * Uses the LLM to generate examples.
   */
  async function generateExamples(
    pattern: string,
    flags: string,
  ): Promise<{ positive: string[]; negative: string[] }> {
    if (!engine) return { positive: [], negative: [] };

    const prompt = `Generate up to 5 positive examples (values that MATCH) and up to 5 negative examples (values that do NOT match) for the regex pattern "${pattern}" with flags "${flags}". Respond as JSON: {"positive": ["..."], "negative": ["..."]}`;

    try {
      const completion = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: 'You generate regex test examples. Respond with valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 256,
        stream: false,
      });

      const responseText = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(responseText);
      return {
        positive: Array.isArray(parsed.positive) ? parsed.positive.slice(0, 5) : [],
        negative: Array.isArray(parsed.negative) ? parsed.negative.slice(0, 5) : [],
      };
    } catch {
      return { positive: [], negative: [] };
    }
  }

  /**
   * Clear the conversation and reset state.
   */
  async function clearConversation(): Promise<void> {
    // Clear WebLLM internal KV cache so the next message starts fresh.
    // Without this, WebLLM's internal conversation state persists even
    // after we clear our FE messages array, causing stale context.
    if (engine) {
      try {
        await engine.resetChat();
      } catch {
        // Ignore — engine may not be loaded
      }
    }
    _state.messages = [];
    _state.pending_choices = null;
    _state.streaming_text = '';
    _state.error = null;
  }

  /**
   * Unload the engine and release VRAM. Called when the panel closes.
   */
  async function dispose(): Promise<void> {
    if (engine) {
      try {
        await engine.unload();
      } catch {
        // Ignore errors during unload
      }
      engine = null;
    }
    _state.is_ready = false;
    _state.is_loading_model = false;
    _state.load_progress = 0;
    await clearConversation();
  }

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    init,
    switchModel,
    sendMessage,
    applyChoice,
    testRegex,
    generateExamples,
    clearConversation,
    dispose,
  };
}
