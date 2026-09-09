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
/** Translation key prefix for summary strings. */
const KS = 'app.smart.regex.summary';

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
        const quantKey = describeQuantifierKey(node);
        // Extract just the quantifier symbol (e.g. "+", "*", "?", "{3,5}")
        // by stripping the element's raw from the quantifier's raw.
        const quantSymbol = node.raw.slice(inner.raw.length);
        // If the quantified element is a CharacterClass, expand it granularly
        // with merged brackets [ ] as a single explanation line.
        if (inner.type === 'CharacterClass') {
          const cc = inner as AST.CharacterClass;
          // Merged brackets as one line
          parts.push({
            fragment: cc.negate ? '[^ ]' : '[ ]',
            meaning_key: cc.negate ? `${K}.char_class_negated_brackets` : `${K}.char_class_brackets`,
          });
          // One part per element
          for (const el of cc.elements) {
            if (el.type === 'CharacterClassRange') {
              const minChar = String.fromCharCode(el.min.value);
              const maxChar = String.fromCharCode(el.max.value);
              parts.push({
                fragment: el.raw,
                meaning_key: `${K}.char_range`,
                meaning_params: { min: minChar, max: maxChar },
              });
            } else if (el.type === 'Character') {
              const desc = describeCharacterKey(el);
              parts.push({
                fragment: el.raw,
                meaning_key: desc.key,
                meaning_params: desc.params,
              });
            } else if (el.type === 'CharacterSet') {
              const desc = describeCharacterSetKey(el);
              if (desc.key) {
                parts.push({
                  fragment: el.raw,
                  meaning_key: desc.key,
                  meaning_params: desc.params,
                });
              } else {
                parts.push({
                  fragment: el.raw,
                  meaning_key: `${K}.character_set`,
                  meaning_params: { raw: el.raw },
                });
              }
            }
          }
        } else {
          // Non-class element: use the standard description
          const innerDesc = describeElementKey(inner);
          parts.push({
            fragment: inner.raw,
            meaning_key: innerDesc.key,
            meaning_params: innerDesc.params,
          });
        }
        // Quantifier itself — just the symbol, not the whole quantified element
        parts.push({
          fragment: quantSymbol,
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
        // Merged brackets as one line
        parts.push({
          fragment: node.negate ? '[^ ]' : '[ ]',
          meaning_key: node.negate ? `${K}.char_class_negated_brackets` : `${K}.char_class_brackets`,
        });
        // Emit one part per element inside the character class
        for (const el of node.elements) {
          if (el.type === 'CharacterClassRange') {
            const minChar = String.fromCharCode(el.min.value);
            const maxChar = String.fromCharCode(el.max.value);
            parts.push({
              fragment: el.raw,
              meaning_key: `${K}.char_range`,
              meaning_params: { min: minChar, max: maxChar },
            });
          } else if (el.type === 'Character') {
            const desc = describeCharacterKey(el);
            parts.push({
              fragment: el.raw,
              meaning_key: desc.key,
              meaning_params: desc.params,
            });
          } else if (el.type === 'CharacterSet') {
            const desc = describeCharacterSetKey(el);
            if (desc.key) {
              parts.push({
                fragment: el.raw,
                meaning_key: desc.key,
                meaning_params: desc.params,
              });
            } else {
              parts.push({
                fragment: el.raw,
                meaning_key: `${K}.character_set`,
                meaning_params: { raw: el.raw },
              });
            }
          }
        }
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

// ─── Summary generation ───

/** A translatable summary part: translation key + params (which can be nested parts). */
export type SummaryParam = string | number | RegexSummary;
export interface RegexSummary {
  key: string;
  params?: Record<string, SummaryParam>;
}

/**
 * Parse a regex pattern + flags and return a high-level human summary.
 *
 * Unlike explainRegex() which gives a per-fragment breakdown, this function
 * walks the AST to produce a single sentence describing what the regex validates.
 *
 * Returns null if the regex is invalid or too complex to summarize.
 *
 * The returned RegexSummary may contain nested RegexSummary objects in its
 * params — the caller must resolve them recursively with $t().
 */
export function summarizeRegex(pattern: string, flags: string): RegexSummary | null {
  if (!pattern) return null;
  try {
    const literal = `/${pattern}/${flags}`;
    const ast = parseRegExpLiteral(literal);

    // Collect top-level structure
    const alternatives = ast.pattern.alternatives;

    // Handle alternation (a|b|c)
    if (alternatives.length > 1) {
      const parts = alternatives
        .map(alt => alt.raw)
        .filter(Boolean);
      if (parts.length > 0) {
        return { key: `${KS}.alternation`, params: { parts: parts.join(' | ') } };
      }
    }

    // Single alternative
    if (alternatives.length === 1) {
      return summarizeAlternative(alternatives[0]);
    }

    return null;
  } catch {
    return null;
  }
}

/** Summarize a single alternative (sequence of elements). */
function summarizeAlternative(alt: AST.Alternative): RegexSummary | null {
  const elements = alt.elements;
  if (elements.length === 0) return null;

  // Check for anchors
  const hasStart = elements.some(e => e.type === 'Assertion' && (e as AST.Assertion).kind === 'start');
  const hasEnd = elements.some(e => e.type === 'Assertion' && (e as AST.Assertion).kind === 'end');
  const anchored = hasStart && hasEnd;

  // Filter out assertions to get the "content" elements
  const contentElements = elements.filter(e => e.type !== 'Assertion');

  if (contentElements.length === 0) {
    if (anchored) return { key: `${KS}.empty_anchored` };
    return { key: `${KS}.empty` };
  }

  // Single content element (most common case: ^[a-zA-Z0-9]+$)
  if (contentElements.length === 1) {
    const elem = contentElements[0];
    return summarizeElement(elem, anchored);
  }

  // Multiple content elements — try to describe as a sequence
  // e.g. ^[a-zA-Z0-9]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ (email)
  const parts = contentElements
    .map(e => summarizeElementShort(e))
    .filter((p): p is RegexSummary => p !== null);
  if (parts.length > 0) {
    return { key: `${KS}.sequence`, params: { parts: joinListParts(parts) } };
  }

  return null;
}

/** Summarize a single element with full sentence. */
function summarizeElement(elem: AST.Element, anchored: boolean): RegexSummary | null {
  // Quantified element
  if (elem.type === 'Quantifier') {
    const q = elem as AST.Quantifier;
    const inner = q.element;
    const quantDesc = describeQuantifierSummary(q);
    const contentDesc = describeContent(inner);

    if (contentDesc) {
      if (anchored) {
        return {
          key: `${KS}.anchored_quantified`,
          params: { content: contentDesc, quantifier: quantDesc },
        };
      }
      return {
        key: `${KS}.quantified`,
        params: { content: contentDesc, quantifier: quantDesc },
      };
    }
  }

  // Non-quantified element
  const contentDesc = describeContent(elem);
  if (contentDesc) {
    if (anchored) {
      return { key: `${KS}.anchored_content`, params: { content: contentDesc } };
    }
    return { key: `${KS}.content`, params: { content: contentDesc } };
  }

  return null;
}

/** Short description of an element for sequence composition. */
function summarizeElementShort(elem: AST.Element): RegexSummary | null {
  if (elem.type === 'Quantifier') {
    const q = elem as AST.Quantifier;
    const inner = describeContent(q.element);
    const quant = describeQuantifierSummary(q);
    if (!inner) return null;
    return {
      key: `${KS}.element_with_quant`,
      params: { content: inner, quantifier: quant },
    };
  }
  return describeContent(elem);
}

/** Describe the "content" of an element as a translatable part. */
function describeContent(elem: AST.Element): RegexSummary | null {
  switch (elem.type) {
    case 'CharacterClass':
      return describeCharacterClassContent(elem as AST.CharacterClass);
    case 'CharacterSet':
      return describeCharacterSetContent(elem as AST.CharacterSet);
    case 'Character':
      return describeCharacterContent(elem as AST.Character);
    case 'Group':
    case 'CapturingGroup': {
      const group = elem as AST.Group | AST.CapturingGroup;
      const alts = group.alternatives;
      if (alts.length === 1) {
        const parts = alts[0].elements
          .map(e => describeContent(e))
          .filter((p): p is RegexSummary => p !== null);
        if (parts.length > 0) {
          return joinListParts(parts, `${KS}.followed_by`);
        }
      }
      return null;
    }
    default:
      return null;
  }
}

/** Describe a character class [a-zA-Z0-9] as a translatable part. */
function describeCharacterClassContent(cc: AST.CharacterClass): RegexSummary | null {
  const items: RegexSummary[] = [];
  for (const el of cc.elements) {
    if (el.type === 'CharacterClassRange') {
      const minChar = String.fromCharCode(el.min.value);
      const maxChar = String.fromCharCode(el.max.value);
      items.push(describeRange(minChar, maxChar));
    } else if (el.type === 'Character') {
      items.push(describeCharLiteral(el.raw));
    } else if (el.type === 'CharacterSet') {
      const desc = describeCharacterSetContent(el as AST.CharacterSet);
      if (desc) items.push(desc);
    }
  }
  if (items.length === 0) return null;

  const content = joinListParts(items);
  return cc.negate
    ? { key: `${KS}.char_class_negated_content`, params: { content } }
    : content;
}

/** Describe a character set (\d, \w, \s, etc.) as a translatable part. */
function describeCharacterSetContent(cs: AST.CharacterSet): RegexSummary | null {
  switch (cs.kind) {
    case 'digit':
      return { key: cs.negate ? `${KS}.set_non_digit` : `${KS}.set_digit` };
    case 'space':
      return { key: cs.negate ? `${KS}.set_non_space` : `${KS}.set_space` };
    case 'word':
      return { key: cs.negate ? `${KS}.set_non_word` : `${KS}.set_word` };
    case 'any':
      return { key: `${KS}.set_any` };
    default:
      return null;
  }
}

/** Describe a single character as a translatable part. */
function describeCharacterContent(ch: AST.Character): RegexSummary | null {
  return describeCharLiteral(ch.raw);
}

/** Describe a character range like a-z, A-Z, 0-9 as a translatable part. */
function describeRange(min: string, max: string): RegexSummary {
  if (min === 'a' && max === 'z') return { key: `${KS}.range_lowercase` };
  if (min === 'A' && max === 'Z') return { key: `${KS}.range_uppercase` };
  if (min === '0' && max === '9') return { key: `${KS}.range_digits` };
  return { key: `${KS}.range_generic`, params: { min, max } };
}

/** Describe a literal character as a translatable part. */
function describeCharLiteral(raw: string): RegexSummary {
  const keyMap: Record<string, string> = {
    '\\.': `${KS}.char_dot`,
    '\\+': `${KS}.char_plus`,
    '\\*': `${KS}.char_asterisk`,
    '\\?': `${KS}.char_question`,
    '\\(': `${KS}.char_paren_open`,
    '\\)': `${KS}.char_paren_close`,
    '\\[': `${KS}.char_bracket_open`,
    '\\]': `${KS}.char_bracket_close`,
    '\\{': `${KS}.char_brace_open`,
    '\\}': `${KS}.char_brace_close`,
    '\\\\': `${KS}.char_backslash`,
    '\\|': `${KS}.char_pipe`,
    '\\^': `${KS}.char_caret`,
    '\\$': `${KS}.char_dollar`,
    '\\/': `${KS}.char_slash`,
    '\\n': `${KS}.char_newline`,
    '\\r': `${KS}.char_carriage_return`,
    '\\t': `${KS}.char_tab`,
    '\\-': `${KS}.char_hyphen`,
    '_': `${KS}.char_underscore`,
    '@': `${KS}.char_at`,
    '.': `${KS}.char_dot`,
    '!': `${KS}.char_exclamation`,
    ',': `${KS}.char_comma`,
    ';': `${KS}.char_semicolon`,
    ':': `${KS}.char_colon`,
    '/': `${KS}.char_slash`,
    ' ': `${KS}.char_space`,
  };
  const key = keyMap[raw];
  if (key) return { key };
  return { key: `${KS}.char_literal`, params: { char: raw } };
}

/** Describe a quantifier as a translatable part. */
function describeQuantifierSummary(q: AST.Quantifier): RegexSummary {
  const min = q.min;
  const max = q.max;
  if (min === 0 && max === Infinity) return { key: `${KS}.quant_zero_or_more` };
  if (min === 1 && max === Infinity) return { key: `${KS}.quant_one_or_more` };
  if (min === 0 && max === 1) return { key: `${KS}.quant_optional` };
  if (min === max) return { key: `${KS}.quant_exactly`, params: { n: min } };
  if (max === Infinity) return { key: `${KS}.quant_at_least`, params: { n: min } };
  return { key: `${KS}.quant_between`, params: { min, max } };
}

/**
 * Join a list of translatable parts using list-joining translation keys.
 * Uses `list_two` for 2 items, `list_sep` + `list_last` for 3+.
 * `separator` defaults to the "and" joiner; use `${KS}.followed_by` for sequences.
 */
function joinListParts(items: RegexSummary[], separator?: string): RegexSummary {
  const sep = separator ?? `${KS}.list_last`;
  if (items.length === 0) return { key: '' };
  if (items.length === 1) return items[0];
  if (items.length === 2) {
    return { key: `${KS}.list_two`, params: { a: items[0], b: items[1] } };
  }
  // 3+: build comma-separated head, then join with last
  const head = items.slice(0, -1);
  const last = items[items.length - 1];
  const commaJoined = head.reduceRight((acc: RegexSummary, item: RegexSummary) =>
    ({ key: `${KS}.list_sep`, params: { a: item, b: acc } })
  );
  return { key: sep, params: { items: commaJoined, last } };
}
