/**
 * Shared types for the Smart JSON config assistant.
 *
 * The assistant mixes two choice kinds (hybrid "Option B"):
 * - `topic` — deterministic, schema-driven navigation cards (what can I
 *   configure?); rendered locally, never sent to the model.
 * - `config` — a model-produced JSON candidate, validated against the zod
 *   schema; the card shows the preview + validation errors + Apply action.
 */

/** A schema topic node in the deterministic cascade explorer. */
export interface SchemaTopic {
  /** Property name (e.g. `rules`, `min`). */
  key: string;
  /** Dot path inside the schema (e.g. `validation.rules.min`). */
  path: string;
  /** Display title — schema title or the property name. */
  title: string;
  /** Schema description — DISPLAY text (localized when available). */
  description: string;
  /**
   * Original English schema describe — kept for MODEL PROMPTS after
   * localization blanks the display `description`, so the model still gets
   * the semantic hint without leaking English into the UI.
   */
  schema_description?: string;
  /** Child properties (nested objects). */
  children: SchemaTopic[];
  /**
   * Selectable values for leaf properties with a closed domain
   * (`enum` values, or `true`/`false` for booleans). When present, the
   * explorer renders them as CTAs — the user picks a value and the model
   * produces the JSON, no free-text typing needed.
   */
  value_options?: Array<string | number | boolean>;
  /**
   * Semantic leaf marker — `error_label_key` leaves are NOT "generate the
   * JSON" targets: they open a key-picker flow (existing-key autocomplete,
   * auto-generated key, or a user message translated into all languages).
   */
  leaf_kind?: 'error_label_key';
}

export type JsonAssistantChoice =
  | {
      kind: 'topic';
      path: string;
      title: string;
      description: string;
      /** True when the topic has children — click expands; else generates. */
      expandable: boolean;
    }
  | {
      kind: 'value';
      /** Leaf path the value applies to (e.g. `validation.required`). */
      path: string;
      /** Display label (e.g. 'True'). */
      title: string;
      /** The value to set. */
      value: string | number | boolean;
    }
  | {
      kind: 'key_picker';
      /** Leaf path the picked key applies to (e.g. `validation.rules.min.error_label_key`). */
      path: string;
      /** Rule name for the auto-generated key convention (e.g. 'min'). */
      rule: string;
      /** Auto-generated suggestion shown as the default. */
      suggested_key: string;
    }
  | {
      kind: 'translations_preview';
      /** Leaf path the key applies to (e.g. `validation.rules.min.error_label_key`). */
      path: string;
      /** The `custom.*` key being created. */
      key: string;
      /** Per-language translated values (language → text). */
      translations: Record<string, string>;
    }
  | {
      kind: 'config';
      /** Pretty-printed JSON candidate. */
      json: string;
      /** Zod validation result against the schema. */
      valid: boolean;
      /** Human-readable validation issues (empty when valid). */
      errors: string[];
    };
