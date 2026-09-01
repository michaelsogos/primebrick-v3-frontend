/**
 * JSON-to-Zod builder for config entries.
 *
 * Reads `type_config.validation` from each ConfigEntry and builds a dynamic
 * Zod schema. The schema is used by sveltekit-superforms in ConfigList to
 * validate all entries as a single form.
 *
 * The validation rules shape is defined in the SDK (`ConfigValidation` interface)
 * and stored in the DB as a JSON string inside `type_config`.
 *
 * Error messages use the `error_label_key` from each rule — these are i18n
 * translation keys resolved by the FE.
 */
import { z } from 'zod';
import type { ConfigEntry, ConfigEntryType } from '$lib/api-types';

/**
 * Parsed validation rules from type_config JSON.
 * Mirrors the SDK's ConfigValidation interface.
 */
interface ConfigValidation {
  required: boolean;
  required_error_label_key?: string;
  rules: {
    min?: { value: number; error_label_key: string };
    max?: { value: number; error_label_key: string };
    url?: { protocols: string[]; error_label_key: string };
    email?: { error_label_key: string };
    regex?: { pattern: string; error_label_key: string };
  };
}

/**
 * Parse type_config JSON and extract the validation config.
 */
function extractValidation(type_config?: string | null): ConfigValidation | null {
  if (!type_config) return null;
  try {
    const parsed = JSON.parse(type_config) as Record<string, unknown>;
    const validation = parsed.validation;
    if (!validation || typeof validation !== 'object') return null;
    return validation as unknown as ConfigValidation;
  } catch {
    return null;
  }
}

/**
 * Build a Zod schema for a config value based on its type and validation rules.
 *
 * Extracted from buildEntrySchema for reuse in the create page's superRefine,
 * where only `type` and `type_config` are known (no full ConfigEntry object).
 *
 * For `secret` type: empty string is valid (means "leave unchanged").
 * For other types: if `required: true`, empty string is invalid.
 */
export function buildConfigValueSchema(
  type: ConfigEntryType,
  type_config?: string | null,
): z.ZodTypeAny {
  const validation = extractValidation(type_config);

  // Base schema: all config values are strings (DB stores everything as text)
  let schema: z.ZodString = z.string();

  // Required check — all types including secrets
  if (validation?.required) {
    const requiredKey = validation.required_error_label_key ?? 'validation.required';
    schema = schema.min(1, { message: requiredKey });
  }

  // Type-specific base validation
  if (type === 'integer') {
    schema = schema.regex(/^-?\d+$/, { message: 'validation.invalidInteger' });
  } else if (type === 'number') {
    schema = schema.regex(/^-?\d*\.?\d+$/, { message: 'validation.invalidNumber' });
  } else if (type === 'boolean') {
    schema = schema.regex(/^(true|false)$/, { message: 'validation.invalidBoolean' });
  } else if (type === 'url') {
    schema = schema.refine((val) => {
      if (!val) return true; // required handled above
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }, { message: 'validation.invalidUrl' });
  } else if (type === 'json') {
    schema = schema.refine((val) => {
      if (!val) return true;
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    }, { message: 'validation.invalidJson' });
  }

  // Apply validation rules from type_config.validation
  if (validation?.rules) {
    const rules = validation.rules;

    // min: for strings = length, for integer/number = numeric value
    if (rules.min) {
      const minVal = rules.min.value;
      const minKey = rules.min.error_label_key;
      const minMsg = `${minKey}|{"min": ${minVal}}`;
      if (type === 'integer' || type === 'number') {
        schema = schema.refine((val) => {
          if (!val) return true;
          return Number(val) >= minVal;
        }, { message: minMsg });
      } else {
        schema = schema.min(minVal, { message: minMsg });
      }
    }

    // max: for strings = length, for integer/number = numeric value
    if (rules.max) {
      const maxVal = rules.max.value;
      const maxKey = rules.max.error_label_key;
      const maxMsg = `${maxKey}|{"max": ${maxVal}}`;
      if (type === 'integer' || type === 'number') {
        schema = schema.refine((val) => {
          if (!val) return true;
          return Number(val) <= maxVal;
        }, { message: maxMsg });
      } else {
        schema = schema.max(maxVal, { message: maxMsg });
      }
    }

    // URL protocol validation
    if (rules.url) {
      const protocols = rules.url.protocols;
      const urlKey = rules.url.error_label_key;
      schema = schema.refine((val) => {
        if (!val) return true;
        try {
          const url = new URL(val);
          const protocol = url.protocol.replace(/:$/, '');
          return protocols.includes(protocol);
        } catch {
          return false;
        }
      }, { message: urlKey });
    }

    // Email validation
    if (rules.email) {
      const emailKey = rules.email.error_label_key;
      schema = schema.refine((val) => {
        if (!val) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
      }, { message: emailKey });
    }

    // Regex validation
    if (rules.regex) {
      const pattern = rules.regex.pattern;
      const regexKey = rules.regex.error_label_key;
      let regex: RegExp;
      try {
        regex = new RegExp(pattern);
      } catch {
        // Invalid pattern — skip regex validation
        return schema;
      }
      schema = schema.refine((val) => {
        if (!val) return true;
        return regex.test(val);
      }, { message: regexKey });
    }
  }

  return schema;
}

/**
 * Build a Zod schema for a single config entry based on its type and validation rules.
 * Delegates to buildConfigValueSchema with the entry's type and type_config.
 */
function buildEntrySchema(entry: ConfigEntry): z.ZodTypeAny {
  return buildConfigValueSchema(entry.type, entry.type_config);
}

/**
 * Build a Zod object schema for all config entries.
 * Keys are entry UUIDs, values are the per-entry schemas.
 *
 * Used by sveltekit-superforms in ConfigList to validate the entire form.
 */
export function buildConfigFormSchema(entries: ConfigEntry[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const entry of entries) {
    shape[entry.uuid] = buildEntrySchema(entry);
  }
  return z.object(shape);
}

/**
 * Build initial form data from config entries.
 * Returns a record of { [uuid]: value } for superForm initialization.
 */
export function buildConfigFormInitialValues(entries: ConfigEntry[]): Record<string, string> {
  const data: Record<string, string> = {};
  for (const entry of entries) {
    data[entry.uuid] = entry.value ?? '';
  }
  return data;
}
