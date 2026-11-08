/**
 * `depends_on` resolvers — the pure semantics of the sibling-field edge:
 * options-filter derivation, gate evaluation (stored-value vs pivot-row
 * prop), control-format resolution, reset coupling. Component-free by
 * design — the dispatcher wires these against `record`/`usePivotRow`.
 */
import { describe, it, expect } from 'vitest';
import {
	depControlFormat,
	depDisabled,
	depNeedsPivotRow,
	depOptionsFilter,
	depPivotSignature,
	depResetsOnPivotChange,
} from '../entity-form/depends-on';

describe('depOptionsFilter', () => {
	const dep = { field: 'country', filter_field: 'country' } as const;

	it('derives an `=` condition on the target field fed by the pivot value', () => {
		expect(depOptionsFilter(dep, { country: 'IT' })).toEqual([
			{ field: 'country', op: '=', value: 'IT' },
		]);
	});

	it('is undefined while the pivot is empty (control is disabled anyway)', () => {
		for (const empty of [undefined, null, '']) {
			expect(depOptionsFilter(dep, { country: empty })).toBeUndefined();
		}
		expect(depOptionsFilter(dep, {})).toBeUndefined();
		expect(depOptionsFilter(dep, undefined)).toBeUndefined();
	});

	it('is undefined without a filter_field facet', () => {
		expect(depOptionsFilter({ field: 'type_uuid' }, { type_uuid: 'x' })).toBeUndefined();
	});
});

describe('depDisabled', () => {
	it('disables while the pivot is empty when filter_field is declared', () => {
		const dep = { field: 'country', filter_field: 'country' };
		expect(depDisabled(dep, {}, undefined)).toBe(true);
		expect(depDisabled(dep, { country: 'IT' }, undefined)).toBe(false);
	});

	it('disables while the pivot is empty when control_prop is declared', () => {
		const dep = { field: 'type_uuid', control_prop: 'value_kind' };
		expect(depDisabled(dep, { type_uuid: '' }, undefined)).toBe(true);
		expect(depDisabled(dep, { type_uuid: 'u1' }, { value_kind: 'email' })).toBe(false);
	});

	it('does NOT gate on pivot presence for a pure disabled_when edge', () => {
		const dep = { field: 'customer_type_uuid', disabled_when: { equals: 'private' } };
		expect(depDisabled(dep, {}, undefined)).toBe(false);
	});

	it('compares the pivot stored value when no prop is declared', () => {
		const dep = { field: 'kind', disabled_when: { equals: 'private' } };
		expect(depDisabled(dep, { kind: 'private' }, undefined)).toBe(true);
		expect(depDisabled(dep, { kind: 'company' }, undefined)).toBe(false);
	});

	it('compares the pivot ROW prop when prop is declared', () => {
		const dep = {
			field: 'customer_type_uuid',
			disabled_when: { prop: 'code', equals: 'private' },
		};
		expect(depDisabled(dep, { customer_type_uuid: 'u1' }, { code: 'private' })).toBe(true);
		expect(depDisabled(dep, { customer_type_uuid: 'u1' }, { code: 'company' })).toBe(false);
	});

	it('fails closed while a prop comparison cannot evaluate yet', () => {
		const dep = {
			field: 'customer_type_uuid',
			disabled_when: { prop: 'code', equals: 'private' },
		};
		// row still loading (undefined) — the gate holds disabled
		expect(depDisabled(dep, { customer_type_uuid: 'u1' }, undefined)).toBe(true);
	});

	it('supports `not` and `values` condition shapes', () => {
		const notDep = { field: 'status', disabled_when: { not: 'active' } };
		expect(depDisabled(notDep, { status: 'paused' }, undefined)).toBe(true);
		expect(depDisabled(notDep, { status: 'active' }, undefined)).toBe(false);

		const inDep = { field: 'kind', disabled_when: { values: ['a', 'b'] } };
		expect(depDisabled(inDep, { kind: 'b' }, undefined)).toBe(true);
		expect(depDisabled(inDep, { kind: 'c' }, undefined)).toBe(false);
	});
});

describe('depControlFormat', () => {
	const dep = { field: 'type_uuid', control_prop: 'value_kind' };

	it('resolves the pivot row prop as a format literal', () => {
		expect(depControlFormat(dep, { value_kind: 'email' })).toBe('email');
		expect(depControlFormat(dep, { value_kind: 'phone' })).toBe('phone');
		expect(depControlFormat(dep, { value_kind: 'text' })).toBe('text');
	});

	it('degrades to undefined for unknown/misspelled data (text fallback)', () => {
		expect(depControlFormat(dep, { value_kind: 'json' })).toBeUndefined();
		expect(depControlFormat(dep, { value_kind: 'bogus' })).toBeUndefined();
		expect(depControlFormat(dep, { value_kind: 42 })).toBeUndefined();
		expect(depControlFormat(dep, {})).toBeUndefined();
	});

	it('is undefined while the pivot row is unresolved', () => {
		expect(depControlFormat(dep, undefined)).toBeUndefined();
	});

	it('is undefined without a control_prop facet', () => {
		expect(depControlFormat({ field: 'x' }, { value_kind: 'email' })).toBeUndefined();
	});
});

describe('pivot-row need + reset coupling', () => {
	it('depNeedsPivotRow — only prop-reading facets need the row', () => {
		expect(depNeedsPivotRow({ field: 'a', filter_field: 'b' })).toBe(false);
		expect(depNeedsPivotRow({ field: 'a', control_prop: 'k' })).toBe(true);
		expect(
			depNeedsPivotRow({ field: 'a', disabled_when: { prop: 'code', equals: 'x' } }),
		).toBe(true);
		expect(depNeedsPivotRow({ field: 'a', disabled_when: { equals: 'x' } })).toBe(false);
	});

	it('depResetsOnPivotChange — only value-coupled facets reset', () => {
		expect(depResetsOnPivotChange({ field: 'a', filter_field: 'b' })).toBe(true);
		expect(depResetsOnPivotChange({ field: 'a', control_prop: 'k' })).toBe(true);
		expect(
			depResetsOnPivotChange({ field: 'a', disabled_when: { equals: 'x' } }),
		).toBe(false);
	});

	it('depPivotSignature tracks the stored pivot value', () => {
		const dep = { field: 'country' };
		expect(depPivotSignature(dep, { country: 'IT' })).toBe('IT');
		expect(depPivotSignature(dep, { country: 'DE' })).toBe('DE');
		expect(depPivotSignature(dep, {})).toBe('');
	});
});
