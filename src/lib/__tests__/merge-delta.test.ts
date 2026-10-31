import { describe, it, expect } from 'vitest';
import { mergeDelta } from '$lib/collaboration/merge-delta';

function harness(delta: Record<string, { old: unknown; new: unknown }>, taintedSet = new Set<string>()) {
	const data: Record<string, unknown> = {
		name: 'local-name',
		filter: '{"a":1}',
		enabled: true,
	};
	const tainted = new Map<string, boolean>();
	for (const k of taintedSet) tainted.set(k, true);
	const calls = { set: [] as [string, unknown][], untaint: [] as string[] };
	const outcome = mergeDelta({
		delta,
		isTainted: (f) => tainted.get(f) === true,
		getField: (f) => data[f],
		setField: (f, v) => {
			data[f] = v;
			calls.set.push([f, v]);
		},
		untaint: (f) => calls.untaint.push(f),
		toFormValue: (_f, raw) => raw,
	});
	return { outcome, data, calls };
}

describe('mergeDelta', () => {
	it('silently merges untouched fields and untaints them', () => {
		const { outcome, data, calls } = harness({ name: { old: 'a', new: 'remote-name' } });
		expect(outcome.merged).toEqual(['name']);
		expect(outcome.conflicts).toEqual({});
		expect(data.name).toBe('remote-name');
		expect(calls.untaint).toEqual(['name']);
	});

	it('creates conflicts for locally tainted fields — remote is withheld', () => {
		const { outcome, data } = harness(
			{ name: { old: 'a', new: 'remote-name' } },
			new Set(['name']),
		);
		expect(outcome.merged).toEqual([]);
		expect(outcome.conflicts.name).toEqual({
			local: 'local-name',
			remote: 'remote-name',
			base: 'a',
		});
		expect(data.name).toBe('local-name'); // user draft preserved
	});

	it('splits mixed deltas — merge untainted, conflict tainted', () => {
		const { outcome } = harness(
			{
				name: { old: 'a', new: 'remote-name' },
				enabled: { old: true, new: false },
			},
			new Set(['enabled']),
		);
		expect(outcome.merged).toEqual(['name']);
		expect(Object.keys(outcome.conflicts)).toEqual(['enabled']);
	});

	it('empty delta → no-op', () => {
		const { outcome, calls } = harness({});
		expect(outcome.merged).toEqual([]);
		expect(outcome.conflicts).toEqual({});
		expect(calls.set).toEqual([]);
	});

	it('converts raw record values through toFormValue (json → string)', () => {
		const { outcome, data } = harness(
			{ filter: { old: { a: 1 }, new: { a: 2 } } },
		);
		expect(outcome.merged).toEqual(['filter']);
		expect(data.filter).toEqual({ a: 2 });
	});
});
