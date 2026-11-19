/**
 * Helpers for building Zod custom messages with encoded translation params.
 *
 * Format: `translationKey|jsonParams`
 * Parsed by `translated-field-errors.svelte` → `$t(key, JSON.parse(params))`
 *
 * These are pure string builders — no centralized validation logic.
 * A new module can use the `key|json` convention directly without importing this file.
 * Keys MUST be the seeded `app.common.validation.*` vocabulary (snake_case).
 */
export const minMsg = (n: number): string => `app.common.validation.too_short|{"min": ${n}}`;
export const maxMsg = (n: number): string => `app.common.validation.too_long|{"max": ${n}}`;
