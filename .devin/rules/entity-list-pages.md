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
1. Create a BE entity-meta endpoint (`GET /api/v1/entities/{entity}/meta`) returning a meta JSON typed `EntityMeta` (see `src/http/entity-meta.types.ts` on the BE and `.devin/rules/entity-meta-schema.md` for the canonical anatomy — root `columns`, optional `table`, root `actions`/`actions_overrides`, required `display_field`). The meta MUST include the derived `actions` array (`deriveEntityActions` on the BE emits every standard op, `enabled: false` when the route is absent).
2. Create a BE paged list endpoint (`GET /api/v1/entities/{entity}/list`) using the DAL generic `findByPage` helper.
3. In the FE `+page.svelte`, fetch meta + list, build columns via `orderedColumns(meta?.columns)` (sticky → normal → audited groups derive from column flags + `order`), and wire `EntityListTable` with `entity="{entity}"`, `uid="{uid}"`, `entityActions={meta?.actions}`, `entityCustomActions={meta?.table?.row_custom_actions}`, `defaultView={meta?.table?.default_view}`, `defaultSort={meta?.table?.default_sort}`, `pageSizeOptions={meta?.table?.page_size_options}` and the standard event handlers (see `users/+page.svelte` for the canonical pattern).
4. The default "all fields" search sends `search_in` = visible ∩ searchable text columns — hidden-by-default columns (e.g. `uuid`) are excluded until shown or explicitly selected in the scope selector.
5. Do NOT create custom `Table`/`Skeleton`/delete‑dialog markup — `EntityListTable` provides all of these.

## CTA gating contract (meta.actions — MANDATORY)

`EntityListTable` gates every CTA (row actions, bulk actions, create) against
`meta.actions` **fail-closed**: the served array always contains the full
standard vocabulary, and `enabled: false` (route absent or product-disabled)
hides the op for everyone. Per-user enablement is
evaluated against `userProfileStore.permissions` (populated from
`GET /api/v1/auth/me`). There is NO parallel row-action boolean map —
`meta.actions` is the single capability/visibility mechanism; table-specific
custom CTAs come from `meta.table.row_custom_actions`.

- AI agent MUST pass `entityActions={meta?.actions}` to `EntityListTable`.
- Any CTA rendered OUTSIDE `EntityListTable` (e.g. a page-level
  `<Button href="/entity/new">`) MUST be gated with
  `isEntityOpAllowed(meta?.actions, 'create.single')` from
  `$lib/permissions.svelte` — page-level buttons bypass the table's internal
  gating (this was the `customers/+page.svelte` Nuovo bug).
- `EntityAction.sentinel` values are the BE strings verbatim:
  `_public`, `_authenticated_user`, `_authenticated_admin`.

## Exceptions
Introducing a new list layout that does NOT use `EntityListTable` requires explicit user approval in the plan step. The approval must document why `EntityListTable` is insufficient.

## Enforcement
- AI agent MUST use `EntityListTable` for any new entity list page.
- AI agent MUST NOT create custom table markup for entity list pages.
- AI agent MUST flag any existing custom table list page as a candidate for migration to `EntityListTable`.
