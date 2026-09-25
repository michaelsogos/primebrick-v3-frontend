# Devin Rule: Entity Metadata Schema (FE consumer view)

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
