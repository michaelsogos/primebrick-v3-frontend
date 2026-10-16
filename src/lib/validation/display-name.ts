/**
 * Shared validation helpers for display_name and idp_name/idp_username fields.
 *
 * These fields are Casdoor identifiers or human-readable names that must:
 * - be at least 3 characters
 * - be at most 255 characters (DB varchar(255) limit)
 * - start and end with an alphanumeric character (no leading/trailing spaces or special chars)
 */
import { z } from 'zod';
import { minMsg, maxMsg } from '$lib/validation/zod-messages';

/**
 * Returns true if the value starts and ends with an alphanumeric character.
 * Empty strings pass (handled by required/min validators).
 */
export function startsAndEndsWithAlphanumeric(value: string): boolean {
  if (!value || value.length === 0) return true; // Skip empty (handled by required)
  const firstChar = value[0];
  const lastChar = value[value.length - 1];
  const alphanumericRegex = /^[a-z0-9]$/i;
  return alphanumericRegex.test(firstChar) && alphanumericRegex.test(lastChar);
}

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 255;

export const IDP_NAME_MIN = 3;
export const IDP_NAME_MAX = 255;

/**
 * Apply to a z.string() chain for display_name fields:
 *   display_name: displayNameSchema(z.string())
 */
export function displayNameSchema(base: z.ZodString) {
  return base
    .min(DISPLAY_NAME_MIN, { message: minMsg(DISPLAY_NAME_MIN) })
    .max(DISPLAY_NAME_MAX, { message: maxMsg(DISPLAY_NAME_MAX) })
    .refine(startsAndEndsWithAlphanumeric, { message: 'app.common.validation.invalidFormat' });
}

/**
 * Apply to a z.string() chain for idp_name / idp_username fields:
 *   idp_name: idpNameSchema(z.string())
 */
export function idpNameSchema(base: z.ZodString) {
  return base
    .min(IDP_NAME_MIN, { message: minMsg(IDP_NAME_MIN) })
    .max(IDP_NAME_MAX, { message: maxMsg(IDP_NAME_MAX) })
    .refine(startsAndEndsWithAlphanumeric, { message: 'app.common.validation.invalidFormat' });
}
