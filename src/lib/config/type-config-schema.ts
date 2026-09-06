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

export interface ConfigValidation {
  required: boolean;
  required_error_label_key?: string;
  /** If true, numeric values are unsigned (no sign chars, default min=0). */
  unsigned?: boolean;
  rules: {
    min?: { value: number; error_label_key?: string };
    max?: { value: number; error_label_key?: string };
    url?: { protocols: string[]; error_label_key?: string };
    email?: { error_label_key?: string };
    regex?: { pattern: string; error_label_key?: string };
  };
}

// ─── Parsed type_config (union of all possible fields) ──────────

export interface ParsedTypeConfig {
  // Validation (all types)
  validation?: ConfigValidation;
  // Money
  currency?: string;
  allowed_currencies?: string[];
  // Badge
  values?: Record<string, { label_key?: string; color?: string }>;
  // single_select / multi_select
  values_source?: string;
  api_url?: string;
  api_verb?: string;
  value_field?: string;
  label_field?: string;
}

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
  invalidUrl: 'app.common.validation.invalidUrl',
  invalidEmail: 'app.common.validation.invalidEmail',
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
];
