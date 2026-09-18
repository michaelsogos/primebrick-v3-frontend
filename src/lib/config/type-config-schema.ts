/**
 * Single source of truth for type_config JSON parsing, serialization, and schema.
 *
 * This module consolidates all type_config knowledge that was previously
 * duplicated across:
 *   - config-validation.ts (extractValidation + ConfigValidation interface)
 *   - ConfigValueInput.svelte (4× inline JSON.parse for badge/select/money/currency)
 *   - useNumericInput.svelte.ts (own parseTypeConfig + ParsedTypeConfig)
 *
 * The FE cannot import these types from @primebrick/sdk (the SDK is a Node.js
 * library with server-only deps). This module mirrors the SDK's ConfigValidation
 * interface and extends it with the full ParsedTypeConfig union.
 */

// ─── Validation types (mirror SDK ConfigValidation) ──────────────
// Single zod source: types are z.infer'd (identical shape to the previous
// hand-written interfaces) and the JSON Schema is z.toJSONSchema()'d for
// the CodeMirror language service — one definition, two artifacts.

import { z } from 'zod';

const errorLabelKey = z.string().optional();

const ruleWithNumberSchema = z.object({
  value: z.number().describe('Numeric boundary for this rule'),
  error_label_key: errorLabelKey.describe('Translation key for the validation error message'),
});

export const configValidationSchema = z.object({
  required: z.boolean().describe('If true, the value cannot be empty'),
  required_error_label_key: errorLabelKey,
  /** If true, numeric values are unsigned (no sign chars, default min=0). */
  unsigned: z.boolean().optional().describe('Numeric values are unsigned (no sign chars)'),
  rules: z.object({
    min: ruleWithNumberSchema.optional().describe('Minimum length/value'),
    max: ruleWithNumberSchema.optional().describe('Maximum length/value'),
    url: z.object({
      protocols: z.array(z.string()).describe('Allowed URL protocols, e.g. ["https"]'),
      error_label_key: errorLabelKey,
    }).optional().describe('URL protocol validation'),
    email: z.object({ error_label_key: errorLabelKey }).optional().describe('Email format validation'),
    regex: z.object({
      pattern: z.string().describe('Regular expression the value must match'),
      flags: z.string().optional().describe('Regex flags, e.g. "i"'),
      error_label_key: errorLabelKey,
    }).optional().describe('Regex pattern validation'),
  }).describe('Validation rules applied to the value'),
});

export type ConfigValidation = z.infer<typeof configValidationSchema>;

// ─── Parsed type_config (union of all possible fields) ──────────

export const typeConfigSchema = z.object({
  // Validation (all types)
  validation: configValidationSchema.optional().describe('Validation rules for the config value'),
  // Money
  currency: z.string().optional().describe('ISO 4217 currency code, e.g. "EUR"'),
  allowed_currencies: z.array(z.string()).optional().describe('Selectable currency codes'),
  // Badge
  values: z.record(z.string(), z.object({
    label_key: z.string().optional().describe('Translation key for the badge label'),
    color: z.string().optional().describe('Badge color token'),
  })).optional().describe('Badge values map: value → label/color'),
  // single_select / multi_select
  values_source: z.string().optional().describe('Built-in source id, e.g. "currencies"'),
  api_url: z.string().optional().describe('Endpoint URL providing the options'),
  api_verb: z.string().optional().describe('HTTP method for the options endpoint'),
  value_field: z.string().optional().describe('Response field used as option value'),
  label_field: z.string().optional().describe('Response field used as option label'),
  // URL
  default_protocol: z.string().optional().describe('Default URL protocol, e.g. "https"'),
  allowed_protocols: z.array(z.string()).optional().describe('Allowed URL protocols'),
  // Phone
  country: z.string().optional().describe('Default ISO country code, e.g. "IT"'),
  allowed_countries: z.array(z.string()).optional().describe('Selectable country codes'),
});

export type ParsedTypeConfig = z.infer<typeof typeConfigSchema>;

/** JSON Schema of type_config — generated from typeConfigSchema (single source). */
export const typeConfigJsonSchema = z.toJSONSchema(typeConfigSchema);

// ─── Parse ───────────────────────────────────────────────────────

/**
 * Parse a type_config JSON string into a structured object.
 * Returns null if the string is empty, null, or invalid JSON.
 */
export function parseTypeConfig(type_config?: string | null): ParsedTypeConfig | null {
  if (!type_config) return null;
  try {
    return JSON.parse(type_config) as ParsedTypeConfig;
  } catch {
    return null;
  }
}

