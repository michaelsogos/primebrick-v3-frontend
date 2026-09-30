/**
 * list-filter-params — canonical serializer for entity `/list` filter params.
 *
 * ONE format end-to-end: qs bracket notation, already parsed into a plain
 * object tree by Express's extended query parser and consumed as-is by the
 * shared DAL `translateFilterConditions`. No JSON.stringify of filter arrays
 * anywhere in the pipeline.
 *
 * Emitted shapes:
 *   filters[i][field]=status&filters[i][op]==&filters[i][value]=ACTIVE&filters[i][connector]=AND
 *   filters[i][field]=created_at&filters[i][op]=BETWEEN&filters[i][value][start]=…&filters[i][value][end]=…
 *   filters[i][field]=status&filters[i][op]=IN&filters[i][value][]=A&filters[i][value][]=B
 *
 * `filterValues` (toolbar quick filters) are mapped from column type:
 * `text` → ILIKE, badge arrays → per-value OR chain ending with AND.
 * `advancedFilters` (FiltersPanel conditions) map UI operators to SQL:
 * contains/startsWith/endsWith → ILIKE patterns, arrays → IN / NOT IN,
 * BETWEEN → value[start]/value[end].
 *
 * When advanced filters are emitted and `connector` is provided, the global
 * `connector=AND|OR` query param is appended once.
 *
 * @returns the next free filter index, so callers can append extra filters
 *          (e.g. export "selected rows" IN-filter).
 */
import type { AdvancedFilter, MetaColumn } from './types';

export interface ListFilterParamsOptions {
	/** Toolbar quick-filter values keyed by column key. */
	filterValues?: Record<string, unknown>;
	/** Entity columns (needed to map filterValues to the right operator). */
	columns?: readonly MetaColumn[];
	/** FiltersPanel conditions. */
	advancedFilters?: readonly AdvancedFilter[];
	/** Global connector for advanced filters (`AND` | `OR`). */
	connector?: string;
}

export function appendListFilterParams(
	params: URLSearchParams,
	opts: ListFilterParamsOptions = {},
	startIdx = 0,
): number {
	let filterIdx = startIdx;
	const columns = opts.columns ?? [];
	const filterValues = opts.filterValues ?? {};
	const advancedFilters = Array.isArray(opts.advancedFilters) ? opts.advancedFilters : [];

	for (const [field, value] of Object.entries(filterValues)) {
		if (value === undefined || value === null || value === '') continue;
		const col = columns.find((c) => c.key === field);
		const op = col?.type === 'text' ? 'ILIKE' : '=';

		if (col?.type === 'badge' && Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				params.set(`filters[${filterIdx}][field]`, field);
				params.set(`filters[${filterIdx}][op]`, op);
				params.set(`filters[${filterIdx}][value]`, String(value[i]));
				params.set(`filters[${filterIdx}][connector]`, i < value.length - 1 ? 'OR' : 'AND');
				filterIdx++;
			}
		} else {
			params.set(`filters[${filterIdx}][field]`, field);
			params.set(`filters[${filterIdx}][op]`, op);
			params.set(`filters[${filterIdx}][value]`, String(value));
			params.set(`filters[${filterIdx}][connector]`, 'AND');
			filterIdx++;
		}
	}

	for (const filter of advancedFilters) {
		if (!filter.field || filter.value === undefined || filter.value === null || filter.value === '') {
			continue;
		}
		params.set(`filters[${filterIdx}][field]`, filter.field);

		let operator: string = filter.operator;
		let value = filter.value;

		if (operator === 'BETWEEN' && typeof value === 'object' && 'start' in value && 'end' in value) {
			params.set(`filters[${filterIdx}][op]`, operator);
			params.set(`filters[${filterIdx}][value][start]`, String(value.start));
			params.set(`filters[${filterIdx}][value][end]`, String(value.end));
			filterIdx++;
			continue;
		}

		if (Array.isArray(value)) {
			operator = operator === '!=' ? 'NOT IN' : 'IN';
		} else if (operator === 'startsWith') {
			operator = 'ILIKE';
			value = `${value}%`;
		} else if (operator === 'endsWith') {
			operator = 'ILIKE';
			value = `%${value}`;
		} else if (operator === 'contains') {
			operator = 'ILIKE';
			value = `%${value}%`;
		}

		params.set(`filters[${filterIdx}][op]`, operator);

		if (Array.isArray(value)) {
			for (const val of value) {
				params.append(`filters[${filterIdx}][value][]`, String(val));
			}
		} else {
			params.set(`filters[${filterIdx}][value]`, String(value));
		}

		filterIdx++;
	}

	if (advancedFilters.length > 0 && opts.connector) {
		params.set('connector', opts.connector);
	}

	return filterIdx;
}
