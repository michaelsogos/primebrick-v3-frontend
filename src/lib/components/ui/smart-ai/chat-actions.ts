/**
 * chat-actions — model-driven resolution of pending assistant choices.
 *
 * When the last assistant message carries unresolved choices, the user can
 * answer in natural language instead of clicking. Routing is decided by a
 * DEDICATED classification turn (generateOneOff, temperature 0) that runs
 * BEFORE the real generation: the model interprets the user's intent in
 * isolation, with the pending question and options as explicit context —
 * it never mixes "is this a selection?" with "generate the answer".
 *
 * Classifier output contract (validated strictly against the spec):
 *
 *   {"select":<1-based>} | {"apply":true} | {"discard":true} | {"new":true}
 *   {"apply":true,"langs":[...]} — language subset (translations_preview)
 *   {"revise":"<text>"} — corrected content extracted from the message
 *   (the payload ONLY: "no wait, I meant X" → {"revise":"X"})
 *
 * Fail-safe: an unparseable or {"new":true} verdict means "normal request" —
 * the message goes to regular generation with NO action contract in it.
 */
import type { ChatMessage } from './ai-assistant.types';

/** A validated action returned by the classifier. `index` is 0-based. */
export interface ChatAction {
  action: 'apply' | 'discard' | 'pick' | 'revise';
  /** 0-based index into the pending message's choices (pick only). */
  index?: number;
  /** Language subset for translations_preview applies. */
  langs?: string[];
  /** Extracted replacement content (revise only) — preamble stripped. */
  text?: string;
}

/** One executable option offered to the classifier. */
export interface PendingActionSpec {
  id: 'apply' | 'discard' | 'pick' | 'revise';
  /** 0-based choice index (pick only). */
  index?: number;
  /** Model-facing label describing what the action does. */
  label: string;
  /** Languages the apply may narrow to (translations_preview). */
  langs?: string[];
}

/**
 * The pending target: the LAST assistant message that still carries
 * unresolved choices — exactly what the user is answering to.
 */
export function findPendingChoiceMessage<TChoice>(
  messages: readonly ChatMessage<TChoice>[],
): ChatMessage<TChoice> | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant') {
      return !m.resolution && m.choices && m.choices.length > 0 ? m : undefined;
    }
  }
  return undefined;
}

/** System prompt for the intent classifier turn. */
export const CLASSIFIER_SYSTEM =
  'You are an intent classifier for a chat assistant. Decide whether the ' +
  "user's message answers the assistant's pending question or starts a new " +
  'request. Output exactly one JSON object and nothing else.';

/**
 * Build the user prompt for the classification turn.
 * `question` = the pending assistant message's own text — the semantic
 * context that lets the model tell a selection ("yes, that one", "2") from
 * a new request merely on the same topic.
 */
export function buildClassifierUser(
  question: string | undefined,
  specs: PendingActionSpec[],
  userText: string,
): string {
  const numbered = specs.filter((s) => s.id === 'pick');
  const lines = specs.map((s) =>
    s.id === 'pick' ? `  ${(s.index ?? 0) + 1}) ${s.label}` : `  ${s.id} — ${s.label}`,
  );
  const langsSpec = specs.find((s) => s.id === 'apply' && s.langs?.length);
  const langsHint = langsSpec
    ? `\nIf applying only some languages, output {"apply":true,"langs":[...]} with values from ${JSON.stringify(langsSpec.langs)}.`
    : '';
  const q = question?.trim().replace(/\s+/g, ' ').slice(0, 240);
  return [
    `Pending question: "${q ?? 'which option to pick'}"`,
    'Options:',
    ...lines,
    `User message: "${userText.replace(/\s+/g, ' ').slice(0, 400)}"`,
    '',
    numbered.length
      ? 'If the message selects an option by number, name, or explicit confirmation ("yes", "ok", "that one"), output {"select":<n>}. ' +
        'A selection is a direct answer to the pending question. If the message asks for an action or change ' +
        '(imperative like "add", "make", "set", "remove"), it is NOT a selection — even if it mentions ' +
        'or relates to an option.'
      : '',
    'If it confirms applying, output {"apply":true}; rejecting, {"discard":true}.' +
      langsHint,
    specs.some((s) => s.id === 'revise')
      ? 'If the message corrects or replaces the pending content, output ' +
        '{"revise":"<the corrected content>"} — extract ONLY the new ' +
        'content, dropping apology/preamble words. Example: user says ' +
        '"no sorry, I meant the field value is invalid" → ' +
        '{"revise":"the field value is invalid"}. ' +
        'A correction is STILL about the pending content: it is NOT a new request.'
      : '',
    'If it is a new request, a question, or new instructions — even on a related',
    'topic — output {"new":true}. When in doubt, output {"new":true}.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Parse and validate the classifier verdict. Returns null unless the raw
 * output IS a single JSON object matching the contract AND referencing an
 * enumerated spec — anything else is treated as "new request".
 */
export function parseClassification(
  raw: string,
  specs: PendingActionSpec[],
): ChatAction | null {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*\n?/i, '');
  text = text.replace(/\n?```\s*$/i, '').trim();

  // Small models often wrap the verdict in prose — extract the first
  // balanced {...} object instead of requiring the whole output to be JSON.
  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end < 0) return null;
    text = text.slice(start, end + 1);
  } else if (!text.endsWith('}')) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.select === 'number') {
    const spec = specs.find((s) => s.id === 'pick' && (s.index ?? -1) + 1 === obj.select);
    return spec ? { action: 'pick', index: spec.index } : null;
  }
  if (obj.apply === true && specs.some((s) => s.id === 'apply')) {
    if (Array.isArray(obj.langs)) {
      const allowed = specs.find((s) => s.id === 'apply')?.langs;
      const langs = obj.langs.filter(
        (l): l is string => typeof l === 'string' && (!allowed || allowed.includes(l)),
      );
      return langs.length ? { action: 'apply', langs } : { action: 'apply' };
    }
    return { action: 'apply' };
  }
  if (obj.discard === true && specs.some((s) => s.id === 'discard')) {
    return { action: 'discard' };
  }
  if (specs.some((s) => s.id === 'revise')) {
    // Preferred contract: {"revise":"<extracted corrected content>"}.
    if (typeof obj.revise === 'string' && obj.revise.trim()) {
      return { action: 'revise', text: obj.revise.trim() };
    }
    // Tolerate a bare {"revise":true} — caller falls back to the raw text.
    if (obj.revise === true) return { action: 'revise' };
  }
  // {"new":true} or anything else → normal request.
  return null;
}
