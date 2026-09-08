/**
 * useRegexAi — composable managing the WebLLM engine lifecycle for the
 * SmartRegexInput AI chat panel.
 *
 * Loads Qwen2.5-0.5B-Instruct (q4f16) entirely in-browser via WebGPU.
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

/** A single chat message in the AI conversation. */
export interface ChatMessage {
  uuid: string;
  role: 'user' | 'assistant';
  content: string;
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

/** WebLLM model ID for Qwen2.5-0.5B-Instruct q4f16. */
const MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

/** System prompt instructing the LLM to generate regex patterns. */
const SYSTEM_PROMPT = `You are a regex generation assistant. The user describes a validation requirement in natural language. You must:

1. Generate 1 to 3 valid JavaScript regex patterns that satisfy the requirement.
2. For each pattern, provide a brief one-line description.
3. Format your response as JSON:
   {"patterns": [{"pattern": "...", "flags": "", "description": "..."}]}
4. Flags must be one of: "", "g", "i", "m", "gi", "gm", "im", "gim".
5. Keep patterns minimal and precise. Prefer anchored patterns (^...$) for full-string validation.
6. Use character classes like [a-zA-Z0-9] for allowed characters.
7. Use quantifiers like + (one or more), * (zero or more), {n,m} for repetition.
8. Do NOT use lookbehind (?<=) or lookahead (?=) unless specifically needed.

Examples:
User: "only letters and numbers"
{"patterns":[{"pattern":"^[a-zA-Z0-9]+$","flags":"","description":"Only alphanumeric characters"}]}

User: "only lowercase letters, 3 to 5 characters"
{"patterns":[{"pattern":"^[a-z]{3,5}$","flags":"","description":"3 to 5 lowercase letters"}]}

User: "email format"
{"patterns":[{"pattern":"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$","flags":"","description":"Email format"}]}

User: "letters, numbers, dots and exclamation marks"
{"patterns":[{"pattern":"^[a-zA-Z0-9.!]+$","flags":"","description":"Only letters, numbers, dots and exclamation marks"}]}

User: "phone number with optional country code"
{"patterns":[{"pattern":"^\\+?[0-9]{10,15}$","flags":"","description":"Phone number with optional + prefix"}]}

Always respond with valid JSON. No markdown, no code fences, just the JSON object.`;

export function useRegexAi() {
  const _state = $state({
    is_loading_model: false,
    load_progress: 0,
    is_ready: false,
    is_streaming: false,
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
      engine = await webllm.CreateMLCEngine(MODEL_ID, {
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
   * Send a user message to the LLM and stream the response.
   * Parses the response for regex patterns and sets pending_choices if found.
   */
  async function sendMessage(text: string): Promise<void> {
    if (!engine || _state.is_streaming || !text.trim()) return;

    const userMessage: ChatMessage = {
      uuid: crypto.randomUUID(),
      role: 'user',
      content: text,
    };
    _state.messages = [..._state.messages, userMessage];
    _state.is_streaming = true;
    _state.streaming_text = '';
    _state.error = null;
    _state.pending_choices = null;

    try {
      const completion = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ..._state.messages.map((m) => ({ role: m.role, content: m.content }) as const),
        ],
        temperature: 0.3,
        max_tokens: 512,
        stream: false,
      });

      const responseText = completion.choices[0]?.message?.content ?? '';

      // Try to parse regex patterns from the response
      const choices = parseRegexChoices(responseText);
      if (choices && choices.length > 0) {
        _state.pending_choices = choices;
      }

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
    const descRegex = /"description"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

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
      const descriptions: string[] = [];
      while ((match = descRegex.exec(text)) !== null) {
        descriptions.push(match[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"'));
      }

      return patterns.slice(0, 3).map((p, i) => ({
        pattern: p,
        flags: flags[i] ?? '',
        description: descriptions[i] ?? '',
      }));
    }

    // Step 4: Final fallback — extract backtick-wrapped patterns
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
  function applyChoice(index: number): RegexChoice | null {
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
  function clearConversation(): void {
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
    clearConversation();
  }

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    init,
    sendMessage,
    applyChoice,
    testRegex,
    generateExamples,
    clearConversation,
    dispose,
  };
}
