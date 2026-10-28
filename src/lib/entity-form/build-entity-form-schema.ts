/**
 * `buildEntityFormSchema` — the entity-form twin of `buildConfigValueSchema`:
 * constructs the zod object for a `page_props.form` declaration from the
 * served `EntityMeta`. Physical constraints (nullable, max_length, pg_type)
 * come from the class-derived projection; semantic rules (format, pattern,
 * min_length, json_schema) are authored on `meta.columns`.
 *
 * Enforcement contract: every `FormFieldPlacement.key` MUST exist in
 * `meta.columns` — an unknown key throws at render-prepare time (drift
 * between the page declaration and the entity is a bug, not a warning).
 *
 * `validators` is a CLOSED registry of host-implemented cross-field rules —
 * an unknown key throws.
 */
import { z } from 'zod';
import type { FormPageDecl } from '@primebrick/ui';
import type { EntityMeta } from '$lib/entity-list/types';
import { parseScheduleSpec } from '@primebrick/ui';

/** NATS subject grammar — mirrors validateEventsDeclaration (sdk). */
const SUBJECT_SEGMENT = /^[A-Za-z0-9_\-]+$/;
export function isValidNatsSubject(subject: string): boolean {
	if (typeof subject !== 'string' || subject.length === 0 || /\s/.test(subject)) return false;
	const segs = subject.split('.');
	for (let i = 0; i < segs.length; i++) {
		const s = segs[i];
		if (s === '*') continue;
		if (s === '>') return i === segs.length - 1;
		if (!SUBJECT_SEGMENT.test(s)) return false;
	}
	return true;
}

/**
 * Minimal structural check driven by an authored `json_schema` prop —
 * supports `type` ("array"|"object"), `items.required`, and per-property
 * `enum` (the RuleFilter `{field, op?, value}` shape). Unknown keywords are
 * ignored — the editor-side Schema carries the full spec for lint/completion.
 */
export function jsonValueMatchesSchema(value: unknown, schema: Record<string, unknown>): boolean {
	const type = schema.type;
	if (type === 'array') {
		if (!Array.isArray(value)) return false;
		const items = schema.items as Record<string, unknown> | undefined;
		if (items) return value.every((item) => jsonValueMatchesSchema(item, items));
		return true;
	}
	if (type === 'object' || (type === undefined && typeof value === 'object' && value !== null && !Array.isArray(value))) {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
		const obj = value as Record<string, unknown>;
		const required = schema.required;
		if (Array.isArray(required) && !required.every((k) => typeof k === 'string' && k in obj)) return false;
		const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
		if (properties) {
			for (const [key, prop] of Object.entries(properties)) {
				if (!(key in obj)) continue;
				if (Array.isArray(prop.enum) && !prop.enum.includes(obj[key])) return false;
				if (prop.type === 'string' && typeof obj[key] !== 'string') return false;
			}
		}
		return true;
	}
	return true;
}

export interface EntityFormFieldSpec {
	/** Ordered placement list — resolved against `meta.columns` by the caller. */
	key: string;
	required: boolean;
}

type ColumnRecord = Record<string, unknown> & {
	format?: string;
	type?: string;
	pg_type?: string;
	nullable?: boolean;
	max_length?: number;
	pattern?: string;
	min_length?: number;
	min?: number;
	max?: number;
	json_schema?: Record<string, unknown>;
	badge?: { values?: Record<string, unknown> };
};

/** Closed cross-field validator registry — the `validators` vocabulary. */
const CROSS_FIELD_VALIDATORS: Record<
	string,
	(data: Record<string, unknown>, ctx: z.RefinementCtx) => void
> = {
	/** `target_subject` must be `jobs.due.<execution_context>.<seg>+` — the
	 *  rule's lane is derived from execution_context, never free. */
	target_matches_lane: (data, ctx) => {
		const target = data.target_subject;
		const lane = data.execution_context;
		if (typeof target !== 'string' || typeof lane !== 'string' || !lane) return;
		const prefix = `jobs.due.${lane}.`;
		if (!target.startsWith(prefix) || target.length <= prefix.length) {
			ctx.addIssue({
				code: 'custom',
				path: ['target_subject'],
				message: `target subject must start with ${prefix}`,
			});
		}
	},
};

