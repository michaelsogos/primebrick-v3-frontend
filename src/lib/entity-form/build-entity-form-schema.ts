/**
 * `buildEntityFormSchema` — the entity-form zod object for a
 * `page_props.form` declaration, built from the served `EntityMeta`.
 * Field semantics come from `fieldSpecToZod` (ui), which delegates every
 * rule to the core `checkFieldValue` predicate — the same predicate the
 * wire-side validators run, so form and transport cannot drift. What this
 * file adds is only the form binding: `required` wraps, `'' → undefined`
 * normalization for optional fields, and the closed cross-field
 * `validators` registry.
 *
 * Enforcement contract: every `FormFieldPlacement.key` MUST exist in
 * `meta.columns` — an unknown key throws at render-prepare time (drift
 * between the page declaration and the entity is a bug, not a warning).
 *
 * `validators` is a CLOSED registry of host-implemented cross-field rules —
 * an unknown key throws.
 */
import { z } from 'zod';
import { fieldSpecToZod, type FormPageDecl, type MetaColumn } from '@primebrick/ui';
import type { EntityMeta } from '$lib/entity-list/types';
import {
	extJsonParse,
	isValidNatsSubject,
	isValidScheduleSpec,
	jsonSchemaCheck,
	jobTriggerShapeIssues,
	payloadMapConformance,
} from '@primebrick/ui';

export { isValidNatsSubject, isValidScheduleSpec };

/**
 * Structural check driven by an authored `json_schema` prop — the boolean
 * facade over the shared `jsonSchemaCheck` predicate (same rules the wire
 * validators run).
 */
export function jsonValueMatchesSchema(value: unknown, schema: Record<string, unknown>): boolean {
	return jsonSchemaCheck(value, schema).length === 0;
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
};

/**
 * Host-injected environment for schema construction — the seam that lets a
 * STATIC zod schema evaluate LIVE data. `resolveCallable` returns the
 * callable's emitted `payload_schema` for a `target_subject`; the
 * `payload_map_conformance` validator calls it on every validation pass,
 * so the schema stays static while the resolved contract follows the
 * selected callable.
 */
export interface EntityFormEnv {
	resolveCallable?: (subject: string) => Record<string, unknown> | undefined;
}

/** Closed cross-field validator registry — the `validators` vocabulary. */
const CROSS_FIELD_VALIDATORS: Record<
	string,
	(data: Record<string, unknown>, ctx: z.RefinementCtx, env: EntityFormEnv) => void
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
	/** `job_trigger` shape — `event_subject`/`schedule_spec` are mutually
	 *  mandatory (at least one); `execution_context:"user"` needs an event
	 *  source to forward auth headers from (schedule-only uses `me`/`system`).
	 *  Shares the core `jobTriggerShapeIssues` predicate with the service-side
	 *  `assertTriggerShape` hook — one rule, two surfaces. */
	job_trigger_shape: (data, ctx) => {
		for (const i of jobTriggerShapeIssues(data)) {
			ctx.addIssue({ code: 'custom', path: [i.path], message: i.message });
		}
	},
	/** `payload_map` must conform to the selected callable's emitted
	 *  `payload_schema`: required destination fields covered (map entry or
	 *  `x_inject`/`x_semantic` annotation) and every `const` value
	 *  satisfying the prop's portable constraints. The map binds as a JSON
	 *  string — an EMPTY/absent document is NOT a pass: required fields
	 *  stay unmapped and produce issues, exactly like the JH write hook
	 *  (`payloadMapConformance(map ?? {}, schema)`) that rejects the write
	 *  server-side. Same checker, same contract — no drift. */
	payload_map_conformance: (data, ctx, env) => {
		const subject = data.target_subject;
		if (typeof subject !== 'string' || subject.length === 0) return;
		const schema = env.resolveCallable?.(subject);
		if (!schema) return; // callable not selected/resolvable — nothing to check against
		const raw = data.payload_map;
		let map: unknown = raw ?? {};
		if (typeof raw === 'string') {
			const trimmed = raw.trim();
			if (trimmed.length === 0) map = {};
			else {
				try {
					map = extJsonParse(trimmed);
				} catch {
					return; // malformed JSON already flagged by the field-level check
				}
			}
		}
		for (const i of payloadMapConformance(map as Record<string, unknown>, schema)) {
			ctx.addIssue({ code: 'custom', path: ['payload_map'], message: i.message });
		}
	},
};

/**
 * Build the zod object for `page_props.form` — throws when a placement key
 * is absent from `meta.columns` or `validators` names an unknown rule.
 */
export function buildEntityFormSchema(
	meta: EntityMeta,
	decl: FormPageDecl,
	env: EntityFormEnv = {},
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
		let s: z.ZodTypeAny = fieldSpecToZod(col as MetaColumn, { required });
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
		schema = schema.superRefine((data, ctx) => validator(data, ctx, env)) as unknown as z.ZodObject<
			Record<string, z.ZodTypeAny>
		>;
	}
	return { schema, fields };
}
