/**
 * entity-links — census-resolved link builders. Asserts the filtered-list
 * URL contract (`useUrlFiltersSync` wire format) end-to-end: entity name +
 * terms in, canonical bracket-notation href out.
 */
import { describe, it, expect } from 'vitest';
import {
	filteredEntityListHref,
	entityRefHref,
	reverseRefHref
} from '../entity-list/entity-links';
import type { CensusRoute } from '../api';

const census = [
	{ route: '/system/job/triggers', entity: 'job_trigger', kind: 'list' },
	{ route: '/system/job/triggers/[uuid]', entity: 'job_trigger', kind: 'detail' },
	{ route: '/system/job/runs', entity: 'job_run', kind: 'list' }
] as CensusRoute[];

describe('filteredEntityListHref', () => {
	it('resolves the list route and emits canonical filter params', () => {
		const href = filteredEntityListHref(census, 'job_run', [
			{ field: 'schedule_subject', op: '=', value: 'jobs.sched.trigger.abc' }
		]);
		expect(href).toContain('/system/job/runs?');
		const qs = new URLSearchParams(href!.split('?')[1]);
		expect(qs.get('filters[0][field]')).toBe('schedule_subject');
		expect(qs.get('filters[0][op]')).toBe('=');
		expect(qs.get('filters[0][value]')).toBe('jobs.sched.trigger.abc');
		expect(qs.get('filters[0][connector]')).toBe('AND');
	});

	it('multi-term: BETWEEN nested keys + IN array keys + OR connector', () => {
		const href = filteredEntityListHref(census, 'job_run', [
			{ field: 'created_at', op: 'BETWEEN', value: { start: '2024-01-01', end: '2024-12-31' } },
			{ field: 'status', op: 'IN', value: ['A', 'B'], connector: 'OR' }
		])!;
		const qs = new URLSearchParams(href.split('?')[1]);
		expect(qs.get('filters[0][value][start]')).toBe('2024-01-01');
		expect(qs.get('filters[0][value][end]')).toBe('2024-12-31');
		expect(qs.getAll('filters[1][value][]')).toEqual(['A', 'B']);
		expect(qs.get('filters[1][connector]')).toBe('OR');
	});

	it('no list route or no terms → null (plain cell, never a broken link)', () => {
		expect(filteredEntityListHref(census, 'nope', [{ field: 'x', value: '1' }])).toBeNull();
		expect(filteredEntityListHref(census, 'job_run', [])).toBeNull();
	});
});

describe('entityRefHref', () => {
	it('detail route substitutes the value', () => {
		expect(entityRefHref(census, { entity: 'job_trigger' }, 'u-1')).toBe(
			'/system/job/triggers/u-1'
		);
	});
	it('route:"list" filters by filter_field (uuid default)', () => {
		const href = entityRefHref(census, { entity: 'job_run', route: 'list', filter_field: 'status' }, 'OK')!;
		const qs = new URLSearchParams(href.split('?')[1]);
		expect(qs.get('filters[0][field]')).toBe('status');
		expect(qs.get('filters[0][value]')).toBe('OK');
	});
});

describe('reverseRefHref', () => {
	it('expands value_template against the row', () => {
		const href = reverseRefHref(
			census,
			{ entity: 'job_run', filter_field: 'schedule_subject', value_template: 'jobs.sched.trigger.{uuid}' },
			'uuid',
			{ uuid: 'abc' }
		)!;
		const qs = new URLSearchParams(href.split('?')[1]);
		expect(qs.get('filters[0][field]')).toBe('schedule_subject');
		expect(qs.get('filters[0][value]')).toBe('jobs.sched.trigger.abc');
	});
	it('defaults the template to the parent uid', () => {
		const href = reverseRefHref(
			census,
			{ entity: 'job_run', filter_field: 'trigger_uuid' },
			'uuid',
			{ uuid: 'abc' }
		)!;
		expect(new URLSearchParams(href.split('?')[1]).get('filters[0][value]')).toBe('abc');
	});
});
