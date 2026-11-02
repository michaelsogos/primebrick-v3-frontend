import { describe, expect, it } from 'vitest';
import { buildEntityFormSchema, isValidNatsSubject, jsonValueMatchesSchema } from '../entity-form/build-entity-form-schema';
import type { EntityMeta } from '../entity-list/types';

const col = (over: Record<string, unknown>) => ({
	key: 'x',
	label_key: 'k',
	type: 'text',
	order: 1,
	...over,
});

const meta = (columns: Record<string, unknown>[]): EntityMeta =>
	({
		entity: 'job_rule',
		translation_key: 'job_rule',
		uid: 'uuid',
		display_field: 'name',
		columns,
	}) as EntityMeta;

describe('buildEntityFormSchema — column constraints drive the zod shape', () => {
	it('throws on a placement key absent from meta.columns (drift)', () => {
		expect(() =>
			buildEntityFormSchema(meta([col({ key: 'name' })]), { fields: [{ key: 'ghost' }] }),
		).toThrow(/no such column/);
	});

	it('required when nullable:false, optional when nullable:true or required:false', () => {
		const { schema } = buildEntityFormSchema(
			meta([
				col({ key: 'name', nullable: false, max_length: 5 }),
				col({ key: 'note', nullable: true }),
			]),
			{ fields: [{ key: 'name' }, { key: 'note' }] },
		);
		expect(schema.safeParse({ name: '' }).success).toBe(false);
		expect(schema.safeParse({ name: 'abcdef' }).success).toBe(false); // max_length
		expect(schema.safeParse({ name: 'abc' }).success).toBe(true);
	});

	it('applies authored pattern/min_length and nats_subject format', () => {
		const { schema } = buildEntityFormSchema(
			meta([col({ key: 'event_subject', format: 'nats_subject', nullable: false })]),
			{ fields: [{ key: 'event_subject' }] },
		);
		expect(schema.safeParse({ event_subject: 'has space' }).success).toBe(false);
		expect(schema.safeParse({ event_subject: 'bad..seg' }).success).toBe(false);
		expect(schema.safeParse({ event_subject: 'customer.updated' }).success).toBe(true);
		expect(schema.safeParse({ event_subject: 'customer.*' }).success).toBe(true);
		expect(schema.safeParse({ event_subject: '>' }).success).toBe(true); // legal wildcard (match-all)
		expect(schema.safeParse({ event_subject: 'a.>' }).success).toBe(true);
	});

	it('schedule_spec format validates the NATS grammar', () => {
		const { schema } = buildEntityFormSchema(
			meta([col({ key: 'schedule_spec', format: 'schedule_spec', nullable: false })]),
			{ fields: [{ key: 'schedule_spec' }] },
		);
		expect(schema.safeParse({ schedule_spec: '@every 5m' }).success).toBe(true);
		expect(schema.safeParse({ schedule_spec: '*/5 * * * *' }).success).toBe(true);
		expect(schema.safeParse({ schedule_spec: 'not a spec' }).success).toBe(false);
	});

	it('json format validates JSON and applies json_schema structure', () => {
		const { schema } = buildEntityFormSchema(
			meta([
				col({
					key: 'filter',
					format: 'json',
					pg_type: 'jsonb',
					nullable: true,
					json_schema: {
						type: 'array',
						items: {
							type: 'object',
							required: ['field'],
							properties: { field: { type: 'string' }, op: { enum: ['eq', 'gt'] } },
						},
					},
				}),
			]),
			{ fields: [{ key: 'filter' }] },
		);
		expect(schema.safeParse({}).success).toBe(true); // optional
		expect(schema.safeParse({ filter: '[{"field":"a","op":"eq"}]' }).success).toBe(true);
		expect(schema.safeParse({ filter: '[{"op":"eq"}]' }).success).toBe(false); // missing field
		expect(schema.safeParse({ filter: '[{"field":"a","op":"bogus"}]' }).success).toBe(false);
		expect(schema.safeParse({ filter: 'not json' }).success).toBe(false);
	});

	it('cross-field validators run and unknown validator keys throw', () => {
		expect(() =>
			buildEntityFormSchema(meta([col({ key: 'a' })]), {
				fields: [{ key: 'a' }],
				validators: ['not_a_rule'],
			}),
		).toThrow(/unknown validator/);

		const { schema } = buildEntityFormSchema(
			meta([
				col({ key: 'execution_context', type: 'badge', nullable: false }),
				col({ key: 'target_subject', format: 'nats_subject', nullable: false }),
			]),
			{
				fields: [{ key: 'execution_context' }, { key: 'target_subject' }],
				validators: ['target_matches_lane'],
			},
		);
		expect(
			schema.safeParse({ execution_context: 'user', target_subject: 'jobs.due.user.ai.run' }).success,
		).toBe(true);
		expect(
			schema.safeParse({ execution_context: 'user', target_subject: 'jobs.due.system.ai.run' }).success,
		).toBe(false);
	});
});

describe('isValidNatsSubject — grammar parity with validateEventsDeclaration', () => {
	it('accepts literals, single-star segments, terminal gt', () => {
		expect(isValidNatsSubject('jobs.ctl.rules.changed')).toBe(true);
		expect(isValidNatsSubject('webhook.*.received')).toBe(true);
		expect(isValidNatsSubject('jobs.result.>')).toBe(true);
	});
	it('rejects empty segments, whitespace, mid-string gt', () => {
		expect(isValidNatsSubject('a..b')).toBe(false);
		expect(isValidNatsSubject('a .b')).toBe(false);
		expect(isValidNatsSubject('a.>.b')).toBe(false);
		expect(isValidNatsSubject('a.ab*c')).toBe(false);
	});
});

describe('jsonValueMatchesSchema — structural subset check', () => {
	it('array + required + enum', () => {
		const schema = {
			type: 'array',
			items: { type: 'object', required: ['field'], properties: { op: { enum: ['eq'] } } },
		};
		expect(jsonValueMatchesSchema([{ field: 'x' }], schema)).toBe(true);
		expect(jsonValueMatchesSchema([{ field: 'x', op: 'eq' }], schema)).toBe(true);
		expect(jsonValueMatchesSchema([{ field: 'x', op: 'zz' }], schema)).toBe(false);
		expect(jsonValueMatchesSchema({}, schema)).toBe(false);
	});
});
