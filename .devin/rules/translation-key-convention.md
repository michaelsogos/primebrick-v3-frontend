# Devin Rule: Translation Key Convention — snake_case singular

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

Every meta object MUST include a `translationKey` field alongside `entity`:

```ts
export const roleMappingsMeta = {
  entity: "role_mappings",           // snake_case plural — used for API URLs
  translationKey: "role_mapping",    // snake_case singular — used for i18n keys
  titleKey: "entities.role_mapping.title",
  list: {
    columns: [
      { key: "idp_role", labelKey: "entities.role_mapping.fields.idp_role", ... },
    ],
  },
} as const;
```

- `entity`: snake_case **singular** (API URL path, e.g. `/api/v1/entities/role_mapping`)
- `translationKey`: snake_case singular (i18n key prefix, e.g. `entities.role_mapping.*`)

**Note:** The `entity` field was previously plural in some meta files
(`role_mappings`, `user_profiles`, `config_entries`). The new standard is
**singular** for both `entity` and `translationKey`. Existing plural meta
files will be renamed in a separate PR.

All `labelKey`, `titleKey`, `tooltip`, `tooltipTitle` values MUST use the `translationKey` as the entity segment.

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

The `EntityListTable` component accepts a `translationKey` prop that defaults to `entity`. Pages MUST pass `meta.translationKey` when available.

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
- AI agent MUST include `translationKey` in every new BE meta file.
- AI agent MUST pass `translationKey` from meta to `EntityListTable` in every new entity list page.
- AI agent MUST NOT use camelCase or PascalCase in translation key entity segments.
- AI agent MUST NOT use snake_case plural in translation key entity segments.
- When reviewing existing code, flag any camelCase or plural entity segments in translation keys as violations.
