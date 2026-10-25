# Devin Rule: Entity Table Pages Must Use EntityTablePage

> Canonical body of `.devin/rules/entity-list-pages.md` — the rule file is a pointer to this page.

## Trigger
- Applies whenever a new settings or module page that resolves to a **table
  archetype** (paginated, sortable, filterable entity list) is created or
  modified.
- Applies to any page under `src/routes/(app)/` whose backend-resolved page
  metadata declares the table archetype (the current default).

## Rule
Any route that resolves to an entity table page MUST use the
`EntityTablePage` component from `$lib/components/entity-table-page`.
A migrated `+page.svelte` is ~50 lines: props + snippets only — no fetch
logic, no meta loading, no persistence wiring.

This includes:
- Customer / organization / user / role-mapping list pages
- Any future entity list page whose archetype is `table`

`EntityListTable` (from `$lib/components/entity-list-table`) is the INNER
component `EntityTablePage` drives — use it directly ONLY for composite or
non-standard hosts (see Exceptions).

## Rationale
`EntityTablePage` owns the full route-level shell — scaffold, breadcrumb,
title, header actions — and drives `useEntityList` (metadata loading +
globalThis-cached meta, rows, search gate + debounce, sorting, pagination,
filters, deletion mode, persistence, abort handling, connectivity recovery,
sync channels, RFC 7807 error notifications). `EntityListTable` renders
table/cards/cards-list. Duplicating that stack per page is what produced
the pre-merge drift (per-page search debounces, ad-hoc persistence keys,
missing deletion-filter params, lost sort restoration).

## How to comply
1. Create a BE entity-meta endpoint (`GET /api/v1/entities/{entity}/meta`)
   returning meta JSON typed `EntityMeta` (see `src/http/entity-meta.types.ts`
   on the BE and `.devin/rules/entity-meta-schema.md`). The meta MUST include
   the derived `actions` array — `deriveEntityActions` emits every standard
   op with `enabled: false` when the route is absent, plus `endpoint`
   `{method, path}` for each enabled op.
2. Create a BE paged list endpoint (`GET /api/v1/entities/{entity}/list`)
   using the DAL generic `findByPage` helper.
3. In the FE `+page.svelte`, render `EntityTablePage` with the page config —
   see `system/settings/users/+page.svelte` for the canonical minimal page:

```svelte
<script lang="ts">
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';

  type MyRow = { uuid: string } & Record<string, unknown>;
</script>

<EntityTablePage
  basePath="/api/v1/entities/my_entity"
  storageKeyPrefix="pb:my-entity:list:"
  syncChannel="primebrick_my_entity_sync"
  errorScopeKey="app.common.errors.scope.myEntitiesList"
  navStrategy="goto"
  createPath="/system/my-entity/create"
  editPath="/system/my-entity/:uuid"
>
  {#snippet breadcrumb()}
    <AppPageBreadcrumb segments={[{ label: 'My entities' }]} />
  {/snippet}
</EntityTablePage>
```

Key props: `basePath` (full entity API base incl. `/ws/<svc>` for module
entities), `storageKeyPrefix`, `navStrategy` (`goto` default | `popup`),
`createPath`/`editPath` (`:uuid` placeholder), `deletionFilter={false}`
for entities without audited `deleted_*` columns (e.g. `role_mapping`),
`fixedFilters`, `syncChannel`, `onRowsLoaded`, `customActionHandlers`,
`rowActions={false}` to hide the row-actions column, and the escape-hatch
snippets `breadcrumb`, `headerExtras`, `headerActions`, `cell`,
`extraDialogs`, `metaLoadingView`, `rowsLoadingView`, `emptyView`,
`errorView`.

4. The default "all fields" search sends `search_in` = visible ∩ searchable
   text columns — hidden-by-default columns are excluded until shown or
   explicitly selected.
5. Do NOT create custom `Table`/`Skeleton`/delete-dialog markup or
   hand-rolled fetch/persistence — `EntityTablePage` provides all of it.

## CTA gating contract (meta.actions — MANDATORY)

