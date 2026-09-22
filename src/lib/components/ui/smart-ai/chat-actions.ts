/**
 * chat-actions — model-driven resolution of pending assistant choices.
 *
 * When the last assistant message carries unresolved choices, the user can
 * answer in natural language instead of clicking. The assistant wrapper
 * appends a compact [Pending actions] block to the USER message (never the
 * system prompt — KV prefix reuse is preserved), instructing the model to
 * answer with a strict JSON action when the reply resolves a choice:
 *
 *   {"action":"pick","index":<1-based>} | {"action":"apply"} | {"action":"discard"}
 *   {"action":"apply","langs":["it-IT"]} — language subset (translations_preview)
 *
 * If the reply is a new request the model answers normally — fail-safe:
 * nothing is executed unless the action validates against the enumerated
 * spec exactly.
 */
import type { ChatMessage } from './ai-assistant.types';

/** A validated action returned by the model. `index` is 0-based. */
export interface ChatAction {
  action: 'apply' | 'discard' | 'pick';
  /** 0-based index into the pending message's choices (pick only). */
  index?: number;
  /** Language subset for translations_preview applies. */
  langs?: string[];
}

/** One executable option offered to the model. */
export interface PendingActionSpec {
  id: 'apply' | 'discard' | 'pick';
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
  messages: ChatMessage<TChoice>[],
): ChatMessage<TChoice> | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant') {
      return !m.resolution && m.choices && m.choices.length > 0 ? m : undefined;
    }
  }
  return undefined;
}

/** Build the [Pending actions] block appended to the user message. */
export function buildActionsBlock(specs: PendingActionSpec[]): string {
  const lines = specs.map((s) =>
    s.id === 'pick'
      ? `  {"action":"pick","index":${(s.index ?? 0) + 1}} — ${s.label}`
      : `  {"action":"${s.id}"} — ${s.label}`,
  );
  const langsSpec = specs.find((s) => s.id === 'apply' && s.langs?.length);
  const langsHint = langsSpec
    ? `\n  To accept only some languages use {"action":"apply","langs":[...]} with values from ${JSON.stringify(langsSpec.langs)}.`
    : '';
  return [
    '',
    '[Pending actions — the user may be answering the choices above.',
    'If their reply clearly resolves one, respond ONLY with the matching JSON action:',
    ...lines,
    langsHint,
    'Otherwise answer the request normally.]',
  ].join('\n');
}

/**
 * Extract and validate a chat action from raw model output.
 * Returns null unless the response IS a single JSON object whose action
 * matches the enumerated spec — prose + action = treated as normal output.
 */
export function parseChatAction(
  raw: string,
  specs: PendingActionSpec[],
): ChatAction | null {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*\n?/i, '');
  text = text.replace(/\n?```\s*$/i, '').trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const id = obj.action;
  if (id !== 'apply' && id !== 'discard' && id !== 'pick') return null;

  if (id === 'pick') {
    const idx = typeof obj.index === 'number' ? obj.index : NaN;
    const spec = specs.find((s) => s.id === 'pick' && (s.index ?? -1) + 1 === idx);
    if (!spec) return null;
    return { action: 'pick', index: spec.index };
  }

  if (!specs.some((s) => s.id === id)) return null;

  if (id === 'apply' && Array.isArray(obj.langs)) {
    const allowed = specs.find((s) => s.id === 'apply')?.langs;
    const langs = obj.langs.filter(
      (l): l is string => typeof l === 'string' && (!allowed || allowed.includes(l)),
    );
    return langs.length ? { action: 'apply', langs } : { action: 'apply' };
  }
  return { action: id };
}
