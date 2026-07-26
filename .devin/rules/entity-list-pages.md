# Devin Rule: Entity List Pages Must Use EntityListTable

## Trigger
- Applies whenever a new settings or module page that lists entity rows is created or modified.
- Applies to any page under `src/routes/(app)/` that displays a paginated, sortable, filterable list of entity records.

## Rule
Any settings or module page that lists entity rows MUST use the `EntityListTable` component from `$lib/components/entity-list-table`.

This includes:
- Customer list pages
- Organization list pages
- User list pages
- Role mapping list pages
- Any future entity list page

## Rationale
`EntityListTable` provides the standard Primebrick list UX: paging, sorting, filtering, column visibility, row selection, row actions (edit/delete/duplicate/preview/restore), loading/empty/error states, and sync channel integration. Building a custom table per page duplicates this logic and creates inconsistent UX.

## How to comply
1. Create a BE entity-meta endpoint (`GET /api/v1/entities/{entity}/meta`) returning the meta JSON (see `organizations.meta.ts` for the pattern).
2. Create a BE paged list endpoint (`GET /api/v1/entities/{entity}/list`) using the DAL generic `findByPage` helper.
3. In the FE `+page.svelte`, fetch meta + list, build columns via `orderedColumnsFromListMeta`, and wire `EntityListTable` with `entity="{entity}"`, `uid="{uid}"`, and the standard event handlers (see `users/+page.svelte` for the canonical pattern).
4. Do NOT create custom `Table`/`Skeleton`/delete‑dialog markup — `EntityListTable` provides all of these.

## Exceptions
Introducing a new list layout that does NOT use `EntityListTable` requires explicit user approval in the plan step. The approval must document why `EntityListTable` is insufficient.

## Enforcement
- AI agent MUST use `EntityListTable` for any new entity list page.
- AI agent MUST NOT create custom table markup for entity list pages.
- AI agent MUST flag any existing custom table list page as a candidate for migration to `EntityListTable`.
