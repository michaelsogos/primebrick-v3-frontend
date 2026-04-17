/** Sort direction for server-side list queries and header UI. */
export type SortDir = 'asc' | 'desc';

/** Column definition from entity list meta (API). */
export type MetaColumn = {
  key: string;
  labelKey: string;
  /** `date` / `datetime`: rendered as locale date (`DD MMM YYYY`) in entity lists. */
  type: 'text' | 'badge' | 'date' | 'datetime' | string;
  sortable?: boolean;
  searchable?: boolean;
  hideable?: boolean;
  defaultVisible?: boolean;
  badge?: {
    values?: Record<string, { labelKey?: string; labelText?: string; color?: string }>;
  };
};

/** `meta.list` slice shared by entity list UIs. */
export type EntityListListMeta = {
  searchPlaceholderKey?: string;
  columns: MetaColumn[];
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  defaultSort?: { key: string; dir: SortDir };
};

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
