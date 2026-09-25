/** Sort direction for server-side list queries and header UI. */
export type SortDir = 'asc' | 'desc';

/** View mode for entity list display. */
export type ViewName = 'table' | 'cards' | 'cards_list';

/**
 * Branded type that enforces snake_case singular (no uppercase letters).
 * Used for `translation_key` in entity meta — the i18n key prefix.
 *
 * The brand is applied via the `asSnakeCaseSingular()` helper, which
 * performs a runtime check rejecting strings containing A-Z.
 * This catches camelCase (`userProfile`), PascalCase (`RoleMapping`),
 * and UPPER_CASE (`USER_PROFILE`) at both compile time and runtime.
 *
 * @example
 * const tk = asSnakeCaseSingular('user_profile');  // ✅
 * const tk = asSnakeCaseSingular('userProfile');   // ❌ throws at runtime
 */
export type SnakeCaseSingular = string & {
  readonly __snakeCaseSingularBrand: unique symbol;
};

/**
 * Runtime validator for SnakeCaseSingular — rejects strings with uppercase letters.
 * Use in meta-loading code to catch BE meta that violates the convention.
 *
 * @returns true if the value is valid snake_case (no uppercase letters)
 */
export function isSnakeCaseSingular(value: string): value is SnakeCaseSingular {
  return !/[A-Z]/.test(value);
}

/**
 * Branded constructor for SnakeCaseSingular.
 * Throws if the value contains uppercase letters (camelCase/PascalCase/UPPER_CASE).
 */
export function asSnakeCaseSingular(value: string): SnakeCaseSingular {
  if (/[A-Z]/.test(value)) {
    throw new Error(
      `Invalid translation_key "${value}" — must be snake_case singular (no uppercase letters). ` +
      `Use snake_case singular like "user_profile" instead of "userProfile".`
    );
  }
  return value as SnakeCaseSingular;
}

import type { TooltipPriority } from '$lib/components/ui/tooltip';

/**
 * Entity field descriptor — root-level `columns` dictionary from the meta
 * (canonical BE `MetaColumn`, snake_case end-to-end).
 */
export type MetaColumn = {
  key: string;
  label_key: string;
  /**
   * `date`: locale date only. `datetime`: locale date + time (`Intl` default hour cycle for that locale).
   * `color`: displays as a color circle with tooltip showing HEX value.
   */
  type: 'text' | 'badge' | 'date' | 'datetime' | 'color' | 'boolean' | 'number' | string;
  /** Deterministic display position — explicit per column, array position
   * does not matter. Convention: `uuid` is `order: -1` (first sticky,
   * hidden but selectable); `display_field` is `order: 0`. */
  order: number;
  sortable?: boolean;
  searchable?: boolean;
  hideable?: boolean;
  default_visible?: boolean;
  filterable?: boolean;
  /** Pinned left, rendered before normal columns. */
  sticky?: boolean;
  /** System-managed auditing column — rendered last. */
  audited?: boolean;
  badge?: {
    values?: Record<string, { label_key?: string; label_text?: string; color?: string }>;
  };
  /**
   * `datetime` only: header CTA toggles between browser-local `Intl` (default) and
   * {@link MetaColumn.datetime_iana_toggle.record_iana_field} on the row (IANA id from the API).
   */
  datetime_iana_toggle?: {
    record_iana_field: string;
  };
  /** i18n key for tooltip content. If set, a tooltip renders in form and/or list contexts (per show flags). Works as plain tooltip even without priority/title. */
  tooltip?: string;
  /** Priority/severity for the tooltip icon + title color. Optional/advanced. */
  tooltip_priority?: TooltipPriority;
  /** i18n key for tooltip title (shown in priority color). Optional/advanced. */
  tooltip_title?: string;
  /** Show tooltip in form context. Default: true if `tooltip` is set. */
  show_form_tooltip?: boolean;
  /** Show tooltip in list/table/card context. Default: true if `tooltip` is set. */
  show_list_tooltip?: boolean;
};

/** UI configuration for a non-standard row CTA (route-backed bare op). */
export type RowCustomAction = {
  /** Bare op name matching `meta.actions` (e.g. `change_password`). */
  action_name: string;
  translation_key: string;
  icon: string;
  text_color?: string;
  disabled_when_deleted?: boolean;
  required_permission?: string | string[];
};

