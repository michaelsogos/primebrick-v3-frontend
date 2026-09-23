/**
 * useRegexAi — regex assistant wrapper over the shared useAiAssistant
 * composable (worker lifecycle, streaming, KV cache, sliding window).
 *
 * This file keeps only the regex-specific behavior:
 * - the system prompt (regex generation rules + examples)
 * - modify-vs-new intent detection and "Current regex:" injection
 * - parsing raw model output into RegexChoice candidates
 * - regex helpers (testRegex, generateExamples)
 *
 * Public API is unchanged — callers (regex-ai-chat-panel) keep working.
 */
import { useAiAssistant } from '$lib/components/ui/smart-ai/use-ai-assistant.svelte';
import type { ChatMessage } from '$lib/components/ui/smart-ai/ai-assistant.types';
import {
  buildClassifierUser,
  CLASSIFIER_SYSTEM,
  findPendingChoiceMessage,
  parseClassification,
  type ChatAction,
  type PendingActionSpec,
} from '$lib/components/ui/smart-ai/chat-actions';
import { get } from 'svelte/store';
import { t } from '$lib/i18n';

export type { ChatMessage };

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

const JSON_REMINDER =
  '\n/no_think\n[Respond ONLY with JSON: {"patterns":[{"pattern":"...","flags":""}]}]';

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

/**
 * Detect whether the user wants to MODIFY the existing regex or generate
 * a NEW one. If ambiguous → default to NEW regex (safer).
 */
function detectIntent(text: string): 'modify' | 'new' {
  const lower = text.toLowerCase().trim();

  const newKeywords = [
    'validare', 'validate', 'crea', 'create', 'genera', 'generate',
    'nuovo', 'new', 'email', 'phone', 'telefono', 'partita iva',
    'codice fiscale', 'nuova', 'nuove',
  ];
  for (const kw of newKeywords) {
    if (lower.includes(kw)) return 'new';
  }

  const modifyKeywords = [
    'aggiungi', 'aggiungiamo', 'rimuovi', 'togli', 'modifica',
    'change', 'add', 'remove', 'keep', 'mantieni', 'aggiungere',
    'rimuovere', 'modificare',
  ];
  for (const kw of modifyKeywords) {
    if (lower.includes(kw)) return 'modify';
  }

  return 'new';
}

