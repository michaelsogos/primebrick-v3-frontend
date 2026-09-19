/**
 * json-schema-explorer — deterministic topic tree for a JSON-schema
 * assistant. Fully schema-agnostic: it turns any JSON Schema's
 * `properties` + `description` fields into navigable topics, and leaf
 * properties with a closed domain (`enum` / `boolean`) into value CTAs.
 *
 * Domain-specific pruning (e.g. "which props apply to this ConfigEntryType")
 * is the caller's job — pass an already-pruned schema.
 *
 * The model is NEVER involved in navigation — topic cards render locally.
 */
import type { JsonAssistantChoice, SchemaTopic } from './json-schema.types';

export type JsonSchemaObject = {
  title?: string;
  description?: string;
  type?: string;
  enum?: Array<string | number | boolean>;
  properties?: Record<string, JsonSchemaObject>;
};

/**
 * Recursively build the topic tree from a schema's `properties`.
 * Nodes without nested properties are leaves; leaves with a closed
 * domain get `value_options` so the UI can offer value CTAs.
 */
export function buildSchemaTopics(
  schema: JsonSchemaObject,
  basePath = '',
): SchemaTopic[] {
  const props = schema?.properties ?? {};
  return Object.entries(props).map(([key, def]) => {
    const path = basePath ? `${basePath}.${key}` : key;
    const children = buildSchemaTopics(def ?? {}, path);
    // Leaf with a closed domain → value CTAs: enum literals, or
    // false/true for booleans — false first so the primary True CTA
    // lands on the right (affirmative action = rightmost position).
    const value_options =
      children.length === 0
        ? def?.enum ?? (def?.type === 'boolean' ? [false, true] : undefined)
        : undefined;
    return {
      key,
      path,
      title: def?.title ?? key,
      description: def?.description ?? '',
      children,
      value_options,
      leaf_kind:
        children.length === 0 && /(^|_)error_label_key$/.test(key)
          ? 'error_label_key'
          : undefined,
    };
  });
}

/** Flat lookup: dot path → topic node. */
export function indexSchemaTopics(topics: SchemaTopic[]): Map<string, SchemaTopic> {
  const map = new Map<string, SchemaTopic>();
  const walk = (nodes: SchemaTopic[]) => {
    for (const n of nodes) {
      map.set(n.path, n);
      walk(n.children);
    }
  };
  walk(topics);
  return map;
}

/** Convert topic nodes into 'topic' choices for the chat panel. */
export function topicsToChoices(topics: SchemaTopic[]): JsonAssistantChoice[] {
  return topics.map((t) => ({
    kind: 'topic',
    path: t.path,
    title: t.title,
    description: t.description,
    expandable: t.children.length > 0,
  }));
}

/**
 * Set a value at a dot path inside a plain JSON object (mutates a clone).
 * Intermediate objects are created when missing — arrays are not supported.
 */
export function setJsonPath<T>(obj: T, path: string, value: unknown): T {
  const parts = path.split('.');
  const clone = (obj ?? {}) as Record<string, unknown>;
  let cursor = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cursor[key];
    cursor[key] =
      typeof next === 'object' && next !== null && !Array.isArray(next)
        ? { ...(next as Record<string, unknown>) }
        : {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
  return clone as T;
}

/**
 * Derive the rule name an `error_label_key` leaf belongs to.
 * 'validation.required_error_label_key' → 'required';
 * 'validation.rules.min.error_label_key' → 'min'.
 */
export function errorLabelRuleFromPath(path: string): string {
  const parts = path.split('.');
  const leaf = parts[parts.length - 1] ?? '';
  if (leaf !== 'error_label_key') {
    // e.g. required_error_label_key → 'required'
    return leaf.replace(/_error_label_key$/, '') || leaf;
  }
  // e.g. rules.<rule>.error_label_key → '<rule>'
  return parts[parts.length - 2] ?? leaf;
}

/** Convert a leaf's closed domain into 'value' choices (e.g. True/False). */
export function valueOptionsToChoices(
  path: string,
  options: Array<string | number | boolean>,
): JsonAssistantChoice[] {
  return options.map((value) => ({
    kind: 'value',
    path,
    title: typeof value === 'boolean' ? (value ? 'True' : 'False') : String(value),
    value,
  }));
}
