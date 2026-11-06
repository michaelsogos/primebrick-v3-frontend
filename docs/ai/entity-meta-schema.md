# Devin Rule: Entity Metadata Schema (FE consumer view)

> Canonical body of `.devin/rules/entity-meta-schema.md` — the rule file is a pointer to this page.

## Trigger
- Applies whenever FE code reads entity metadata (`meta.*`), writes meta-consuming
  composables, or builds pages/components driven by `EntityMeta`.

## Canonical shape

`EntityMeta` is defined in `src/lib/entity-list/types.ts` and **mirrors** the BE
type (`src/http/entity-meta.types.ts`) verbatim — same names, same snake_case,
no DTO renaming (data-model-conventions rule).

```ts
type EntityMeta = {
  entity: string;
  translation_key?: SnakeCaseSingular;
  title_key?: string;
  uid: string;
  display_field: string;          // required — primary display column key
  display_name: string;           // response-required — "${field}" template,
                                  // BE materializes default "${display_field}"
  actions_overrides?: Record<string, { enabled?: boolean }>;
  columns: MetaColumn[];          // ROOT-level field dictionary (all page types)
  table?: TableMeta;              // OPTIONAL — absent on form-only metas
  actions?: EntityAction[];       // derived capability contract
  collaboration?: CollaborationMeta;
};
```

## Reading meta — mandatory patterns

- Columns: `orderedColumns(meta?.columns)` — renders `sticky` → normal →
  `audited` groups, each sorted by column `order`. `order` is explicit per
  column — array position MUST NOT matter. Convention: `uuid` is
  `order: -1` + `sticky` + `default_visible: false` (first sticky, hidden
  but selectable); the `display_field` column is `order: 0` + `sticky`.
  NEVER expect `sticky_columns`/`auditing_columns` arrays (removed).
- CTA gating: `isEntityOpAllowed(meta?.actions, 'op')` is the SINGLE
  capability/visibility mechanism — `enabled: false` (route absent or
  `actions_overrides`) hides the op everywhere. There is no separate
  row-action boolean map.
- Table options live under `meta.table.*`: `default_view`, `default_sort`,
  `default_page_size`, `page_size_options`, `row_custom_actions`.
- Custom row CTAs: `meta?.table?.row_custom_actions` → `entityCustomActions`
  prop on `EntityListTable`.
- Page title / display: `resolvePageTitle(meta, row)` uses `display_name`
  (`${field}` template) — reused for comboboxes, related-object labels.
- Search scope: `computeSearchInKeys` = visible ∩ `searchable` ∩ `type ===
  'text'` columns. Hidden-by-default columns are excluded until shown or
  explicitly selected.
- Form pages read the SAME root `columns` — tooltip props (`tooltip`,
  `tooltip_priority`, `tooltip_title`, `show_form_tooltip`,
  `show_list_tooltip`), `audited` for audit sections.
- **Boolean cells are a non-negotiable standard**: `CircleCheck` (true) /
  `CircleX` (false) icons, horizontally centered in the cell (`TableCell`
  owns this). Custom cell snippets MUST NOT re-implement or bypass it.
- **Wire→display conversion goes through `toDisplayString`** (from
  `@primebrick/ui`) — the ONLY canonical converter for arbitrary wire
  values. `String(x)` on `unknown`/`Record` values is forbidden: wire JSON
  parses to null-prototype objects (`json-bigint` strict) and implicit
  coercion throws `TypeError: Cannot convert object to primitive value`.
  Enforced by `@typescript-eslint/no-base-to-string` on `src/**`.
- **Icons are optional everywhere** — `MetaColumn.icon` (rendered before the
  column label in table headers), CTA `icon`. Absent icon renders nothing
  and reserves no space; never render `DynamicIcon` with an empty name (it
  shows a `?` placeholder).
- **`format` is the semantic renderer discriminator** — `TableCell` switches
  on it BEFORE `type`:
  - `schedule_spec` → `ScheduleSpecCell` (badge + localized prose via
    `@primebrick/ui` schedule-spec i18n).
  - `nats_subject` → badge + link; known module/service subjects link to the
    module page (`/system/settings/modules/[code]` via census resolution).
  - `json` → human-readable chips/prose where the shape is known
    (`job_trigger.filter` conditions), else safe stringified preview.
  - `identifier`/`display_name` → standard text affordances.
- **References are metadata-declared** (`ref`, `reverse_ref`, `ref_count`):
  - `ref: { entity }` on a `type:"ref"` column → cell links to the target
    entity's page (census-resolved route).
  - `reverse_ref: { entity, filter_field, value_template }` on a
    `type:"ref_count"` virtual column → badge count + link to the children
    list filtered by `filters[0][field|op|value]` URL params. The
    `filter_field` MUST be in the target service's `filterableKeys`.
  - Never invent links: no census route or missing `filterableKeys` entry →
    render plain, do not guess.
- **Filtered-list URLs are a standard mechanism** (`entity-links.ts`):
  `filteredEntityListHref(census, entity, terms)` builds a
  `filters[i][field|op|value|connector]` deep link for ANY entity from
  just its name + wire-level terms (scalar, `IN` array, BETWEEN
  `{start,end}`) — route resolution stays metadata-owned (census), the
  wire format is the `appendListFilterParams` contract. Use it whenever a
  cell/CTA must deep-link a filtered list; never hand-assemble params.
- **Physical columns are auto-derived from the entity class** —
  `withColumnConstraints` injects every physical column missing from
  authored `columns` (uid first, audit/deletable columns `audited:true`,
  auto-injected `default_visible:false`). `hidden: true` on an authored
  column is the ONLY opt-out — it removes the column from served meta.
  Restating derived facts (`nullable`, `max_length`, `pg_type`) throws.

## Closed schema

- `EntityMeta`/`MetaColumn`/`TableMeta` have NO index signature — any prop not
  declared in the type is a compile-time error. To add a metadata prop, extend
  the type first (BE + FE mirror), then use it.
- `meMeta` (`GET /api/v1/auth/me/meta`) is a plain `EntityMeta` without
  `table` — never assume `meta.table` exists.

## Forbidden legacy names (removed — do not reintroduce)

`translationKey`, `titleKey`, `labelKey`, `defaultVisible`, `defaultView`,
`defaultSort`, `defaultPageSize`, `pageSizeOptions`, `searchPlaceholderKey`,
`updatePageTitle`, `datetimeIanaToggle`, `showFormTooltip`, `showListTooltip`,
`sticky_columns`, `auditing_columns`, `view_visibility`, `enable_create_action`,
`row_actions` (booleans), `list.*` (columns/actions_overrides under `list`),
`EntityListMeta` (renamed `EntityMeta`).

## Deep dive

The normative rules live here; the full mechanics and rationale are in `docs/dev-guide/entity-metadata.mdx` — link, do not duplicate.
