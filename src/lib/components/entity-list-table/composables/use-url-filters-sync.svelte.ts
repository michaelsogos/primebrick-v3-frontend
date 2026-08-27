/**
 * useUrlFiltersSync — parse URL search params into filter state.
 *
 * Parses the standard Primebrick filter URL format:
 *   filters[0][field]=status&filters[0][op]==&filters[0][value]=ACTIVE&filters[0][connector]=AND
 *   filters[1][field]=created_at&filters[1][op]=BETWEEN&filters[1][value][start]=2024-01-01&filters[1][value][end]=2024-12-31
 *   search=acme&search_in=name,email
 *
 * Returns `filterValues` (simple field→value map for the filter bar) and
 * `advancedFilters` (structured filters for the advanced filter panel).
 *
 * Used by entity list pages to accept filter parameters from the URL —
 * primarily so the AI assistant can navigate to a filtered list
 * (e.g. /customers?filters[0][field]=status&filters[0][op]==&filters[0][value]=ACTIVE).
 *
 * Call this composable BEFORE restoring filters from sessionStorage —
 * URL filters take precedence over persisted filters (the AI explicitly
 * requested them).
 */
import type { AdvancedFilter, FilterOperator } from '$lib/entity-list/types';

export interface UrlFiltersResult {
  /** Simple field→value map for the filter bar (e.g. { status: 'ACTIVE' }). */
  filterValues: Record<string, any>;
  /** Structured filters for the advanced filter panel. */
  advancedFilters: AdvancedFilter[];
  /** Full-text search term (empty string if not in URL). */
  search: string;
  /** Fields to restrict search to (empty array if not in URL). */
  searchIn: string[];
  /** Whether any filters were found in the URL. */
  hasUrlFilters: boolean;
}

/**
 * Parse URL search params into filter state.
 *
 * @param searchParams The URL search params (e.g. `page.url.searchParams` or
 *   `new URLSearchParams(window.location.search)`).
 * @returns The parsed filter state.
 */
export function parseUrlFilters(searchParams: URLSearchParams): UrlFiltersResult {
  const filterValues: Record<string, any> = {};
  const advancedFilters: AdvancedFilter[] = [];
  const search = searchParams.get('search') ?? '';
  const searchInRaw = searchParams.get('search_in') ?? '';
  const searchIn = searchInRaw ? searchInRaw.split(',').filter(Boolean) : [];

  // Parse filters[N][field|op|value|connector] entries.
  // Group by index, then convert to filterValues / advancedFilters.
  const filterMap = new Map<number, { field?: string; op?: string; value?: any; connector?: string }>();

  for (const [key, value] of searchParams.entries()) {
    // Match filters[0][field], filters[0][op], filters[0][value], filters[0][connector]
    const match = key.match(/^filters\[(\d+)\]\[(\w+)\]$/);
    if (!match) continue;
    const idx = parseInt(match[1], 10);
    const prop = match[2];
    if (!filterMap.has(idx)) filterMap.set(idx, {});
    const entry = filterMap.get(idx)!;
    if (prop === 'field') entry.field = value;
    else if (prop === 'op') entry.op = value;
    else if (prop === 'connector') entry.connector = value;
    else if (prop === 'value') {
      // value can be a simple string or a nested object (BETWEEN: value[start], value[end])
      entry.value = value;
    }
  }

  // Handle BETWEEN: filters[N][value][start] and filters[N][value][end]
  for (const [key, value] of searchParams.entries()) {
    const match = key.match(/^filters\[(\d+)\]\[value\]\[(\w+)\]$/);
    if (!match) continue;
    const idx = parseInt(match[1], 10);
    const subKey = match[2];
    if (!filterMap.has(idx)) filterMap.set(idx, {});
    const entry = filterMap.get(idx)!;
    if (subKey === 'start' || subKey === 'end') {
      if (!entry.value || typeof entry.value !== 'object') {
        entry.value = { start: undefined, end: undefined };
      }
      (entry.value as Record<string, unknown>)[subKey] = value;
    }
  }

  // Convert the filter map to filterValues + advancedFilters.
  // Simple equality filters (=) go into filterValues (the filter bar).
  // Complex filters (BETWEEN, @>, IN, etc.) go into advancedFilters.
  let filterIdCounter = 0;
  const sortedIndexes = Array.from(filterMap.keys()).sort((a, b) => a - b);

  for (const idx of sortedIndexes) {
    const entry = filterMap.get(idx)!;
    if (!entry.field || !entry.op) continue;

    const op = entry.op as string;

    if (op === 'BETWEEN' && entry.value && typeof entry.value === 'object') {
      // BETWEEN → advanced filter with { start, end }
      advancedFilters.push({
        id: `url-filter-${filterIdCounter++}`,
        field: entry.field,
        operator: 'BETWEEN',
        value: entry.value as { start: any; end: any },
      });
    } else if (op === '=' || op === 'ILIKE' || op === 'LIKE') {
      // Simple equality / ILIKE → filterValues (the filter bar)
      // For ILIKE, strip the % wildcards if present (the filter bar adds them).
      let val = entry.value as string;
      if ((op === 'ILIKE' || op === 'LIKE') && typeof val === 'string') {
        val = val.replace(/^%|%/g, '');
      }
      filterValues[entry.field] = val;
    } else {
      // Other operators → advanced filter
      advancedFilters.push({
        id: `url-filter-${filterIdCounter++}`,
        field: entry.field,
        operator: op as FilterOperator,
        value: entry.value,
      });
    }
  }

  const hasUrlFilters =
    Object.keys(filterValues).length > 0 ||
    advancedFilters.length > 0 ||
    search.length > 0;

  return {
    filterValues,
    advancedFilters,
    search,
    searchIn,
    hasUrlFilters,
  };
}
