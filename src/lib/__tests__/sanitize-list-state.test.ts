/**
 * sanitizeListState — post-meta cleanup of persisted list criteria.
 * A stale key (field made non-filterable, removed column, renamed op)
 * used to poison every subsequent /list call into a 400 loop. The
 * sanitizer drops it silently at bootstrap, before the first loadRows.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeListState } from '../entity-list/sanitize-list-state';
import type { MetaColumn } from '../entity-list/types';

const cols = (arr: Partial<MetaColumn>[]) => arr as MetaColumn[];

const COLUMNS = cols([
	{ key: 'name', type: 'text' },
	{ key: 'status', type: 'text' },
	{ key: 'is_admin', type: 'switch' },
	{ key: 'total', type: 'number', filterable: false },
	{ key: 'computed_badge', type: 'badge', kind: 'virtual' },
	{ key: 'uuid', type: 'text' }
]);

const state = (over: Partial<Parameters<typeof sanitizeListState>[1]> = {}) => ({
	filterValues: null as Record<string, unknown> | null,
	advancedFilters: null,
	searchInKeys: null,
	...over
});

describe('sanitizeListState', () => {
	it('keeps valid criteria untouched', () => {
		const s = state({
			filterValues: { name: 'acme' },
			advancedFilters: [
				{ id: 'a1', field: 'is_admin', operator: '=', value: true },
				{ id: 'a2', field: 'name', operator: 'contains', value: 'ac' }
			],
			searchInKeys: ['name', 'status']
		});
		const r = sanitizeListState(COLUMNS, s);
		expect(r.droppedFilterFields).toEqual([]);
		expect(r.droppedAdvancedIds).toEqual([]);
		expect(r.droppedSearchInKeys).toEqual([]);
		expect(s.filterValues).toEqual({ name: 'acme' });
		expect(s.advancedFilters).toHaveLength(2);
		expect(s.searchInKeys).toEqual(['name', 'status']);
	});

	it('drops filterValues keys not served filterable', () => {
		const s = state({ filterValues: { name: 'x', total: 5, ghost: 'y' } });
		const r = sanitizeListState(COLUMNS, s);
		expect(r.droppedFilterFields.sort()).toEqual(['ghost', 'total']);
		expect(s.filterValues).toEqual({ name: 'x' });
	});

	it('drops advanced filters on unknown field OR invalid operator', () => {
		const s = state({
			advancedFilters: [
				{ id: 'ok', field: 'name', operator: 'contains', value: 'a' },
				{ id: 'bad-field', field: 'ghost', operator: '=', value: 1 },
				{ id: 'bad-op', field: 'is_admin', operator: 'contains', value: 'x' },
				{ id: 'virtual', field: 'computed_badge', operator: '=', value: 'x' }
			]
		});
		const r = sanitizeListState(COLUMNS, s);
		expect(r.droppedAdvancedIds.sort()).toEqual(['bad-field', 'bad-op', 'virtual']);
		expect(s.advancedFilters?.map((f) => f.id)).toEqual(['ok']);
	});

	it('drops non-searchable search_in keys; nulls out an empty scope', () => {
		const s = state({ searchInKeys: ['name', 'is_admin', 'ghost'] });
		const r = sanitizeListState(COLUMNS, s);
		expect(r.droppedSearchInKeys.sort()).toEqual(['ghost', 'is_admin']);
		expect(s.searchInKeys).toEqual(['name']);

		const s2 = state({ searchInKeys: ['ghost'] });
		sanitizeListState(COLUMNS, s2);
		expect(s2.searchInKeys).toBeNull();
	});

	it('tolerates null state', () => {
		const r = sanitizeListState(COLUMNS, state());
		expect(r.droppedFilterFields).toEqual([]);
		expect(r.droppedAdvancedIds).toEqual([]);
		expect(r.droppedSearchInKeys).toEqual([]);
	});
});
