# Devin Rule: Translation Key Convention — snake_case singular

> Canonical body of `.devin/rules/translation-key-convention.md` — the rule file is a pointer to this page.

## Trigger
- Applies to ALL translation keys in BE meta files, FE locale JSON files, and FE code that constructs dynamic i18n keys.

## Golden Rule

**Translation key entity names MUST be `snake_case` singular.**

- ✅ `entities.user_profile.fields.idp_code`
- ✅ `entities.role_mapping.fields.idp_role`
- ✅ `entities.organization.fields.display_name`
- ✅ `entities.customer.fields.code`
- ❌ `entities.userProfile.fields.idp_code` (camelCase)
- ❌ `entities.user_profiles.fields.idp_code` (snake_case plural)
- ❌ `entities.RoleMapping.fields.idp_role` (PascalCase)
- ❌ `entities.roleMapping.fields.idp_role` (camelCase)

## Where this applies

### 1. BE meta files (`*.meta.ts`)

Every meta object MUST be typed `EntityMeta` and include `translation_key` alongside `entity` and `display_field` (see `.devin/rules/entity-meta-schema.md` on the BE for the full canonical anatomy):

```ts
export const roleMappingsMeta: EntityMeta = {
  entity: "role_mapping",            // snake_case singular — used for API URLs
  translation_key: "role_mapping",   // snake_case singular — used for i18n keys
  title_key: "entities.role_mapping.title",
  display_field: "idp_role",
  columns: [
    { key: "idp_role", label_key: "entities.role_mapping.fields.idp_role", type: "text", order: 0, ... },
  ],
};
```

- `entity`: snake_case **singular** (API URL path, e.g. `/api/v1/entities/role_mapping`)
- `translation_key`: snake_case singular (i18n key prefix, e.g. `entities.role_mapping.*`)

**Note:** The `entity` field was previously plural in some meta files
(`role_mappings`, `user_profiles`, `config_entries`). The new standard is
**singular** for both `entity` and `translation_key`. Existing plural meta
files will be renamed in a separate PR.

All `label_key`, `title_key`, `tooltip`, `tooltip_title` values MUST use the `translation_key` as the entity segment.

### 2. FE locale files (`*.json`)

The `entities` object MUST use snake_case singular keys:

```json
{
  "entities": {
    "user_profile": {
      "title": "Users",
      "singular": "User",
      "plural": "Users",
      "fields": { "idp_code": "IDP Code", ... }
    },
    "role_mapping": {
      "title": "Role Mappings",
      "fields": { "idp_role": "IDP Role", ... }
    }
  }
}
```

### 3. FE dynamic key construction

Code that builds translation keys from the entity name MUST use `translationKey` (not `entity`):

```ts
// ✅ Correct — uses translationKey (snake_case singular)
$t(`entities.${translationKey}.plural`)
$t(`entities.${translationKey}.fields.${field}`)

// ❌ Wrong — uses entity (snake_case plural, breaks for user_profiles/role_mappings)
$t(`entities.${entity}.plural`)
$t(`entities.${entity}.fields.${field}`)
```

The `EntityListTable` component accepts a `translationKey` prop that defaults to `entity`. Pages MUST pass `meta.translation_key` when available.

### 4. FE hardcoded keys

Hardcoded translation keys in components MUST use snake_case singular:

```ts
// ✅
$t('entities.user_profile.fields.is_admin')

// ❌
$t('entities.userProfile.fields.is_admin')
$t('entities.user_profiles.fields.is_admin')
```

## Enforcement

- AI agent MUST use snake_case singular for all translation key entity segments.
- AI agent MUST include `translation_key` in every new BE meta file.
- AI agent MUST pass `translationKey` from meta to `EntityListTable` in every new entity list page.
- AI agent MUST NOT use camelCase or PascalCase in translation key entity segments.
- AI agent MUST NOT use snake_case plural in translation key entity segments.
- When reviewing existing code, flag any camelCase or plural entity segments in translation keys as violations.

## Dict `label_key` — the convention-suggestion contract

`TranslationKeyCell` (entity-dict-page) offers the computed key
`custom.entities.<translation_key>.rows.<slug(code)>` — `custom.*` is the
only user-writable namespace. The cell MUST mirror the config-entry-create
pattern (`create/+page.svelte`, `ValidationRulesSection`) exactly:

- **`placeholder` / `searchPlaceholder`** — the FULL computed leaf key
  `custom.entities.<tk>.rows.<code>`, with `my_custom_code` as the sample
  leaf while code is empty (same idiom as `my_custom_setting`).
- **`defaultSearch`** — the prefix INCLUDING the key segment:
  `entities.<tk>.rows.<code|sample>` — pre-filters to THIS code's keys and
  the Create row offers that same scoped path.
- **The suggestion is the ASSIGNED value, not a placeholder** — while the
  composer has no explicit `label_key`, the computed key is committed via
  `onchange` (tracking the code: a previous suggestion is replaced on
  change, an explicit pick or manual clear is respected). The real value
  renders the created-value chip with the `app.common.new` marker and
  activates the translate CTA; the suggestion never enters `options`.
- **`handleChange`** — namespaced `*.entities.*` keys pass verbatim; the
  namespace-less seed `entities.<tk>.rows.<leaf>` maps to `custom.` + the
  path; free text maps to `custom.entities.<tk>.rows.<slug>`.
- **Save-time** — `EntityDictPage.saveAll` commits `suggestedKey` when
  `label_key` is left empty (real code only — never the sample).

`defaultSearch` must NEVER carry the bare `rows.` prefix: a non-empty
seeded search feeds the `allowCreate` row verbatim, producing a bogus
`Create "…rows."` offer that would commit the prefix as a key — and
`truncateFrom="start"` renders only the unreadable `…rows.` tail.
(See the ComboSelect `defaultSearch` contract in `@primebrick/ui`.)

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