`EntityTablePage`/`EntityListTable` gate every CTA (row actions, bulk,
create) against `meta.actions` **fail-closed**: the served array always
contains the full standard vocabulary, and `enabled: false` hides the op
for everyone. Per-user enablement is evaluated against
`userProfileStore.permissions` (from `GET /api/v1/auth/me`). When no row
op is permitted the row-actions column is suppressed entirely — an empty
menu never renders. There is NO parallel row-action boolean map —
`meta.actions` is the single capability/visibility mechanism; table-specific
custom CTAs come from `meta.table.row_custom_actions` +
`customActionHandlers`.

- Any CTA rendered OUTSIDE the table (e.g. `headerActions` snippet with a
  page-level `<Button href="/entity/create">`) MUST be gated with
  `isEntityOpAllowed(meta?.actions, 'create.single')` from
  `$lib/permissions.svelte` — see `crm/customers/+page.svelte`.
- `EntityAction.sentinel` values are the BE strings verbatim:
  `_public`, `_authenticated_user`, `_authenticated_admin`.

### Op dispatch — declared endpoints (not conventions)

Write ops dispatch on the `endpoint` `{method, path}` declared per op in
`meta.actions` (e.g. `user_profile` writes live under `/api/v1/auth/users/*`,
NOT `/api/v1/entities/user_profile/*`). `entityApiBase(entity)` remains the
fallback convention when an op declares no endpoint. NEVER hand-build
`/entities/{entity}/{uuid}` URLs in page code — the per-op endpoint is the
source of truth (task 9b).

### Soft vs hard delete (automatic)

- `delete.single` enabled → soft delete via its declared endpoint
  (`DELETE …/:uuid?version=`).
- `purge.single` enabled (and `delete.single` disabled) → hard delete via
  `…/:uuid/purge?version=` automatically (`usePurgeDelete` in
  `useRowActions`) — e.g. `role_mapping`.
- `restore.single` enabled → restore CTA + deleted-filter toolbar; restore
  gating is independent of delete gating.
- No audited `deleted_at`/`deleted_by` columns → the toolbar toggle is
  hidden automatically (`hasSoftDelete` is meta-derived); also pass
  `deletionFilter={false}` so no `deleted_records` param is sent.

For non-table delete flows (e.g. a detail-page delete button) mirror the
same rule: pick `/purge` when `isEntityOpAllowed(actions, 'purge.single')`
is true and `'delete.single'` is false — see `useRoleMappings.remove`.

## Toolbar segmented groups — icon-only standard (MANDATORY)

Every segmented button-group control in the list toolbar (filter presets
`display:"button_group"`, the deletion-filter toggle, the view-mode switch)
renders **icon-only** buttons: `size="icon-sm"`, NO visible label text —
the option's `icon` is the only visible affordance and MUST resolve via
`DynamicIcon`. Meaning is carried by the `title` tooltip (`tooltip_key`,
falling back to `label_key`) plus `aria-label`/`aria-pressed`. Exactly one
option is always pressed (`aria-pressed="true"`). `display:"combobox"`
variants MAY render icon + label + secondary description.

## Exceptions
- **Composite/module pages** — a page hosting several list instances or
  extra UI drives `useEntityList` + `EntityListTable` directly. Remote
  module-owned pages (e.g. the job service's `/system/job/job-schedules/create`
  schedule form, mounted via `mountPage`) are the standing example — the
  `/system/job/job-schedules`, `/system/job/runs`, `/system/job/rules` lists
  themselves are plain `EntityTablePage` hosts like any other module list.
- **Non-table archetypes** (list, cards, kanban, timeline, custom pages)
  follow their own page components — this rule covers only routes that
  resolve to the table archetype.
- Any other bypass of `EntityTablePage` requires explicit user approval in
  the plan step, documenting why the component is insufficient.

## Enforcement
- AI agent MUST use `EntityTablePage` for any new entity table page.
- AI agent MUST NOT create custom table markup or per-page
  fetch/meta/persistence logic for entity table pages.
- AI agent MUST flag any existing bespoke table page as a migration
  candidate.
- AI agent MUST NOT add parallel capability flags — `meta.actions` +
  `endpoint` is the contract.

## Deep dive

The normative rules live here; the full mechanics and rationale are in
`docs/dev-guide/components/entity-list-table.mdx` and
`docs/dev-guide/entity-metadata.mdx` — link, do not duplicate.
