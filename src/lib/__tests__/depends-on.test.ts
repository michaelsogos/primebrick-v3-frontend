/**
 * `depends_on` resolvers — the pure semantics of the sibling-field edge:
 * options-filter derivation, gate evaluation (stored-value vs pivot-row
 * prop), control-format resolution, reset coupling. Component-free by
 * design — the dispatcher wires these against `record`/`usePivotRow`.
 */
import { describe, it, expect, vi } from 'vitest';
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

	it('depPivotSignature tracks bigint pivots — the wire-integer regression', () => {
		// Wire integers decode as bigint (ext-json strict contract). A numeric
		// pivot MUST produce a changing signature or the dependent never
		// resets — the silent integrity leak the mechanism exists to close.
		const dep = { field: 'year' };
		expect(depPivotSignature(dep, { year: 2024n })).toBe('2024');
		expect(depPivotSignature(dep, { year: 2025n })).toBe('2025');
		expect(depPivotSignature(dep, { year: 2024n })).not.toBe(
			depPivotSignature(dep, { year: 2025n }),
		);
		// number and bigint encodings of the same value share one signature —
		// the signature tracks the VALUE, not the wire type
		expect(depPivotSignature(dep, { year: 2024 })).toBe(depPivotSignature(dep, { year: 2024n }));
	});

	it('depPivotSignature dev-console-errors on non-scalar pivot values (semi-silent failure)', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const dep = { field: 'meta' };
		expect(depPivotSignature(dep, { meta: { nested: 1 } })).toBe('');
		expect(spy).toHaveBeenCalledOnce();
		expect(spy.mock.calls[0][0]).toContain('unmanaged type');
		expect(spy.mock.calls[0][0]).toContain("pivot 'meta'");
		spy.mockRestore();
	});

	it('depPivotSignature stays silent on the legitimate unset states', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const dep = { field: 'country' };
		for (const empty of [undefined, null, '']) {
			expect(depPivotSignature(dep, { country: empty })).toBe('');
		}
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});

describe('disabled_when cross-type equality — wire bigint vs authored literals', () => {
	it('equals matches across number/bigint encodings of the same value', () => {
		// meta-authored int literals decode as bigint; form-entered numerics
		// can be number — the comparison is about VALUE, never wire type.
		const dep = { field: 'threshold', disabled_when: { equals: 5n } };
		expect(depDisabled(dep, { threshold: 5 }, undefined)).toBe(true);
		expect(depDisabled(dep, { threshold: 5n }, undefined)).toBe(true);
		expect(depDisabled(dep, { threshold: 6 }, undefined)).toBe(false);
	});

	it('not inverts cross-type — same value does NOT disable', () => {
		const dep = { field: 'threshold', disabled_when: { not: 5n } };
		expect(depDisabled(dep, { threshold: 5 }, undefined)).toBe(false);
		expect(depDisabled(dep, { threshold: 7n }, undefined)).toBe(true);
	});

	it('values matches any entry cross-type', () => {
		const dep = { field: 'threshold', disabled_when: { values: [1n, 2, 3n] } };
		expect(depDisabled(dep, { threshold: 2n }, undefined)).toBe(true);
		expect(depDisabled(dep, { threshold: 3 }, undefined)).toBe(true);
		expect(depDisabled(dep, { threshold: 4 }, undefined)).toBe(false);
	});

	it('non-integer numbers never equal a bigint', () => {
		const dep = { field: 'threshold', disabled_when: { equals: 5n } };
		expect(depDisabled(dep, { threshold: 5.5 }, undefined)).toBe(false);
	});

	it('strings never cross-equal numbers — type distance is real', () => {
		const dep = { field: 'code', disabled_when: { equals: '5' } };
		expect(depDisabled(dep, { code: 5n }, undefined)).toBe(false);
		expect(depDisabled(dep, { code: '5' }, undefined)).toBe(true);
	});
});

describe('disabled_when.set — presence gating', () => {
	// `set` is the NON-form-column facet: a system trigger gates its
	// code-owned fields on `system_key` — a physical column that never
	// enters page_props.form, readable only via the served row.
	const dep = { field: 'system_key', disabled_when: { set: true } };

	it('disables when the pivot carries a value (system row)', () => {
		expect(depDisabled(dep, { system_key: 'ai.partition-maintenance' }, undefined)).toBe(true);
	});

	it('stays enabled while the pivot is empty (user row / create)', () => {
		expect(depDisabled(dep, { system_key: null }, undefined)).toBe(false);
		expect(depDisabled(dep, { system_key: undefined }, undefined)).toBe(false);
		expect(depDisabled(dep, {}, undefined)).toBe(false);
		expect(depDisabled(dep, { system_key: '' }, undefined)).toBe(false);
	});

	it('set:false inverts — disabled while the pivot is empty', () => {
		const inv = { field: 'key', disabled_when: { set: false } };
		expect(depDisabled(inv, { key: 'x' }, undefined)).toBe(false);
		expect(depDisabled(inv, { key: null }, undefined)).toBe(true);
		expect(depDisabled(inv, {}, undefined)).toBe(true);
	});
});
