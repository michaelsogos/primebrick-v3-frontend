/** Sort direction for server-side list queries and header UI. */
export type SortDir = 'asc' | 'desc';

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
};

/** All columns in the order they should be displayed (sticky -> data -> auditing). */
export function orderedColumnsFromListMeta(list: EntityListListMeta | null | undefined): MetaColumn[] {
  if (!list) return [];
  if (list.stickyColumns || list.auditingColumns) {
    return [...(list.stickyColumns ?? []), ...(list.columns ?? []), ...(list.auditingColumns ?? [])];
  }
  return list.columns ?? [];
}

/** Keys visible by default from column meta (`hideable === false` or `defaultVisible !== false`). */
export function defaultVisibleColumnKeys(columns: MetaColumn[]): string[] {
  if (!columns.length) return [];
  return columns
    .filter((c) => c.hideable === false || c.defaultVisible !== false)
    .map((c) => c.key);
}

/** Drop unknown keys and fall back to defaults when nothing left. */
export function sanitizeVisibleKeys(visibleKeys: string[], columns: MetaColumn[]): string[] {
  if (!columns.length) return [];
  const allowed = new Set(columns.map((c) => c.key));
  let next = visibleKeys.filter((k) => allowed.has(k));
  if (next.length === 0) next = defaultVisibleColumnKeys(columns);
  return next;
}
