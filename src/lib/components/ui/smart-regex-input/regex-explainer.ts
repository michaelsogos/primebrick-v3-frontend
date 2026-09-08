/**
 * regex-explainer — deterministic regex breakdown using @eslint-community/regexpp.
 *
 * Parses a regex pattern + flags into an AST and walks it to produce a
 * human-readable breakdown of each component (fragment + meaning_key).
 *
 * This replaces the LLM-generated breakdown for reliability: no hallucinations,
 * deterministic output, works offline. The LLM only generates the regex itself;
 * the explanation is computed by the frontend.
 *
 * All meaning strings are returned as i18n translation keys (app.smart.regex.explainer.*)
 * so the component can translate them with $t().
 */
import { parseRegExpLiteral, visitRegExpAST, type AST } from '@eslint-community/regexpp';
import type { RegexPart } from './use-regex-ai.svelte';

/** Translation key prefix for all explainer strings. */
const K = 'app.smart.regex.explainer';

/**
 * Parse a regex pattern + flags and return a deterministic breakdown
 * of each component with a translation key for the description.
 *
 * Returns an empty array if the regex is invalid or cannot be parsed.
 */
export function explainRegex(pattern: string, flags: string): RegexPart[] {
  if (!pattern) return [];
  try {
    const literal = `/${pattern}/${flags}`;
    const ast = parseRegExpLiteral(literal);
    const parts: RegexPart[] = [];
    // Track depth inside a Quantifier so we skip its descendants — the Quantifier
    // handler already emits a combined fragment+meaning for the whole quantified element.
    let quantifierDepth = 0;
    visitRegExpAST(ast, {
      onQuantifierEnter: (node: AST.Quantifier) => {
        quantifierDepth++;
        // Only handle the outermost Quantifier (depth was just incremented to 1).
        // Nested quantifiers (if any) are covered by the outer one's combined entry.
        if (quantifierDepth > 1) return;
        const inner = node.element;
        const innerDesc = describeElementKey(inner);
        const quantKey = describeQuantifierKey(node);
        // Emit two separate parts: the element description, then the quantifier.
        parts.push({
          fragment: inner.raw,
          meaning_key: innerDesc.key,
          meaning_params: innerDesc.params,
        });
        parts.push({
          fragment: node.raw,
          meaning_key: quantKey,
        });
      },
      onQuantifierLeave: () => { quantifierDepth--; },
      onAssertionEnter: (node: AST.Assertion) => {
        if (quantifierDepth > 0) return;
        switch (node.kind) {
          case 'start':
            parts.push({ fragment: '^', meaning_key: `${K}.start` });
            break;
          case 'end':
            parts.push({ fragment: '$', meaning_key: `${K}.end` });
            break;
          case 'lookahead':
            parts.push({
              fragment: node.raw,
              meaning_key: node.negate ? `${K}.lookahead_negative` : `${K}.lookahead`,
            });
            break;
          case 'lookbehind':
            parts.push({
              fragment: node.raw,
              meaning_key: node.negate ? `${K}.lookbehind_negative` : `${K}.lookbehind`,
            });
            break;
          case 'word':
            parts.push({ fragment: node.raw, meaning_key: `${K}.word_boundary` });
            break;
        }
      },
      onCharacterSetEnter: (node: AST.CharacterSet) => {
        if (quantifierDepth > 0) return;
        const desc = describeCharacterSetKey(node);
        if (desc.key) {
          parts.push({ fragment: node.raw, meaning_key: desc.key, meaning_params: desc.params });
        } else {
          parts.push({ fragment: node.raw, meaning_key: `${K}.character_set`, meaning_params: { raw: node.raw } });
        }
      },
      onCharacterClassEnter: (node: AST.CharacterClass) => {
        if (quantifierDepth > 0) return;
        const desc = describeCharacterClassKey(node);
        parts.push({ fragment: node.raw, meaning_key: desc.key, meaning_params: desc.params });
      },
      onGroupEnter: (_node: AST.Group) => {
        if (quantifierDepth > 0) return;
        parts.push({ fragment: _node.raw, meaning_key: `${K}.non_capturing_group` });
      },
      onCapturingGroupEnter: (_node: AST.CapturingGroup) => {
        if (quantifierDepth > 0) return;
        parts.push({ fragment: _node.raw, meaning_key: `${K}.capturing_group` });
      },
      onCharacterEnter: (node: AST.Character) => {
        if (quantifierDepth > 0) return;
        const parent = (node as any).parent;
        if (!parent) return;
        if (parent.type === 'CharacterClass') return;
        if (parent.type === 'CharacterClassRange') return;
        if (parent.type === 'Alternative' || parent.type === 'Pattern') {
          const desc = describeCharacterKey(node);
          parts.push({ fragment: node.raw, meaning_key: desc.key, meaning_params: desc.params });
        }
      },
      onBackreferenceEnter: (node: AST.Backreference) => {
        if (quantifierDepth > 0) return;
        parts.push({
          fragment: node.raw,
          meaning_key: `${K}.backreference`,
          meaning_params: { ref: node.ref },
        });
      },
    });
    return parts;
  } catch {
    return [];
  }
}

