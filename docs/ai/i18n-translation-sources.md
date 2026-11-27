# Devin Rule: i18n Translation Sources

> Canonical body of `.devin/rules/i18n-translation-sources.md` — the rule file is a pointer to this page.

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

## Module dict loading (route → module → schema)

Authenticated pages get translations per-module, resolved **from the URL**:

1. `shellNav.resolveModuleFromRoute(pathname)` matches the path against each
   module's `route_prefixes` (BE `module-nav-meta.ts`, surfaced via
   `GET /api/v1/modules`).
2. The matched module id is passed to
   `GET /api/v1/system/translations/:module/:language`, where `:module` maps
   to a **DB schema** (`MODULE_ENTITIES` in BE `translations-dal.ts`):
   `app`→`public`, `system`/`settings`→`system`, `emailsender`→`emailsender`,
   `custom`→`custom`.

Consequences:

- Bootstrap loads the shared `CORE_DICT_MODULES` list — currently
  `['app', 'custom', 'system']` (single source: `src/lib/i18n/index.ts`,
  iterated in `src/routes/(app)/+layout.svelte`). Do not hardcode module
  names for bootstrap loading — extend `CORE_DICT_MODULES` instead.
- **A page outside every registered `route_prefix` gets NO module dict** —
  its keys render raw. Example: `/customers` was unrouted (the `crm` module
  is not registered in `service_registry`), so `crm.entities.customer.*`
  stayed untranslated until the page moved under `/crm/customers` (the crm
  root level — `part_of === code` collapses the namespace).
- The `settings` module claims `route_prefixes: ["/system/settings"]` → any
  page under `/system/settings/*` loads the `system` schema dict (`system.*`
  keys). A page under another module's root (`/system/job`, `/crm`) loads
  that module's dict instead.
- A registered module with no `MODULE_ENTITIES` mapping makes the dict fetch
  fail — module id must exist in both `service_registry` and the DAL map.

When creating a new page, verify: which module prefix owns its URL, and which
schema holds its keys. If they don't line up, either place the route under an
existing prefix or register a module + schema mapping on the BE.

## Deep dive

The normative rules live here; the full mechanics and rationale are in `docs/dev-guide/i18n.mdx` — link, do not duplicate.

## Never a phase 2 — translations are complete at birth or they are bugs

Every translation key is seeded for **all seven supported languages** (de-DE, en-GB, en-US, es-ES, fr-FR, it-IT, pt-PT) in the very same patch that introduces it — **never deferred** to a later phase, never partial, never "english for now, translate later". A missing row in any language is a bug, not a partial feature: the end user otherwise sees raw keys or foreign text in the UI. Gender and idiom are correct by construction because the seed carries the exact string per language — nothing is composed at runtime. If a translation is hard, write it anyway: an imperfect human-grade translation beats a raw key, and the fix is one UPDATE away.

## Related documents

The translations doctrine is one family — no single document is sufficient alone:

- `docs/ai/i18n.md` + `docs/dev-guide/i18n.mdx` (fe-v3) — FE consumption rules, UiLang ↔ dictionary parity, raw-key rendering
- `docs/ai/i18n-translation-sources.md` (fe-v3) — BE owns all translations; FE fallback is English-only `app.*` keys
- `docs/ai/translation-key-convention.md` (fe-v3, be-v3) — snake_case singular key naming
- `docs/ai/i18n-namespace-segregation.md` (be-v3, us-v3) — services seed their own schema, never public/system/custom
- `docs/ai/translations-cache-invalidation.md` (be-v3) — out-of-band writes require Redis invalidation
- `docs/dev-guide/translations.mdx` (be-v3, v3-sdk) — end-to-end authoring workflow: patch, sign, migrate