function columnSchema(col: ColumnRecord): z.ZodTypeAny {
	const format = col.format;
	const pg = col.pg_type;
	const type = col.type;

	if (type === 'boolean' || pg === 'boolean') return z.boolean();
	if (format === 'number' || format === 'money' || pg === 'integer' || pg === 'bigint' || pg === 'numeric') {
		let s = z.number();
		if (typeof col.min === 'number') s = s.min(col.min);
		if (typeof col.max === 'number') s = s.max(col.max);
		return s;
	}
	if (format === 'json' || pg === 'jsonb' || pg === 'json') {
		// The control binds a JSON string; structure is checked against the
		// authored json_schema. Parsed at the submit boundary.
		return z.string().superRefine((raw, ctx) => {
			const trimmed = raw.trim();
			if (trimmed.length === 0) return; // emptiness handled by required wrap
			try {
				const parsed = JSON.parse(trimmed);
				if (col.json_schema && !jsonValueMatchesSchema(parsed, col.json_schema)) {
					ctx.addIssue({ code: 'custom', message: 'does not match the declared schema' });
				}
			} catch {
				ctx.addIssue({ code: 'custom', message: 'invalid JSON' });
			}
		});
	}

	let s = z.string();
	if (typeof col.max_length === 'number') s = s.max(col.max_length);
	if (typeof col.min_length === 'number') s = s.min(col.min_length);
	if (typeof col.pattern === 'string') s = s.regex(new RegExp(col.pattern));
	if (format === 'email') s = s.email();
	if (format === 'url') s = s.url();
	if (format === 'nats_subject') {
		s = s.refine(isValidNatsSubject, { message: 'invalid NATS subject' });
	}
	if (format === 'schedule_spec') {
		s = s.refine((v) => parseScheduleSpec(v).ok, { message: 'invalid schedule spec' });
	}
	return s;
}

/**
 * Build the zod object for `page_props.form` — throws when a placement key
 * is absent from `meta.columns` or `validators` names an unknown rule.
 */
export function buildEntityFormSchema(
	meta: EntityMeta,
	decl: FormPageDecl,
): { schema: z.ZodObject<Record<string, z.ZodTypeAny>>; fields: EntityFormFieldSpec[] } {
	const columns = new Map(meta.columns.map((c) => [c.key, c as unknown as ColumnRecord]));
	const shape: Record<string, z.ZodTypeAny> = {};
	const fields: EntityFormFieldSpec[] = [];

	for (const placement of decl.fields) {
		const col = columns.get(placement.key);
		if (!col) {
			throw new Error(
				`page_props.form declares field '${placement.key}' but entity meta has no such column — declaration/entity drift`,
			);
		}
		const required = placement.required ?? col.nullable === false;
		let s: z.ZodTypeAny = columnSchema(col);
		if (required && s instanceof z.ZodString) s = s.min(1);
		fields.push({ key: placement.key, required });
		if (!required) {
			// Optional strings: the control binds `''`, not `undefined` — format
			// refines must not run on empties. Normalize '' / null → undefined
			// so the inner chain only ever sees real values, and the submitted
			// payload carries `undefined` (absent), matching the DB contract.
			s = z.preprocess((v) => (v === '' || v === null ? undefined : v), s.optional());
		}
		shape[placement.key] = s;
	}

	let schema = z.object(shape);
	for (const key of decl.validators ?? []) {
		const validator = CROSS_FIELD_VALIDATORS[key];
		if (!validator) {
			throw new Error(`page_props.form declares unknown validator '${key}' — closed registry`);
		}
		schema = schema.superRefine(validator) as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>;
	}
	return { schema, fields };
}
