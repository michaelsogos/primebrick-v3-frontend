/**
 * Helpers for building Zod custom messages with encoded translation params.
 *
 * Format: `translationKey|jsonParams`
 * Parsed by `translated-field-errors.svelte` → `$t(key, JSON.parse(params))`
 *
 * These are pure string builders — no centralized validation logic.
 * A new module can use the `key|json` convention directly without importing this file.
 */
export const minMsg = (n: number): string => `validation.tooShort|{"min": ${n}}`;
export const maxMsg = (n: number): string => `validation.tooLong|{"max": ${n}}`;
