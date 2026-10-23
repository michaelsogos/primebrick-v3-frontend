# Devin Rule: Entity Page Titles — single source of truth

## Trigger
- Applies to every page that renders an entity list, create, or edit view
  (H1, `<title>`, breadcrumbs, generated docs).

## Canonical doc
**`docs/ai/page-title-standard.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST use `entityPageTitle()` for every entity list/create/edit
  title — H1, `<title>`, breadcrumbs.
- AI agent MUST NOT add new per-entity page-title translation keys.
- AI agent MUST keep `{entity_plural}`/`{entity_singular}` placeholders in
  the template values when editing translations.
