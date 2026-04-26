/** Sort direction for server-side list queries and header UI. */
export type SortDir = 'asc' | 'desc';

/** View mode for entity list display. */
export type ViewName = 'table' | 'cards' | 'cards_list';

/** Visibility configuration for a specific view. */
export type ViewVisibilityConfig = {
  visible?: string[];
  hidden?: string[];
  notDisplayable?: string[];
  notHideable?: string[];
};

/** Visibility configurations per view mode. */
export type ListMetaViewVisibility = {
  [K in ViewName]: ViewVisibilityConfig;
};

/** Column definition from entity list meta (API). */
export type MetaColumn = {
  key: string;
  labelKey: string;
  /**
   * `date`: locale date only. `datetime`: locale date + time (`Intl` default hour cycle for that locale).
   */
  type: 'text' | 'badge' | 'date' | 'datetime' | string;
  sortable?: boolean;
  searchable?: boolean;
  hideable?: boolean;
  defaultVisible?: boolean;
  filterable?: boolean;
  badge?: {
    values?: Record<string, { labelKey?: string; labelText?: string; color?: string }>;
  };
  /**
   * `datetime` only: header CTA toggles between browser-local `Intl` (default) and
   * {@link recordIanaField} on the row (IANA id from the API).
   */
  datetimeIanaToggle?: {
    recordIanaField: string;
  };
};

/** `meta.list` slice shared by entity list UIs. */
export type EntityListListMeta = {
  searchPlaceholderKey?: string;
  /**
   * Non-sticky, non-auditing columns, ordered for display.
   * Back-compat: older APIs used `columns` to mean "all columns".
   */
  columns?: MetaColumn[];
  /** Sticky (pinned) columns, ordered for display (rendered first). */
  stickyColumns?: MetaColumn[];
  /** Auditing columns, ordered for display (rendered last). */
  auditingColumns?: MetaColumn[];
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  defaultSort?: { key: string; dir: SortDir };
  /** Visibility rules per view mode. */
  viewVisibility?: ListMetaViewVisibility;
  /** Columns that support filtering. */
  filterFields?: MetaColumn[];
};

/** All columns in the order they should be displayed (sticky -> data -> auditing). */
export function orderedColumnsFromListMeta(list: EntityListListMeta | null | undefined): MetaColumn[] {
  if (!list) return [];
  if (list.stickyColumns || list.auditingColumns) {
    return [...(list.stickyColumns ?? []), ...(list.columns ?? []), ...(list.auditingColumns ?? [])];
  }
  return list.columns ?? [];
}

/** Keys visible by default from column meta and view visibility config. */
export function defaultVisibleColumnKeys(
  columns: MetaColumn[],
  view: ViewName = 'table',
  viewVisibility?: ListMetaViewVisibility
): string[] {
  if (!columns.length) return [];

  const config = viewVisibility?.[view];
  if (config?.visible) {
    // Explicit visible list: filter to existing columns.
    return config.visible.filter((k) => columns.some((c) => c.key === k));
  }

  // Fallback to column-level defaults, respecting view-specific hidden/notHideable.
  let candidates = columns
    .filter((c) => c.hideable === false || c.defaultVisible !== false)
    .map((c) => c.key);

  if (config?.hidden) {
    candidates = candidates.filter((k) => !config.hidden!.includes(k));
  }

  // Ensure notHideable are always included.
  if (config?.notHideable) {
    for (const k of config.notHideable) {
      if (columns.some((c) => c.key === k) && !candidates.includes(k)) {
        candidates.push(k);
      }
    }
  }

  return candidates;
}

/** Drop unknown keys and fall back to defaults when nothing left. */
export function sanitizeVisibleKeys(
  visibleKeys: string[],
  columns: MetaColumn[],
  view: ViewName = 'table',
  viewVisibility?: ListMetaViewVisibility
): string[] {
  if (!columns.length) return [];
  const allowed = new Set(columns.map((c) => c.key));
  let next = visibleKeys.filter((k) => allowed.has(k));
  if (next.length === 0) next = defaultVisibleColumnKeys(columns, view, viewVisibility);
  return next;
}
