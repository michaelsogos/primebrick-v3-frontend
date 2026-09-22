/**
 * useJsonSchemaAi — GENERIC JSON-schema assistant over the shared
 * useAiAssistant composable. Fully schema-agnostic: the caller injects
 * the JSON Schema for the system prompt, a validator, a system-prompt
 * builder, the assistant_key (cerebellum namespace) and the i18n_ns.
 *
 * Model candidates are extracted (brace-walking), validated, and repaired
 * once via regenerate() when invalid — only valid JSON ever reaches the
 * caller's apply callback.
 */
import { get } from 'svelte/store';
import { t } from '$lib/i18n';
import { useAiAssistant } from '$lib/components/ui/smart-ai/use-ai-assistant.svelte';
import type { JsonAssistantChoice } from './json-schema.types';

export type { JsonAssistantChoice } from './json-schema.types';

/** Max repair rounds before giving up on a model candidate. */
const MAX_REPAIR_ROUNDS = 1;

/** Validation result for a raw JSON candidate string. */
export interface JsonCandidateValidation {
  valid: boolean;
  errors: string[];
}

export interface JsonSchemaAiOptions {
  /**
   * Current JSON document — seeded into the system prompt. Pass a GETTER so
   * the prompt reflects the live state after the user applies a candidate
   * (a captured snapshot would go stale and silently drop applied rules).
   */
  current_json: string | (() => string);
  /**
   * JSON Schema object (or getter — resolved at SEND time so a lazily
   * pruned schema, e.g. capability-filtered, is honored on every turn).
   */
  schema: object | (() => object);
  /** Validate a raw JSON candidate — return { valid, errors }. */
  validate: (json: string) => JsonCandidateValidation;
  /** Build the system prompt from the (resolved) schema + current JSON. */
  build_system_prompt: (schema: object, current_json: string) => string;
  /** Cerebellum/assistant namespace (e.g. 'json_config'). */
  assistant_key: string;
  /** i18n namespace — the intro bubble uses `${i18n_ns}.candidate_intro`. */
  i18n_ns: string;
  /**
   * Free-text interceptor for the key_picker flow: when the LAST assistant
   * message carries an unresolved `key_picker` choice, user chat input is
   * routed here (as the error message to translate) instead of the model.
   */
  on_key_picker_free_text?: (message: string, path: string, rule: string) => void;
}

/**
 * Extract the first complete JSON object from raw model output.
 * Strips markdown fences, a leading "json" tag, and prose around the object.
 */
