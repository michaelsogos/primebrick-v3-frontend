/**
 * isStaleFieldRejection — the narrow gate for the stale-meta self-heal.
 * Only a /list 400 that fails closed on a FIELD reference (sort_key,
 * search_in, filter field/op/value, BETWEEN) may trigger meta refetch +
 * retry. Envelope-param rejections (page, page_size, deleted_records),
 * server-config errors and non-400 codes must NOT — healing cannot fix
 * them, and retrying them would only loop.
 */
import { describe, it, expect } from 'vitest';
import { isStaleFieldRejection } from '../entity-list/api-list-error';

describe('isStaleFieldRejection', () => {
	it('accepts every stale field-key rejection family', () => {
		const cases = [
			'Invalid sort_key "code" for SequenceEntity — must be one of: name',
			'Invalid search_in ["code"] for SequenceEntity — must be one of: name',
			'Invalid filter field "code" — allowed: name, uuid',
			'Invalid filter op "contains" — allowed: eq, neq',
			'Invalid filter value {"x":1} for "status" — expected string',
			'BETWEEN on "created_at" needs both start and end'
		];
		for (const detail of cases) {
			expect(
				isStaleFieldRejection({ internalCode: 'VALIDATION', code: 'Validation error', detail }),
				detail
			).toBe(true);
		}
	});

	it('accepts UNKNOWN_COLUMN unconditionally — the code IS the field signal', () => {
		expect(
			isStaleFieldRejection({ internalCode: 'UNKNOWN_COLUMN', code: 'Validation error', detail: 'x' })
		).toBe(true);
		expect(isStaleFieldRejection({ internalCode: 'UNKNOWN_COLUMN', code: null, detail: null })).toBe(true);
	});

	it('rejects envelope-param rejections — a meta refetch cannot fix them', () => {
		const cases = [
			'Invalid page "0" — must be a positive integer',
			'Invalid page_size "999" — maximum is 250',
			'Invalid deleted_records "X" — must be one of: EXCLUDED, INCLUDED, ONLY',
			'Entity SequenceEntity exposes no searchable fields — `search` cannot be evaluated'
		];
		for (const detail of cases) {
			expect(
				isStaleFieldRejection({ internalCode: 'VALIDATION', code: 'Validation error', detail }),
				detail
			).toBe(false);
		}
	});

	it('rejects VALIDATION with no/garbled detail — fail closed, not fail open', () => {
		expect(isStaleFieldRejection({ internalCode: 'VALIDATION', code: 'Validation error', detail: null })).toBe(
			false
		);
		expect(isStaleFieldRejection({ internalCode: 'VALIDATION', code: 'Validation error', detail: '' })).toBe(
			false
		);
	});

	it('rejects non-validation codes entirely', () => {
		for (const internalCode of ['PAGE_OUT_OF_RANGE', 'ERR01', 'NOT_FOUND', 'DATABASE_UNAVAILABLE']) {
			expect(
				isStaleFieldRejection({
					internalCode,
					code: null,
					detail: 'Invalid sort_key "code" for X — must be one of: name'
				}),
				internalCode
			).toBe(false);
		}
	});

	it('falls back to `code` when `internal_code` is absent (legacy error field)', () => {
		expect(
			isStaleFieldRejection({
				internalCode: null,
				code: 'VALIDATION',
				detail: 'Invalid sort_key "code" for X — must be one of: name'
			})
		).toBe(true);
	});
});
