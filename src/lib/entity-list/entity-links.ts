/**
 * entity-links — resolve `MetaColumn.ref` / `MetaColumn.reverse_ref`
 * declarations into concrete hrefs using the module route census.
 *
 * The meta carries the SEMANTIC ref (target entity name); routes are
 * FE-owned, resolved here from the `/api/v1/modules` census — the same
 * view `page-resolver` dispatches on — so nothing hardcodes URLs or
 * duplicates the route table. A ref pointing at an entity with no
 * census-declared route resolves `null` and the cell renders the raw
 * value: route drift degrades to a plain cell, never a broken link.
 */
import type { CensusRoute } from '$lib/api';
import { toDisplayString } from '@primebrick/ui';
import type { MetaColumn } from './types';

type ColumnRef = NonNullable<MetaColumn['ref']>;
type ColumnReverseRef = NonNullable<MetaColumn['reverse_ref']>;

/** Filtered-list URL in the `useUrlFiltersSync` contract. */
function filteredListHref(route: string, field: string, value: string): string {
	const params = new URLSearchParams();
	params.set('filters[0][field]', field);
	params.set('filters[0][op]', '=');
	params.set('filters[0][value]', value);
	return `${route}?${params.toString()}`;
}

/**
 * `type:"ref"` — the cell value identifies a row on the target entity.
 * `route:'detail'` (default) → the target's `[param]` route with the value
 * substituted; `route:'list'` → its list page filtered by `filter_field`.
 */
export function entityRefHref(
	census: readonly CensusRoute[],
	ref: ColumnRef,
	value: string
): string | null {
	if ((ref.route ?? 'detail') === 'list') {
		const list = census.find((r) => r.entity === ref.entity && r.kind === 'list');
		if (!list) return null;
		return filteredListHref(list.route, ref.filter_field ?? 'uuid', value);
	}
	const detail = census.find((r) => r.entity === ref.entity && r.kind === 'detail');
	if (!detail) return null;
	return detail.route.replace(/\[[a-zA-Z0-9_]+\]/, value);
}

/**
 * `type:"ref_count"` — link to the child entity's list page filtered to
 * this row. The filter value comes from `value_template` (`{field}`
 * placeholders resolved against the row), defaulting to the parent's uid.
 */
export function reverseRefHref(
	census: readonly CensusRoute[],
	reverseRef: ColumnReverseRef,
	uid: string,
	row: Record<string, unknown>
): string | null {
	const list = census.find((r) => r.entity === reverseRef.entity && r.kind === 'list');
	if (!list) return null;
	const template = reverseRef.value_template ?? `{${uid}}`;
	const value = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, field: string) =>
		toDisplayString(row[field])
	);
	return filteredListHref(list.route, reverseRef.filter_field, value);
}