/** Result type for key-based descriptions. */
interface KeyResult {
  key: string;
  params?: Record<string, string | number>;
}

/** Describe a CharacterSet node (\d, \w, \s, \D, \W, \S, \b, \B, etc.) */
function describeCharacterSetKey(node: AST.CharacterSet): KeyResult {
  switch (node.kind) {
    case 'digit':
      return { key: node.negate ? `${K}.non_digit` : `${K}.digit` };
    case 'space':
      return { key: node.negate ? `${K}.non_space` : `${K}.space` };
    case 'word':
      return { key: node.negate ? `${K}.non_word` : `${K}.word` };
    case 'any':
      return { key: `${K}.any` };
    default:
      return { key: `${K}.character_set`, params: { raw: node.raw } };
  }
}

/** Describe a CharacterClass node ([...]) */
function describeCharacterClassKey(node: AST.CharacterClass): KeyResult {
  const negate = node.negate;
  const elements = node.elements;
  const descriptions: string[] = [];
  for (const el of elements) {
    if (el.type === 'CharacterClassRange') {
      const min = String.fromCharCode(el.min.value);
      const max = String.fromCharCode(el.max.value);
      descriptions.push(`${min}\u2013${max}`);
    } else if (el.type === 'Character') {
      descriptions.push(el.raw.replace('\\', ''));
    } else if (el.type === 'CharacterSet') {
      const desc = describeCharacterSetKey(el);
      // Use the raw representation for character sets inside classes
      descriptions.push(el.raw);
    }
  }
  const content = descriptions.join(', ');
  return {
    key: negate ? `${K}.char_class_negated` : `${K}.char_class`,
    params: { content },
  };
}

/** Describe a Quantifier node (*, +, ?, {n}, {n,}, {n,m}) */
function describeQuantifierKey(node: AST.Quantifier): string {
  const min = node.min;
  const max = node.max;
  if (min === 0 && max === Infinity) return `${K}.zero_or_more`;
  if (min === 1 && max === Infinity) return `${K}.one_or_more`;
  if (min === 0 && max === 1) return `${K}.optional`;
  if (min === max) return `${K}.exactly`;
  if (max === Infinity) return `${K}.min_or_more`;
  return `${K}.between`;
}

/** Get translation key + params for any element (used inside quantifier descriptions). */
function describeElementKey(node: AST.Element): KeyResult {
  switch (node.type) {
    case 'Character':
      return describeCharacterKey(node);
    case 'CharacterSet':
      return describeCharacterSetKey(node);
    case 'CharacterClass':
      return describeCharacterClassKey(node);
    case 'Group':
      return { key: `${K}.non_capturing_group` };
    case 'CapturingGroup':
      return { key: `${K}.capturing_group` };
    default:
      return { key: `${K}.character_set`, params: { raw: node.raw } };
  }
}

/** Describe a Character node (literal or escaped) */
function describeCharacterKey(node: AST.Character): KeyResult {
  const raw = node.raw;
  // Escaped special characters
  if (raw === '\\.') return { key: `${K}.literal_dot` };
  if (raw === '\\+') return { key: `${K}.literal_plus` };
  if (raw === '\\*') return { key: `${K}.literal_asterisk` };
  if (raw === '\\?') return { key: `${K}.literal_question` };
  if (raw === '\\(') return { key: `${K}.literal_paren_open` };
  if (raw === '\\)') return { key: `${K}.literal_paren_close` };
  if (raw === '\\[') return { key: `${K}.literal_bracket_open` };
  if (raw === '\\]') return { key: `${K}.literal_bracket_close` };
  if (raw === '\\{') return { key: `${K}.literal_brace_open` };
  if (raw === '\\}') return { key: `${K}.literal_brace_close` };
  if (raw === '\\\\') return { key: `${K}.literal_backslash` };
  if (raw === '\\|') return { key: `${K}.literal_pipe` };
  if (raw === '\\^') return { key: `${K}.literal_caret` };
  if (raw === '\\$') return { key: `${K}.literal_dollar` };
  if (raw === '\\/') return { key: `${K}.literal_slash` };
  if (raw === '\\n') return { key: `${K}.newline` };
  if (raw === '\\r') return { key: `${K}.carriage_return` };
  if (raw === '\\t') return { key: `${K}.tab` };
  // Regular literal
  return { key: `${K}.literal`, params: { char: raw } };
}
