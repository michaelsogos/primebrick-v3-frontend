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
import type { CensusRoute, ModuleInfo } from '$lib/api';
import { toDisplayString } from '@primebrick/ui';
import type { MetaColumn } from './types';

/** Subject → census declaration (emit or callable) — the `label_key` gives
 *  the translated display name; `payload_schema.properties` gives field
 *  display titles. The SAME declarations the create-form `subject_combo`
 *  options are built from — one source of truth, never re-derived. */
export function subjectDecl(
	modules: readonly ModuleInfo[],
	subject: string
): { label_key?: string; payload_schema?: Record<string, unknown> } | undefined {
	for (const m of modules) {
		for (const e of m.events?.emits ?? []) if (e.subject === subject) return e;
		for (const c of m.callables?.callables ?? []) if (c.subject === subject) return c;
	}
	return undefined;
}

/** JSON Schema `properties[field]` display title for condition chips —
 *  a dotted path resolves on its first segment; unknown fields degrade to
 *  the raw name, never to silence. */
export function subjectFieldLabel(
	modules: readonly ModuleInfo[],
	subject: string | undefined,
	field: string
): string {
	if (!subject) return field;
	const props = (subjectDecl(modules, subject)?.payload_schema?.properties ?? undefined) as
		| Record<string, { title?: string; description?: string; properties?: Record<string, unknown> }>
		| undefined;
	if (!props) return field;
	// Walk the dot path into nested `properties` — the LEAF property is
	// the field's own declaration (`trigger.metric` → payload.trigger's
	// `metric` property). `title` is the canonical short label;
	// `description` is the honest fallback every emitted schema carries.
	let node: Record<string, unknown> | undefined = props;
	let leaf: { title?: string; description?: string; properties?: Record<string, unknown> } | undefined;
	for (const seg of field.split('.')) {
		leaf = node?.[seg] as typeof leaf;
		if (!leaf) return field;
		node = leaf.properties;
	}
	return leaf?.title ?? leaf?.description ?? field;
}

type ColumnRef = NonNullable<MetaColumn['ref']>;
type ColumnReverseRef = NonNullable<MetaColumn['reverse_ref']>;

/**
 * One filter term in a filtered-list URL — the wire-level contract that
 * `useUrlFiltersSync` parses back (`filters[i][field|op|value[|connector]]`).
 * `value` may be scalar, an `IN`/`NOT IN` array, or a BETWEEN `{start,end}`.
 */
export type ListFilterLinkTerm = {
	field: string;
	/** Wire operator — '=' default. 'ILIKE', 'IN', 'BETWEEN', '>', … per the
	 *  `appendListFilterParams` serializer. */
	op?: string;
	value: string | string[] | { start: string; end: string };
	/** 'AND' default — emitted explicitly so links never rely on parser defaults. */
	connector?: 'AND' | 'OR';
};

function appendFilterTerm(params: URLSearchParams, i: number, term: ListFilterLinkTerm) {
	params.set(`filters[${i}][field]`, term.field);
	params.set(`filters[${i}][op]`, term.op ?? '=');
	const v = term.value;
	if (Array.isArray(v)) {
		for (const item of v) params.append(`filters[${i}][value][]`, item);
	} else if (typeof v === 'object' && v !== null) {
		params.set(`filters[${i}][value][start]`, v.start);
		params.set(`filters[${i}][value][end]`, v.end);
	} else {
		params.set(`filters[${i}][value]`, v);
	}
	params.set(`filters[${i}][connector]`, term.connector ?? 'AND');
}

/**
 * Filtered-list link builder — the STANDARD way to deep-link any entity's
 * list pre-filtered. Callers supply only the entity name + filter terms;
 * the target `kind:"list"` route resolves from the census (metadata —
 * never a hardcoded URL) and the wire format is canonical. Returns `null`
 * when the entity declares no list route — degrade to a plain cell, never
 * a broken link.
 */
export function filteredEntityListHref(
	census: readonly CensusRoute[],
	entity: string,
	terms: ListFilterLinkTerm[]
): string | null {
	if (terms.length === 0) return null;
	const list = census.find((r) => r.entity === entity && r.kind === 'list');
	if (!list) return null;
	const params = new URLSearchParams();
	terms.forEach((t, i) => appendFilterTerm(params, i, t));
	return `${list.route}?${params.toString()}`;
}

/** Filtered-list URL in the `useUrlFiltersSync` contract. */
function filteredListHref(route: string, field: string, value: string): string {
	const params = new URLSearchParams();
	appendFilterTerm(params, 0, { field, op: '=', value });
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
