/**
 * elt-numeric-cell — pins the ELT numeric-cell contract that had silently
 * regressed: every number column renders locale-formatted (group+decimal
 * separators, UoM aware) and right-aligned by default.
 *
 * The two seams under test:
 *  - getAuditFieldValue MUST route non-auditable cells through the injected
 *    formatListCellValue WITH the full row — `uom.field` siblings resolve
 *    from it (the regression: the formatter param was ignored, cells fell
 *    back to raw toDisplayString).
 *  - entityListDataCellAlignClass MUST give `type:"number"` the numeric
 *    anatomy (right-aligned tabular digits) — headers stay left-aligned.
 */
import { describe, it, expect, vi } from 'vitest';
import { formatListCellValue } from '@primebrick/ui';
import { getAuditFieldValue } from '../components/entity-list-table/utils/cell-formatting';
import { entityListDataCellAlignClass } from '../components/entity-list-table/utils/cell-styling';
import type { MetaColumn } from '../entity-list/types';
import type { UiLang } from '../i18n/languages';

const col = (c: Partial<MetaColumn>) => c as MetaColumn;

describe('getAuditFieldValue — formatter wiring', () => {
	it('routes a number cell through the injected formatter, row included', () => {
		const fmt = vi.fn().mockReturnValue('FMT');
		const c = col({ key: 'duration_ms', type: 'number' });
		const row = { duration_ms: 1234.5, currency_code: 'EUR' };
		expect(getAuditFieldValue(row, c, 'en-GB' as UiLang, fmt)).toBe('FMT');
		expect(fmt).toHaveBeenCalledWith(c, 1234.5, 'en-GB', row);
	});

	it('renders locale separators via the real formatListCellValue', () => {
		const c = col({ key: 'total', type: 'number' });
		expect(getAuditFieldValue({ total: 12345.6 }, c, 'en-GB' as UiLang, formatListCellValue)).toBe('12,345.6');
		// useGrouping:"always" — 4-digit groups hold even where ICU 'auto'
		// would skip them (the it-IT min2 regression this contract kills).
		expect(getAuditFieldValue({ total: 1234.5 }, c, 'it-IT' as UiLang, formatListCellValue)).toBe('1.234,5');
	});

	it('percent uom displays canonical fraction as percent points', () => {
		const c = col({ key: 'rate', type: 'number', uom: { kind: 'percent' } });
		expect(getAuditFieldValue({ rate: 0.125 }, c, 'en-GB' as UiLang, formatListCellValue)).toBe('12.5%');
	});

	it('currency uom resolves the ISO code from the row sibling field', () => {
		const c = col({ key: 'total', type: 'number', uom: { kind: 'currency', field: 'currency_code' } });
		expect(
			getAuditFieldValue({ total: 9.99, currency_code: 'EUR' }, c, 'en-GB' as UiLang, formatListCellValue)
		).toBe('€9.99');
	});

	it('custom uom with a fixed Intl unit renders style:"unit" (duration_ms case)', () => {
		const c = col({ key: 'duration_ms', type: 'number', uom: { kind: 'custom', unit: 'millisecond' } });
		expect(getAuditFieldValue({ duration_ms: 24 }, c, 'it-IT' as UiLang, formatListCellValue)).toBe('24 ms');
		expect(getAuditFieldValue({ duration_ms: 1234 }, c, 'en-GB' as UiLang, formatListCellValue)).toBe('1,234 ms');
	});

	it('auditable *_by columns bypass the formatter (resolved _name wins)', () => {
		const fmt = vi.fn();
		const auditing = [col({ key: 'updated_by', type: 'text' })];
		const out = getAuditFieldValue(
			{ updated_by: 'uuid-1', updated_by_name: 'Mario' },
			col({ key: 'updated_by', type: 'text' }),
			'en-GB' as UiLang,
			fmt,
			auditing
		);
		expect(out).toBe('Mario');
		expect(fmt).not.toHaveBeenCalled();
	});

	it('blankish values render the dash placeholder without formatting', () => {
		const fmt = vi.fn();
		expect(getAuditFieldValue({ n: null }, col({ key: 'n', type: 'number' }), 'en-GB' as UiLang, fmt)).toBe('-');
		expect(fmt).not.toHaveBeenCalled();
	});
});

describe('entityListDataCellAlignClass — numeric anatomy', () => {
	it('number columns are right-aligned with tabular digits', () => {
		expect(entityListDataCellAlignClass(col({ key: 'n', type: 'number' }))).toBe('text-right tabular-nums');
	});

	it('the version column keeps right-alignment (audit-group tail badge)', () => {
		expect(entityListDataCellAlignClass(col({ key: 'version', type: 'number' }))).toBe('text-right');
	});

	it('non-number columns get no alignment override', () => {
		expect(entityListDataCellAlignClass(col({ key: 'name', type: 'text' }))).toBeUndefined();
		expect(entityListDataCellAlignClass(col({ key: 'at', type: 'datetime' }))).toBeUndefined();
	});
});
