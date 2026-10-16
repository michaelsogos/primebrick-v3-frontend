# Devin Rule: Entity Page Titles — single source of truth

## Trigger
- Applies to every page that renders an entity list, create, or edit view
  (H1, `<title>`, breadcrumbs, generated docs).

## Golden rule

Entity page titles come **only** from the generic interpolable translation
templates `system.entities.page_title.{list|create|edit}`:

| Kind | en-GB | it-IT |
|------|-------|-------|
| list | `{entity_plural} List` | `Lista {entity_plural}` |
| create | `Create {entity_singular}` | `Crea {entity_singular}` |
| edit | `Edit {entity_singular}` | `Modifica {entity_singular}` |

`{entity_plural}` / `{entity_singular}` are replaced at runtime with
`$t('system.entities.<translation_key>.plural|singular')`. Word order is
per-language — NEVER hardcode `" List"`, `"Create "`, or `"Edit "` suffixes
or prefixes in code.

## How to use

Always resolve titles through the shared helper in
`src/lib/utils/entity-meta.ts`:

```ts
import { entityPageTitle } from '$lib/utils/entity-meta';

// pages that load entity metadata
<h1>{entityPageTitle(meta, 'list', $t)}</h1>

// pages without metadata — pass the bare translation_key
<h1>{entityPageTitle('role_mapping', 'create', $t)}</h1>
```

The same helper feeds `<title>` and breadcrumb segments. On record (edit)
pages the record's display name belongs in the breadcrumb last segment,
not in the H1 — the H1 stays `Edit {entity_singular}`.

## Forbidden

- ❌ Per-entity title keys like `settings.users.create.title`,
  `settings.roles.createTitle`, `entities.<e>.create.title` — these were
  soft-deleted from `system.translations` (see BE
  `db-meta/fire-and-forget/add_page_title_translations.sql`).
- ❌ Composed titles like `${t(plural)} list` or `"Create " + singular`.
- ❌ `$t('system.settings.tabs.*')` as a page H1 — `tabs.*` keys are
  navigation labels (menus, tabs, breadcrumb to the section), a different
  context from the page title.

## Enforcement

- AI agent MUST use `entityPageTitle()` for every entity list/create/edit
  title — H1, `<title>`, breadcrumbs.
- AI agent MUST NOT add new per-entity page-title translation keys.
- AI agent MUST keep `{entity_plural}`/`{entity_singular}` placeholders in
  the template values when editing translations.
