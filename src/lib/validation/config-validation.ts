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
 *
 * CONGRUENCE: This file mirrors the SDK `config-validator.ts` logic.
 * Both use the same regexes, same error keys (`app.common.validation.*`),
 * same type guards, and same behavior on invalid regex patterns (throw).
 */
import { z } from 'zod';
import { parsePhoneNumber } from 'libphonenumber-js';
import type { ConfigEntry, ConfigEntryType } from '$lib/api-types';
import { extractValidation, parseTypeConfig } from '$lib/config/type-config-schema';
import type { ConfigValidation } from '$lib/config/type-config-schema';

/**
 * Basic email regex — RFC 5322 simplified. Same as SDK.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * String-derived types that support min/max (string length) and regex validation.
 * Must match the SDK's `isStringDerived` set.
 */
const STRING_DERIVED_TYPES: ReadonlySet<ConfigEntryType> = new Set([
  'string', 'text', 'secret', 'url', 'email', 'phone',
]);

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
    const requiredKey = validation.required_error_label_key ?? 'app.common.validation.required';
    schema = schema.min(1, { message: requiredKey });
  }

  // Type-specific base validation
  // IMPORTANT: type checks skip empty values — empty is handled by the
  // required check above. This prevents double errors (required + invalidType)
  // and ensures empty values only trigger "required", not "invalid format".
  const isUnsigned = validation?.unsigned === true;
  if (type === 'bigint') {
    const bigintRegex = isUnsigned ? /^\d+$/ : /^-?\d+$/;
    const bigintMsg = isUnsigned ? 'app.common.validation.invalidBigintUnsigned' : 'app.common.validation.invalidBigint';
    schema = schema.refine((val) => val === '' || bigintRegex.test(val), { message: bigintMsg });
  } else if (type === 'number' || type === 'money') {
    const numRegex = isUnsigned ? /^\d*\.?\d+$/ : /^-?\d*\.?\d+$/;
    const numMsg = isUnsigned ? 'app.common.validation.invalidNumberUnsigned' : 'app.common.validation.invalidNumber';
    schema = schema.refine((val) => val === '' || numRegex.test(val), { message: numMsg });
  } else if (type === 'boolean') {
    schema = schema.refine((val) => val === '' || /^(true|false)$/.test(val), { message: 'app.common.validation.invalidBoolean' });
  } else if (type === 'url') {
    schema = schema.refine((val) => {
      if (!val) return true; // required handled above
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }, { message: 'app.common.validation.invalidUrl' });
  } else if (type === 'email') {
    schema = schema.refine((val) => {
      if (!val) return true;
      return EMAIL_REGEX.test(val);
    }, { message: 'app.common.validation.invalidEmail' });
  } else if (type === 'phone') {
    // Full validation via libphonenumber-js — same library and logic as SDK.
    const parsedConfig = parseTypeConfig(type_config);
    const country = parsedConfig?.country;
    schema = schema.refine((val) => {
      if (!val) return true;
      try {
        const phoneNumber = country
          ? parsePhoneNumber(val, country as any)
          : parsePhoneNumber(val);
        return phoneNumber?.isValid() ?? false;
      } catch {
        return false;
      }
    }, { message: 'app.common.validation.invalidPhone' });
  } else if (type === 'json') {
    schema = schema.refine((val) => {
      if (!val) return true;
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    }, { message: 'app.common.validation.invalidJson' });
  }

  // Apply validation rules from type_config.validation
  if (validation?.rules) {
    const rules = validation.rules;
    const isStringDerived = STRING_DERIVED_TYPES.has(type);

    // min: for bigint = BigInt comparison; for number/money = numeric value; for strings = length
    if (rules.min) {
      const minVal = rules.min.value;
      const minKey = rules.min.error_label_key;
      const minMsg = `${minKey}|{"min": ${minVal}}`;
      if (type === 'bigint') {
        // Use BigInt() — not Number() — to preserve precision > 2^53.
        // Same logic as SDK.
        schema = schema.refine((val) => {
          if (!val) return true;
          try {
            return BigInt(val) >= BigInt(minVal);
          } catch {
            return false;
          }
        }, { message: minMsg });
      } else if (type === 'number' || type === 'money') {
        schema = schema.refine((val) => {
          if (!val) return true;
          return Number(val) >= minVal;
        }, { message: minMsg });
      } else if (isStringDerived) {
        schema = schema.min(minVal, { message: minMsg });
      }
    } else if (isUnsigned && (type === 'bigint' || type === 'number' || type === 'money')) {
      // No explicit min rule, but unsigned → default min=0
      schema = schema.refine((val) => {
        if (!val) return true;
        return Number(val) >= 0;
      }, { message: 'app.common.validation.unsigned' });
    }

    // max: for bigint = BigInt comparison; for number/money = numeric value; for strings = length
    if (rules.max) {
      const maxVal = rules.max.value;
      const maxKey = rules.max.error_label_key;
      const maxMsg = `${maxKey}|{"max": ${maxVal}}`;
      if (type === 'bigint') {
        // Use BigInt() — not Number() — to preserve precision > 2^53.
        // Same logic as SDK.
        schema = schema.refine((val) => {
          if (!val) return true;
          try {
            return BigInt(val) <= BigInt(maxVal);
          } catch {
            return false;
          }
        }, { message: maxMsg });
      } else if (type === 'number' || type === 'money') {
        schema = schema.refine((val) => {
          if (!val) return true;
          return Number(val) <= maxVal;
        }, { message: maxMsg });
      } else if (isStringDerived) {
        schema = schema.max(maxVal, { message: maxMsg });
      }
    }

    // URL protocol validation (deprecated — use type_config.allowed_protocols instead)
    // Still validated for type === "url" for backward compatibility.
    if (rules.url && type === 'url') {
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

    // Email validation (deprecated — use TYPE "email" instead)
    // Still validated for type === "email" for backward compatibility.
    if (rules.email && type === 'email') {
      const emailKey = rules.email.error_label_key;
      schema = schema.refine((val) => {
        if (!val) return true;
        return EMAIL_REGEX.test(val);
      }, { message: emailKey });
    }

    // Regex validation — applies to string-derived types.
    // Invalid regex pattern is a configuration error: throw in both FE and BE.
    // Invalid pattern errors ALWAYS use invalidRegexPattern (not the custom rule key).
    // Mismatch errors use the custom rule key, falling back to regexMismatch.
    if (rules.regex && isStringDerived) {
      const pattern = rules.regex.pattern;
      const regexKey = rules.regex.error_label_key;
      const flags = rules.regex.flags ?? '';
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags);
      } catch {
        // Invalid regex pattern — configuration error, must fail consistently
        // with SDK (which also throws). Do NOT silently skip.
        // Always use the invalid-pattern key, even if a custom regex error key is configured.
        schema = schema.refine(() => false, { message: 'app.common.validation.invalidRegexPattern' });
        return schema;
      }
      schema = schema.refine((val) => {
        if (!val) return true;
        return regex.test(val);
      }, { message: regexKey ?? 'app.common.validation.regexMismatch' });
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
export function buildConfigFormInitialValues(entries: ConfigEntry[]): Record<string, string | bigint | number> {
  const data: Record<string, string | bigint | number> = {};
  for (const entry of entries) {
    data[entry.uuid] = entry.value ?? '';
  }
  return data;
}
