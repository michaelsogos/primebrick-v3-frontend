# Devin Rule: i18n Translation Sources

## Trigger
- Applies whenever an AI agent adds, modifies, or removes translation keys
- Applies to ALL i18n keys used in FE components, composables, and routes

## Canonical doc
**`docs/ai/i18n-translation-sources.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST add all new translation keys to the BE.
- AI agent MUST add `app.*` keys to `en-GB-fallback.json` (English only).
- AI agent MUST NOT add non-`app.*` keys to `en-GB-fallback.json`.
- AI agent MUST NOT add non-English translations to `en-GB-fallback.json`.
- AI agent MUST NOT hardcode user-facing text in components.
- AI agent MUST use `$t('key')` for all user-facing strings.