export function useRegexAi(
  model_id: string,
  initial_regex: string = '',
  initial_flags: string = '',
  opts?: {
    /**
     * Chat-action executor: when the user answers a pending pattern choice
     * in natural language, the model returns a validated action executed
     * here — same semantics as the equivalent card click.
     */
    on_chat_action?: (
      action: ChatAction,
      message: ChatMessage<RegexChoice>,
    ) => void | Promise<void>;
  },
) {
  const ai = useAiAssistant<RegexChoice>(model_id, {
    build_system_prompt: buildSystemPrompt,

    transform_user_content: (text, ctx) => {
      // Find the last regex from previous assistant messages (if any).
      let lastRegex: RegexChoice | null = null;
      for (let i = ctx.messages.length - 1; i >= 0; i--) {
        const m = ctx.messages[i];
        if (m.role === 'assistant' && m.choices && m.choices.length > 0) {
          lastRegex = m.choices[0];
          break;
        }
      }
      if (!lastRegex && initial_regex) {
        lastRegex = { pattern: initial_regex, flags: initial_flags, description: '' };
      }

      let userContentForModel = text + JSON_REMINDER;
      // Only inject "Current regex:" when the user's intent is to MODIFY the
      // existing regex. For new regex requests, do NOT inject.
      const useIntentDetection = ctx.exec_config?.intent_detection ?? true;
      if (lastRegex && useIntentDetection && detectIntent(text) === 'modify') {
        userContentForModel = `Current regex: ${lastRegex.pattern}\n${text}${JSON_REMINDER}`;
      }
      return userContentForModel;
    },

    process_response: (raw) => {
      return {
        content: raw,
        choices: parseRegexChoices(raw),
      };
    },
  }, { assistant_key: 'regex' });

  /**
   * Parse the LLM response for regex patterns.
   * Expects JSON: {"patterns": [{"pattern": "...", "flags": "", "description": "..."}, ...]}
   * Handles markdown code fences, "json" prefix, invalid JSON backslashes,
   * and malformed JSON by falling back to regex field extraction.
   */
  function parseRegexChoices(response: string): RegexChoice[] | null {
    // Step 1: Aggressively strip markdown fences and "json" prefix
    let text = response.trim();
    text = text.replace(/^```(?:json)?\s*\n?/i, '');
    text = text.replace(/^json\s*\n/i, '');
    text = text.replace(/\n?```\s*$/i, '').trim();

    // Step 2: Try JSON.parse with backslash sanitization
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

    // Step 3: Regex field extraction
    const patternRegex = /"pattern"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const flagsRegex = /"flags"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

    const patterns: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = patternRegex.exec(text)) !== null) {
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
    const regexPrefixMatch = text.match(/^Regex:\s*(.+)$/i);
    if (regexPrefixMatch) {
      const candidate = regexPrefixMatch[1].trim();
      if (candidate.length > 0 && candidate.includes('[')) {
        return [{ pattern: candidate, flags: '', description: '' }];
      }
    }

    // Step 5: Fallback — extract a bare regex-like string from free text.
    const bareRegexMatch = text.match(/\^.*\$|\^\^.*\$|\^[^]*\$/);
    if (bareRegexMatch) {
      const candidate = bareRegexMatch[0].trim();
      if (candidate.length > 2 && candidate.includes('[')) {
        return [{ pattern: candidate, flags: '', description: '' }];
      }
    }

    // Step 6: Final fallback — extract backtick-wrapped patterns
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
   * Test a regex pattern against sample values.
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
   */
  async function generateExamples(
    pattern: string,
    flags: string,
  ): Promise<{ positive: string[]; negative: string[] }> {
    try {
      const responseText = await ai.generateOneOff(
        'You generate regex test examples. Respond with valid JSON only.',
        `Generate up to 5 positive examples (values that MATCH) and up to 5 negative examples (values that do NOT match) for the regex pattern "${pattern}" with flags "${flags}". Respond as JSON: {"positive": ["..."], "negative": ["..."]}`,
        { temperature: 0.5 },
      );
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
   * User send — a dedicated classifier turn decides whether the typed text
   * resolves the pending pattern choices (pick/apply/discard) or is a new
   * request. The generation prompt carries no action contract, so a normal
   * answer can never degrade into a false pick.
   */
  async function sendMessage(text: string): Promise<void> {
    if (!ai.state.is_ready || ai.state.is_streaming || !text.trim()) return;
    const pending = findPendingChoiceMessage(
      ai.state.messages as ChatMessage<RegexChoice>[],
    );
    if (pending?.choices?.length && opts?.on_chat_action) {
      const specs: PendingActionSpec[] = pending.choices.map((c, i) => ({
        id: 'pick' as const,
        index: i,
        label: `use /${c.pattern}/${c.flags}${c.description ? ` — ${c.description}` : ''}`,
      }));
      specs.push(
        { id: 'apply', label: 'accept the proposed regex' },
        { id: 'discard', label: 'reject the proposals' },
      );
      const verdict = await ai.generateOneOff(
        CLASSIFIER_SYSTEM,
        buildClassifierUser(pending.display_content ?? pending.content, specs, text),
        { max_new_tokens: 24, temperature: 0 },
      ).catch(() => '');
      const action = parseClassification(verdict, specs);
      if (action) {
        ai.addLocalUserMessage(text);
        ai.addLocalAssistantMessage(get(t)('app.smart.regex.ai.chat_action_ack'));
        await opts.on_chat_action(action, pending);
        return;
      }
    }
    await ai.sendMessage(text);
  }

  return {
    get state() {
      return ai.state;
    },
    get tunings() {
      return ai.tunings;
    },
    get selected_tuning() {
      return ai.selected_tuning;
    },
    get effective_params() {
      return ai.effective_params;
    },
    get download_mbs() {
      return ai.download_mbs;
    },
    get download_mbps() {
      return ai.download_mbps;
    },
    setTuning: ai.setTuning,
    init: ai.init,
    switchModel: ai.switchModel,
    sendMessage,
    applyChoice: ai.applyChoice,
    resolveChoice: ai.resolveChoice,
    addLocalAssistantMessage: ai.addLocalAssistantMessage,
    addLocalUserMessage: ai.addLocalUserMessage,
    generateOneOff: ai.generateOneOff,
    testRegex,
    generateExamples,
    clearConversation: ai.clearConversation,
    interrupt: ai.interrupt,
    cancelLoad: ai.cancelLoad,
    dispose: ai.dispose,
  };
}