/**
 * Extract just the validation config from a type_config JSON string.
 * Convenience wrapper for code that only needs validation rules.
 */
export function extractValidation(type_config?: string | null): ConfigValidation | null {
  const parsed = parseTypeConfig(type_config);
  if (!parsed?.validation || typeof parsed.validation !== 'object') return null;
  return parsed.validation;
}

// ─── Serialize ───────────────────────────────────────────────────

/**
 * Remove undefined values, empty objects, and empty arrays recursively.
 * Produces clean JSON with no `"key":undefined` or `"key":{}` noise.
 */
function stripEmpty<T>(value: T): T {
  if (value === null || value === undefined) return value as T;
  if (Array.isArray(value)) {
    const cleaned = value.map(stripEmpty).filter((v) => v !== undefined && v !== null);
    return cleaned as unknown as T;
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === undefined) continue;
      const cleaned = stripEmpty(val);
      if (cleaned === undefined || cleaned === null) continue;
      if (typeof cleaned === 'object' && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0) continue;
      result[key] = cleaned;
    }
    return result as unknown as T;
  }
  return value;
}

/**
 * Serialize a structured type_config object to a JSON string.
 * Strips undefined values and empty objects for clean output.
 */
export function serializeTypeConfig(config: ParsedTypeConfig): string {
  return JSON.stringify(stripEmpty(config));
}

// ─── error_label_key auto-generation ─────────────────────────────

/**
 * Auto-generate an error_label_key for a validation rule.
 * Standard rules (required, min, max, invalidUrl, invalidEmail) map to
 * generic `app.common.validation.*` keys. Custom rules use the convention
 * `system.settings.config.auth.{configKey}.errors.{rule}`.
 * Users can override this in the builder UI.
 * If configKey is empty, uses "my_custom_setting" as a placeholder example.
 */
const GENERIC_ERROR_KEYS: Record<string, string> = {
  required: 'app.common.validation.required',
  min: 'app.common.validation.tooShort',
  max: 'app.common.validation.tooLong',
  url: 'app.common.validation.invalidUrl',
  email: 'app.common.validation.invalidEmail',
  phone: 'app.common.validation.invalidPhone',
  regex: 'app.common.validation.regexMismatch',
  invalidUrl: 'app.common.validation.invalidUrl',
  invalidEmail: 'app.common.validation.invalidEmail',
  invalidPhone: 'app.common.validation.invalidPhone',
  invalidUrlProtocol: 'app.common.validation.invalidUrlProtocol',
  invalidRegexPattern: 'app.common.validation.invalidRegexPattern',
};

export function autoErrorLabelKey(configKey: string, rule: string): string {
  if (GENERIC_ERROR_KEYS[rule]) {
    return GENERIC_ERROR_KEYS[rule];
  }
  const key = configKey.trim() || 'my_custom_setting';
  return `system.settings.config.auth.${key}.errors.${rule}`;
}

// ─── Default limits ──────────────────────────────────────────────

/**
 * Default max length for string-based config types (string, text, secret, url, json).
 * 65535 = practical cross-system limit (MySQL TEXT field size).
 * Ensures config values stay portable across database engines and integrations.
 * The BE `value` column is PostgreSQL `text` (unlimited), but other systems
 * (MySQL, external APIs, message queues) may have smaller limits.
 */
export const DEFAULT_MAX_LENGTH = 65535;

// ─── Built-in values_source registry ─────────────────────────────

export interface ValuesSourceDefinition {
  /** Source identifier stored in type_config.values_source */
  id: string;
  /** i18n key for the dropdown label in the builder UI */
  label_key: string;
  /** Default value_field for this source */
  value_field: string;
  /** Default label_field for this source */
  label_field: string;
}

/**
 * Registry of built-in values_source options for single_select / multi_select.
 * The FE loads the actual data at render time (e.g. getAllCurrencies()).
 * Extensible: add new sources here (countries, languages, timezones, etc.).
 */
export const BUILTIN_VALUES_SOURCES: ValuesSourceDefinition[] = [
  { id: 'currencies', label_key: 'system.settings.config.typeConfig.valuesSource.currencies', value_field: 'code', label_field: 'name' },
  { id: 'ai_models', label_key: 'system.settings.config.typeConfig.valuesSource.ai_models', value_field: 'id', label_field: 'label_key' },
];
