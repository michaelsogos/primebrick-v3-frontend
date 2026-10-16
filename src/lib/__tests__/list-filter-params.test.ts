/**
 * list-filter-params — canonical QS bracket-notation serializer tests.
 * Asserts the emitted URLSearchParams shape end-to-end (no JSON.stringify).
 */
import { describe, it, expect } from 'vitest';
import { appendListFilterParams } from '../entity-list/list-filter-params';
import type { MetaColumn } from '../entity-list/types';

const cols = (arr: Partial<MetaColumn>[]) => arr as MetaColumn[];

function toObj(params: URLSearchParams): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const [k, v] of params.entries()) {
		(out[k] ??= []).push(v);
	}
	return out;
}

describe('appendListFilterParams', () => {
	it('emits bracket-notation filters for quick filterValues', () => {
		const p = new URLSearchParams();
		const next = appendListFilterParams(p, {
			filterValues: { status: 'ACTIVE' },
			columns: cols([{ key: 'status', type: 'text' }])
		});
		expect(p.get('filters[0][field]')).toBe('status');
		// text columns map to ILIKE
		expect(p.get('filters[0][op]')).toBe('ILIKE');
		expect(p.get('filters[0][value]')).toBe('ACTIVE');
		expect(p.get('filters[0][connector]')).toBe('AND');
		expect(next).toBe(1);
	});

	it('non-text column uses = operator', () => {
		const p = new URLSearchParams();
		appendListFilterParams(p, {
			filterValues: { is_admin: true },
			columns: cols([{ key: 'is_admin', type: 'switch' }])
		});
		expect(p.get('filters[0][op]')).toBe('=');
		expect(p.get('filters[0][value]')).toBe('true');
	});

	it('badge array fans out into OR-chained conditions ending with AND', () => {
		const p = new URLSearchParams();
		appendListFilterParams(p, {
			filterValues: { status: ['A', 'B', 'C'] },
			columns: cols([{ key: 'status', type: 'badge' }])
		});
		const o = toObj(p);
		expect(o['filters[0][connector]']).toEqual(['OR']);
		expect(o['filters[1][connector]']).toEqual(['OR']);
		expect(o['filters[2][connector]']).toEqual(['AND']);
		expect(o['filters[0][value]']).toEqual(['A']);
		expect(o['filters[2][value]']).toEqual(['C']);
	});

	it('advanced contains/startsWith/endsWith map to ILIKE patterns', () => {
		const p = new URLSearchParams();
		appendListFilterParams(p, {
			advancedFilters: [
				{ id: 'f1', field: 'name', operator: 'contains', value: 'acme' },
				{ id: 'f2', field: 'name', operator: 'startsWith', value: 'ac' },
				{ id: 'f3', field: 'name', operator: 'endsWith', value: 'me' }
			]
		});
		expect(p.get('filters[0][op]')).toBe('ILIKE');
		expect(p.get('filters[0][value]')).toBe('%acme%');
		expect(p.get('filters[1][value]')).toBe('ac%');
		expect(p.get('filters[2][value]')).toBe('%me');
	});

	it('BETWEEN emits value[start]/value[end]', () => {
		const p = new URLSearchParams();
		appendListFilterParams(p, {
			advancedFilters: [
				{ id: 'f4', field: 'created_at', operator: 'BETWEEN', value: { start: '2024-01-01', end: '2024-12-31' } }
			]
		});
		expect(p.get('filters[0][op]')).toBe('BETWEEN');
		expect(p.get('filters[0][value][start]')).toBe('2024-01-01');
		expect(p.get('filters[0][value][end]')).toBe('2024-12-31');
	});

	it('array value → IN; != + array → NOT IN; repeated value[] keys', () => {
		const p = new URLSearchParams();
		appendListFilterParams(p, {
			advancedFilters: [
				{ id: 'f5', field: 'status', operator: '=', value: ['A', 'B'] },
				{ id: 'f6', field: 'status', operator: '!=', value: ['X', 'Y'] }
			]
		});
		expect(p.get('filters[0][op]')).toBe('IN');
		expect(p.getAll('filters[0][value][]')).toEqual(['A', 'B']);
		expect(p.get('filters[1][op]')).toBe('NOT IN');
		expect(p.getAll('filters[1][value][]')).toEqual(['X', 'Y']);
	});

	it('connector param emitted only when advanced filters exist', () => {
		const p1 = new URLSearchParams();
		appendListFilterParams(p1, { advancedFilters: [], connector: 'OR' });
		expect(p1.get('connector')).toBeNull();

		const p2 = new URLSearchParams();
		appendListFilterParams(p2, {
			advancedFilters: [{ id: 'f7', field: 'x', operator: '=', value: '1' }],
			connector: 'OR'
		});
		expect(p2.get('connector')).toBe('OR');
	});

	it('skips empty values; startIdx continues numbering (export selected-rows use)', () => {
		const p = new URLSearchParams();
		const next = appendListFilterParams(
			p,
			{ filterValues: { a: '', b: null, c: 'v' } },
			5
		);
		expect(p.get('filters[5][field]')).toBe('c');
		expect(next).toBe(6);
	});
});