/** `meta.table` — EntityListTable options (absent on form-only metas). */
export type TableMeta = {
  default_view?: ViewName;
  default_sort?: { key: string; dir: SortDir };
  default_page_size?: number;
  page_size_options?: number[];
  row_custom_actions?: RowCustomAction[];
};

/**
 * One entry of `meta.actions` — the derived capability contract.
 * EVERY standard op is present; `enabled: false` means the op is
 * unavailable for everyone (route missing or product-disabled).
 */
export type EntityAction = {
  op: string;
  /** OR-group of concrete permission strings the endpoint declares. */
  permissions?: string[];
  /** Sentinel gate used instead of concrete perms (e.g. `_authenticated_user`). */
  sentinel?: "_public" | "_authenticated_user" | "_authenticated_admin";
  /** Availability flag — false hides the CTA for everyone. */
  enabled: boolean;
};

/** Collaboration fragment injected by `assembleMeta`. */
export type CollaborationMeta = {
  enabled: boolean;
  expose_editing_value: boolean;
};

/**
 * Canonical entity meta — the served `GET /api/v1/entities/{entity}/meta`
 * response (mirrors BE `EntityMetaResponse`, snake_case end-to-end).
 */
export type EntityMeta = {
  entity: string;
  /** i18n prefix, snake_case singular (e.g. `role_mapping`). */
  translation_key?: SnakeCaseSingular;
  title_key?: string;
  uid: string;
  /** Canonical display field — column key for first/sticky identity. */
  display_field: string;
  /** Display expression template (`${field}` syntax) — always materialized. */
  display_name: string;
  /** Per-op enable overrides (source only — the served `actions` already
   *  has them applied). */
  actions_overrides?: Record<string, { enabled?: boolean }>;
  /** Entity field dictionary (root-level, transversal). */
  columns: MetaColumn[];
  /** Table options — absent on form-only metas (e.g. /auth/me/meta). */
  table?: TableMeta;
  /** Derived capability contract (runtime-injected). */
  actions?: EntityAction[];
  /** Collaboration fragment (runtime-injected). */
  collaboration?: CollaborationMeta;
};

/**
 * Columns in display order: sticky group → normal group → audited group,
 * each sorted by `order`.
 */
export function orderedColumns(columns: readonly MetaColumn[] | null | undefined): MetaColumn[] {
  if (!columns?.length) return [];
  const byOrder = (a: MetaColumn, b: MetaColumn) => a.order - b.order;
  return [
    ...columns.filter((c) => c.sticky).sort(byOrder),
    ...columns.filter((c) => !c.sticky && !c.audited).sort(byOrder),
    ...columns.filter((c) => c.audited).sort(byOrder),
  ];
}

/** Keys visible by default — from column flags. */
export function defaultVisibleColumnKeys(columns: MetaColumn[]): string[] {
  return columns
    .filter((c) => c.hideable === false || c.default_visible !== false)
    .map((c) => c.key);
}

/** Drop unknown keys and fall back to defaults when nothing left. */
export function sanitizeVisibleKeys(visibleKeys: string[], columns: MetaColumn[]): string[] {
  if (!columns.length) return [];
  const allowed = new Set(columns.map((c) => c.key));
  const next = visibleKeys.filter((k) => allowed.has(k));
  return next.length ? next : defaultVisibleColumnKeys(columns);
}

/** Text-physical searchable columns — the scope selector + default
 *  "all fields" search set. */
export function searchableTextColumns(columns: MetaColumn[]): MetaColumn[] {
  return columns.filter((c) => c.searchable !== false && c.type === 'text');
}

/** Filter operators available for advanced filters. */
export type FilterOperator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'BETWEEN';

/** Advanced filter definition. */
export type AdvancedFilter = {
  id: string;
  field: string;
  operator: FilterOperator;
  value: any | any[] | { start: any; end: any };
};

/** Get available operators for a given column type. */
export function getOperatorsForColumnType(columnType: string): FilterOperator[] {
  switch (columnType) {
    case 'text':
      return ['=', '!=', 'contains', 'startsWith', 'endsWith'];
    case 'badge':
      return ['=', '!='];
    case 'date':
    case 'datetime':
      return ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN'];
    default:
      // Assume numeric for unknown types
      return ['=', '!=', '>', '<', '>=', '<='];
  }
}
