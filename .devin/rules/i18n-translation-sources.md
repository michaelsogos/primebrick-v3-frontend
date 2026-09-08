# Devin Rule: i18n Translation Sources

## Trigger
- Applies whenever an AI agent adds, modifies, or removes translation keys
- Applies to ALL i18n keys used in FE components, composables, and routes

## Golden Rules

### 1. ALL translations are owned by the BE
The backend is the single source of truth for ALL translations across ALL
languages. When adding a new user-facing label, the translation key and
value MUST be added to the BE's translation system.

### 2. FE fallback is ONLY for `app.*` keys
The FE fallback file (`src/lib/i18n/messages/en-GB-fallback.json`) contains
**English-only** translations for keys in the `app.*` namespace. These are
keys needed before authentication (login, welcome, error pages, public
routes) when the BE is unreachable.

- ✅ Add `app.*` keys to `en-GB-fallback.json` (English only)
- ❌ Do NOT add `system.*`, `entities.*`, `shell.*` keys to the fallback
- ❌ Do NOT add non-English translations to the fallback

### 3. FE fallback is English-only
Never add Italian, French, German, Spanish, or Portuguese translations to
`en-GB-fallback.json`. The fallback exists solely for the "BE unreachable"
scenario and English is the universal fallback.

### 4. When adding a new label
1. Add the translation key to the BE translation system (all languages)
2. If the key is under `app.*`, also add it to `en-GB-fallback.json`
3. If the key is NOT under `app.*`, do NOT add it to the fallback
4. Use `$t('key')` in the component — never hardcode user-facing text

### 5. When removing a label
1. Remove the `$t('key')` call from the component
2. Remove the key from `en-GB-fallback.json` if it was an `app.*` key
3. The BE translation can be removed separately (BE-owned)

## Enforcement
- AI agent MUST add all new translation keys to the BE.
- AI agent MUST add `app.*` keys to `en-GB-fallback.json` (English only).
- AI agent MUST NOT add non-`app.*` keys to `en-GB-fallback.json`.
- AI agent MUST NOT add non-English translations to `en-GB-fallback.json`.
- AI agent MUST NOT hardcode user-facing text in components.
- AI agent MUST use `$t('key')` for all user-facing strings.
