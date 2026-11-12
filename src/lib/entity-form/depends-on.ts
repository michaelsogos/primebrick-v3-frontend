/**
 * `depends_on` — pure resolvers for the sibling-field edge declared on
 * `MetaColumn.depends_on` (see the core contract). Form-surface only —
 * the dispatcher owns the reactive plumbing (`record`, pivot-row fetch,
 * reset); these functions evaluate one declared edge against a record
 * snapshot so the semantics are unit-testable without a component.
 *
 * Closed semantics, mirrored in the contract docs:
 *   - `filter_field`/`control_prop` ⇒ disabled until the pivot carries a
 *     value; a pivot change resets the dependent's value upstream.
 *   - `disabled_when` ⇒ gate while the condition matches — `prop`
 *     compares the pivot ROW's prop (requires the fetched row — see
 *     `depNeedsPivotRow`), absent `prop` compares the stored value.
 *   - An unresolved prop comparison (row still loading) fails CLOSED —
 *     the dependent stays disabled rather than briefly leaking an
 *     enabled gate.
 */
import type { FilterCondition, MetaColumn, MetaColumnFormat } from '@primebrick/ui';

type DependsOn = NonNullable<MetaColumn['depends_on']>;

/** The pivot's stored value on the form record — `''`/`null`/`undefined`
 *  all count as "no pivot value" (form fields bind `''`). */
export function depPivotValue(
	dep: DependsOn,
	record: Record<string, unknown> | undefined,
): unknown {
	return record?.[dep.field];
}

function isEmptyPivot(v: unknown): boolean {
	return v === undefined || v === null || v === '';
}

/** `true` when the edge reads the pivot's picked ROW — `control_prop`
 *  and `disabled_when.prop` both need it (the row is fetched through the
 *  pivot's ref entity by `usePivotRow`). */
export function depNeedsPivotRow(dep: DependsOn): boolean {
	return dep.control_prop !== undefined || dep.disabled_when?.prop !== undefined;
}

/**
 * The `/list` scope filter a `filter_field` edge appends to the dependent
 * ref-column's options fetch — `filters[0][field]=<filter_field>`,
 * op `"="`, value = the pivot's stored value. Undefined while the pivot
 * is empty (the control is disabled then anyway — see `depDisabled`).
 */
export function depOptionsFilter(
	dep: DependsOn,
	record: Record<string, unknown> | undefined,
): FilterCondition[] | undefined {
	if (!dep.filter_field) return undefined;
	const pivot = depPivotValue(dep, record);
	if (isEmptyPivot(pivot)) return undefined;
	return [{ field: dep.filter_field, op: '=', value: pivot as FilterCondition['value'] }];
}

/**
 * Disabled-state resolution — the union of the two gate semantics:
 *   1. pivot-until-value (implied by `filter_field`/`control_prop`),
 *   2. `disabled_when` condition match.
 * `pivotRow` is the fetched row of a `type:"ref"` pivot — `undefined`
 * while unresolved; a prop-comparison that can't evaluate yet disables
 * (fail-closed, no enabled flash on row load).
 */
export function depDisabled(
	dep: DependsOn,
	record: Record<string, unknown> | undefined,
	pivotRow: Record<string, unknown> | undefined,
): boolean {
	const pivot = depPivotValue(dep, record);
	if ((dep.filter_field || dep.control_prop) && isEmptyPivot(pivot)) return true;
	const w = dep.disabled_when;
	if (!w) return false;
	if (w.prop !== undefined) {
		if (pivotRow === undefined) return true;
		return conditionMatches(pivotRow[w.prop], w);
	}
	return conditionMatches(pivot, w);
}

function conditionMatches(
	actual: unknown,
	w: { equals?: unknown; not?: unknown; values?: readonly unknown[] },
): boolean {
	if (w.equals !== undefined) return actual === w.equals;
	if (w.not !== undefined) return actual !== w.not;
	if (w.values !== undefined) return w.values.some((v) => v === actual);
	return false;
}

/**
 * The `format` a `control_prop` edge resolves — the pivot ROW's prop
 * value verbatim (dict vocabularies are authored to BE format names:
 * `value_kind` ∈ `email|phone|text`). Non-format values return
 * `undefined` — a misspelled row prop degrades to the column's static
 * derivation (text), never crashes the form: it is a DATA anomaly, not a
 * declaration error.
 */
export function depControlFormat(
	dep: DependsOn,
	pivotRow: Record<string, unknown> | undefined,
): MetaColumnFormat | undefined {
	if (!dep.control_prop || pivotRow === undefined) return undefined;
	const v = pivotRow[dep.control_prop];
	if (typeof v !== 'string' || !(DEP_CONTROL_FORMATS as readonly string[]).includes(v))
		return undefined;
	return v as MetaColumnFormat;
}

/** The format literals a `control_prop` may resolve — the closed set of
 *  text-family controls the dispatcher can actually render. Numbers and
 *  structural widgets (json, payload_map, schedule_spec) can never be
 *  data-selected: a contact value is always a string. */
const DEP_CONTROL_FORMATS = [
	'text',
	'textarea',
	'email',
	'url',
	'phone',
] as const satisfies readonly MetaColumnFormat[];

/**
 * Signature of the pivot value — compared by the dispatcher's reset
 * effect: a change while `filter_field`/`control_prop` is declared
 * invalidates the dependent's value (stale picks are integrity leaks —
 * e.g. an Italian legal form surviving a country switch to DE).
 */
export function depPivotSignature(
	dep: DependsOn,
	record: Record<string, unknown> | undefined,
): string {
	const v = depPivotValue(dep, record);
	return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
		? String(v)
		: '';
}

/** Whether a pivot change must clear the dependent's value — the two
 *  value-coupling facets (`filter_field`, `control_prop`). */
export function depResetsOnPivotChange(dep: DependsOn): boolean {
	return dep.filter_field !== undefined || dep.control_prop !== undefined;
}
