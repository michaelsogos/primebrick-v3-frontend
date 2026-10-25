# Devin Rule: Entity Table Pages Must Use EntityTablePage

## Trigger
- Applies whenever a new settings or module page that resolves to a **table
  archetype** (paginated, sortable, filterable entity list) is created or
  modified.
- Applies to any page under `src/routes/(app)/` whose backend-resolved page
  metadata declares the table archetype (the current default).

## Canonical doc
**`docs/ai/entity-list-pages.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST use `EntityTablePage` for any new entity table page.
- AI agent MUST NOT create custom table markup or per-page
  fetch/meta/persistence logic for entity table pages.
- AI agent MUST flag any existing bespoke table page as a migration
  candidate.
- AI agent MUST NOT add parallel capability flags — `meta.actions` +
  `endpoint` is the contract.