export function extractJsonCandidate(raw: string): string | null {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*\n?/i, '');
  text = text.replace(/\n?```\s*$/i, '').trim();

  const start = text.indexOf('{');
  if (start === -1) return null;

  // Walk braces to find the matching close — strings/escapes respected.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Walk a parsed JSON object against a JSON Schema and return every key that
 * the schema does not declare. zod strips unknown keys silently, so without
 * this check a hallucinated rule like `validation.rules.length` would
 * "validate" while being dead at runtime.
 *
 * Semantics: a key is unknown when the parent schema has `properties` and the
 * key is not in it, unless `additionalProperties` is itself a schema object
 * (e.g. z.record → open map, whose values are checked recursively).
 */
export function findUnknownJsonKeys(
  value: unknown,
  schema: object,
  path = '',
): { path: string; allowed: string[] }[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const s = schema as Record<string, unknown>;
  const properties = (s.properties ?? {}) as Record<string, object>;
  const additional = s.additionalProperties;
  const openMap = typeof additional === 'object' && additional !== null;
  const allowed = Object.keys(properties);

  const unknown: { path: string; allowed: string[] }[] = [];
  for (const [key, val] of Object.entries(value)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (key in properties) {
      unknown.push(...findUnknownJsonKeys(val, properties[key], keyPath));
    } else if (openMap) {
      unknown.push(...findUnknownJsonKeys(val, additional as object, keyPath));
    } else if (allowed.length > 0) {
      unknown.push({ path: keyPath, allowed });
    }
  }
  return unknown;
}

export function useJsonSchemaAi(model_id: string, opts: JsonSchemaAiOptions) {
  const resolveSchema = () =>
    typeof opts.schema === 'function' ? opts.schema() : opts.schema;

  // Unknown-key detection: zod strips undeclared keys silently, so a
  // hallucinated rule (e.g. rules.length) would "validate" but be dead
  // at runtime. Unknown keys are reported as validation errors and fed
  // into the same validate-and-repair loop.
  const validateStrict = (json: string): JsonCandidateValidation => {
    const result = opts.validate(json);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return result;
    }
    const unknown = findUnknownJsonKeys(parsed, resolveSchema());
    if (unknown.length === 0) return result;
    const unknownErrors = unknown.map(
      (u) => `Unknown key "${u.path}" (allowed: ${u.allowed.join(', ')})`,
    );
    return { valid: false, errors: [...result.errors, ...unknownErrors] };
  };

  const toChoice = (json: string): JsonAssistantChoice => {
    const { valid, errors } = validateStrict(json);
    let pretty = json;
    try {
      pretty = JSON.stringify(JSON.parse(json), null, 2);
    } catch { /* keep raw */ }
    return { kind: 'config', json: pretty, valid, errors };
  };

  const ai = useAiAssistant<JsonAssistantChoice>(model_id, {
    build_system_prompt: () =>
      opts.build_system_prompt(
        resolveSchema(),
        typeof opts.current_json === 'function' ? opts.current_json() : opts.current_json,
      ),

    process_response: async (raw, regenerate) => {
      const candidate = extractJsonCandidate(raw);
      if (!candidate) {
        // Pure prose answer (e.g. "explain the rules") — no card.
        return { content: raw, choices: null };
      }

      let result = validateStrict(candidate);

      // The bubble shows a short intro line via display_content — `content`
      // keeps the raw model response so KV prefix reuse stays intact.
      const intro = () => get(t)(`${opts.i18n_ns}.candidate_intro`);

      // Validate-and-repair: feed the validation errors back to the model.
      if (!result.valid) {
        for (let round = 0; round < MAX_REPAIR_ROUNDS && !result.valid; round++) {
          const repaired = await regenerate(
            `The JSON you produced is invalid against the schema: ${result.errors.join('; ')}. ` +
            'Respond with the corrected JSON object only.',
          );
          const repairedCandidate = extractJsonCandidate(repaired);
          if (repairedCandidate) {
            result = validateStrict(repairedCandidate);
            if (result.valid) {
              return {
                content: repaired,
                display_content: intro(),
                choices: [toChoice(repairedCandidate)],
              };
            }
          }
        }
      }

      return { content: raw, display_content: intro(), choices: [toChoice(candidate)] };
    },
  }, { assistant_key: opts.assistant_key });

  /**
   * Deterministic candidate proposal: a caller-built JSON (e.g. a local
   * merge for a key-picker result) enters the SAME preview/apply flow as
   * a model candidate — validated strictly, shown as a config card.
   */
  function proposeCandidate(json: string): void {
    ai.addLocalAssistantMessage(
      get(t)(`${opts.i18n_ns}.candidate_intro`),
      [toChoice(json)],
    );
  }

  /**
   * Chat-input interception: if the latest assistant message still holds an
   * unresolved key_picker choice, free text is the error message to
   * translate — routed to on_key_picker_free_text, not to the model. The
   * typed text still lands in the conversation as a local user message.
   */
  async function sendMessage(text: string): Promise<void> {
    const lastAssistant = [...ai.state.messages].reverse().find((m) => m.role === 'assistant');
    const pending =
      lastAssistant && !lastAssistant.resolution
        ? (lastAssistant.choices ?? []).find(
            (c): c is Extract<JsonAssistantChoice, { kind: 'key_picker' }> => c.kind === 'key_picker',
          )
        : undefined;
    if (lastAssistant && pending && opts.on_key_picker_free_text) {
      ai.addLocalUserMessage(text);
      ai.resolveChoice(lastAssistant.uuid, 'applied', {
        condensed_content: get(t)(`${opts.i18n_ns}.key_picker.chat_message`, { key: pending.suggested_key }),
      });
      opts.on_key_picker_free_text(text, pending.path, pending.rule);
      return;
    }
    return ai.sendMessage(text);
  }

  /**
   * Programmatic send — bypasses the key_picker free-text interception.
   * Choice cards (topic leaf prompts, value CTAs, key-select) generate
   * system prompts that must ALWAYS reach the model; only text typed into
   * the chat input goes through the interception in `sendMessage`.
   * Without this split, a leaf click right after an unresolved key-picker
   * would be hijacked into the new-error-message flow.
   */
  const sendModelMessage = (text: string) => ai.sendMessage(text);

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
    setTuning: ai.setTuning,
    init: ai.init,
    switchModel: ai.switchModel,
    sendMessage,
    sendModelMessage,
    applyChoice: ai.applyChoice,
    resolveChoice: ai.resolveChoice,
    addLocalAssistantMessage: ai.addLocalAssistantMessage,
    addLocalUserMessage: ai.addLocalUserMessage,
    proposeCandidate,
    generateOneOff: ai.generateOneOff,
    clearConversation: ai.clearConversation,
    interrupt: ai.interrupt,
    cancelLoad: ai.cancelLoad,
    dispose: ai.dispose,
  };
}
