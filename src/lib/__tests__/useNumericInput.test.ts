import { describe, it, expect } from 'vitest';
import { useNumericInput } from '$lib/composables/useNumericInput.svelte';

describe('useNumericInput', () => {
  // Helper to create a composable with simple reactive getters
  function createComposable(
    type: 'bigint' | 'number' | 'money',
    type_config: string | null,
    value: string | bigint | number = '',
    lang: string = 'en-GB',
  ) {
    let _type = type;
    let _type_config = type_config;
    let _value = value;
    let _lang = lang;
    return {
      num: useNumericInput({
        type: () => _type,
        type_config: () => _type_config,
        value: () => _value,
        lang: () => _lang,
      }),
      setType: (t: typeof _type) => { _type = t; },
      setTypeConfig: (tc: typeof _type_config) => { _type_config = tc; },
      setValue: (v: typeof _value) => { _value = v; },
      setLang: (l: typeof _lang) => { _lang = l; },
    };
  }

  // ─── isUnsigned ──────────────────────────────────────────────────────

  it('isUnsigned is false when type_config is null', () => {
    const { num } = createComposable('bigint', null);
    expect(num.isUnsigned).toBe(false);
  });

  it('isUnsigned is false when validation.unsigned is absent', () => {
    const { num } = createComposable('bigint', JSON.stringify({ validation: { required: true, rules: {} } }));
    expect(num.isUnsigned).toBe(false);
  });

  it('isUnsigned is false when validation.unsigned is false', () => {
    const { num } = createComposable('bigint', JSON.stringify({ validation: { unsigned: false, required: true, rules: {} } }));
    expect(num.isUnsigned).toBe(false);
  });

  it('isUnsigned is true when validation.unsigned is true', () => {
    const { num } = createComposable('bigint', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    expect(num.isUnsigned).toBe(true);
  });

  it('isUnsigned is false when type_config is invalid JSON', () => {
    const { num } = createComposable('bigint', '{invalid json}');
    expect(num.isUnsigned).toBe(false);
  });

  // ─── effectiveMin ────────────────────────────────────────────────────

  it('effectiveMin is null when no min rule and not unsigned', () => {
    const { num } = createComposable('bigint', JSON.stringify({ validation: { required: true, rules: {} } }));
    expect(num.effectiveMin).toBe(null);
  });

  it('effectiveMin is "0" when unsigned and no explicit min rule', () => {
    const { num } = createComposable('bigint', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    expect(num.effectiveMin).toBe('0');
  });

  it('effectiveMin respects explicit min rule over default 0', () => {
    const { num } = createComposable('bigint', JSON.stringify({
      validation: { unsigned: true, required: true, rules: { min: { value: 10, error_label_key: 'err.min' } } },
    }));
    expect(num.effectiveMin).toBe('10');
  });

  it('effectiveMin is the explicit min value when not unsigned', () => {
    const { num } = createComposable('number', JSON.stringify({
      validation: { required: true, rules: { min: { value: -5, error_label_key: 'err.min' } } },
    }));
    expect(num.effectiveMin).toBe('-5');
  });

  it('effectiveMin is null when type_config is null', () => {
    const { num } = createComposable('money', null);
    expect(num.effectiveMin).toBe(null);
  });

  // ─── inputMode ───────────────────────────────────────────────────────

  it('inputMode is "numeric" for bigint', () => {
    const { num } = createComposable('bigint', null);
    expect(num.inputMode).toBe('numeric');
  });

  it('inputMode is "decimal" for number', () => {
    const { num } = createComposable('number', null);
    expect(num.inputMode).toBe('decimal');
  });

  it('inputMode is "decimal" for money', () => {
    const { num } = createComposable('money', null);
    expect(num.inputMode).toBe('decimal');
  });

  // ─── rawValue + syncFromProp ─────────────────────────────────────────

  it('rawValue is initialized from the external value', () => {
    const { num } = createComposable('bigint', null, '42');
    expect(num.rawValue).toBe('42');
  });

  it('rawValue converts bigint to string', () => {
    const { num } = createComposable('bigint', null, 42n);
    expect(num.rawValue).toBe('42');
  });

  it('rawValue converts number to string', () => {
    const { num } = createComposable('number', null, 3.14);
    expect(num.rawValue).toBe('3.14');
  });

  it('syncFromProp updates rawValue from the external value', () => {
    const ctx = createComposable('bigint', null, '42');
    ctx.setValue('99');
    ctx.num.syncFromProp();
    expect(ctx.num.rawValue).toBe('99');
  });

  // ─── filterInput (signed bigint) ─────────────────────────────────────

  it('filterInput strips non-digits for signed bigint', () => {
    const { num } = createComposable('bigint', null);
    num.filterInput('12abc34');
    expect(num.rawValue).toBe('1234');
  });

  it('filterInput keeps one leading minus for signed bigint', () => {
    const { num } = createComposable('bigint', null);
    num.filterInput('-42');
    expect(num.rawValue).toBe('-42');
  });

  it('filterInput prevents double minus for signed bigint', () => {
    const { num } = createComposable('bigint', null);
    num.filterInput('--42');
    expect(num.rawValue).toBe('-42');
  });

  it('filterInput keeps only one leading minus for signed bigint', () => {
    const { num } = createComposable('bigint', null);
    num.filterInput('--42-');
    expect(num.rawValue).toBe('-42');
  });

  // ─── filterInput (unsigned bigint) ───────────────────────────────────

  it('filterInput strips minus for unsigned bigint', () => {
    const { num } = createComposable('bigint', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    num.filterInput('-42');
    expect(num.rawValue).toBe('42');
  });

  it('filterInput strips plus for unsigned bigint', () => {
    const { num } = createComposable('bigint', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    num.filterInput('+42');
    expect(num.rawValue).toBe('42');
  });

  it('filterInput strips all non-digits for unsigned bigint', () => {
    const { num } = createComposable('bigint', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    num.filterInput('--42++abc');
    expect(num.rawValue).toBe('42');
  });

  // ─── filterInput (signed number, en-GB) ──────────────────────────────

  it('filterInput keeps decimal point for signed number (en-GB)', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    num.filterInput('3.14');
    expect(num.rawValue).toBe('3.14');
  });

  it('filterInput keeps only one decimal point for signed number (en-GB)', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    num.filterInput('3.1.4');
    expect(num.rawValue).toBe('3.14');
  });

  it('filterInput keeps leading minus for signed number (en-GB)', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    num.filterInput('-3.14');
    expect(num.rawValue).toBe('-3.14');
  });

  it('filterInput prevents double minus for signed number (en-GB)', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    num.filterInput('--3.14');
    expect(num.rawValue).toBe('-3.14');
  });

  // ─── filterInput (unsigned number) ───────────────────────────────────

  it('filterInput strips minus for unsigned number', () => {
    const { num } = createComposable('number', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    num.filterInput('-3.14');
    expect(num.rawValue).toBe('3.14');
  });

  it('filterInput strips plus for unsigned number', () => {
    const { num } = createComposable('number', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    num.filterInput('+3.14');
    expect(num.rawValue).toBe('3.14');
  });

  it('filterInput keeps one decimal point for unsigned number (en-GB)', () => {
    const { num } = createComposable('number', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }), '', 'en-GB');
    num.filterInput('3.1.4');
    expect(num.rawValue).toBe('3.14');
  });

  // ─── filterInput (locale-aware decimal separator) ────────────────────

  it('filterInput accepts comma decimal separator in it-IT', () => {
    const { num } = createComposable('number', null, '', 'it-IT');
    num.filterInput('3,14');
    expect(num.rawValue).toBe('3.14');
  });

  it('filterInput rejects dot as decimal separator in it-IT (treated as thousand sep, stripped)', () => {
    const { num } = createComposable('number', null, '', 'it-IT');
    // In it-IT, dot is the thousand separator — it gets stripped
    num.filterInput('3.14');
    expect(num.rawValue).toBe('314');
  });

  it('filterInput accepts dot decimal separator in en-GB', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    num.filterInput('3.14');
    expect(num.rawValue).toBe('3.14');
  });

  it('filterInput rejects comma as decimal separator in en-GB (treated as thousand sep, stripped)', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    // In en-GB, comma is the thousand separator — it gets stripped
    num.filterInput('3,14');
    expect(num.rawValue).toBe('314');
  });

  it('filterInput strips thousand separators in it-IT (dot)', () => {
    const { num } = createComposable('number', null, '', 'it-IT');
    num.filterInput('1.234.567,89');
    expect(num.rawValue).toBe('1234567.89');
  });

  it('filterInput strips thousand separators in en-GB (comma)', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    num.filterInput('1,234,567.89');
    expect(num.rawValue).toBe('1234567.89');
  });

  // ─── normalize ──────────────────────────────────────────────────────

  it('normalize strips leading zeros from integer part', () => {
    const { num } = createComposable('money', null);
    num.rawValue = '000000000011123';
    num.normalize();
    expect(num.rawValue).toBe('11123');
  });

  it('normalize reduces all-zero integer part to single zero', () => {
    const { num } = createComposable('money', null);
    num.rawValue = '000';
    num.normalize();
    expect(num.rawValue).toBe('0');
  });

  it('normalize keeps single zero', () => {
    const { num } = createComposable('money', null);
    num.rawValue = '0';
    num.normalize();
    expect(num.rawValue).toBe('0');
  });

  it('normalize preserves decimal part', () => {
    const { num } = createComposable('money', null);
    num.rawValue = '0.50';
    num.normalize();
    expect(num.rawValue).toBe('0.50');
  });

  it('normalize strips leading zeros before decimal, keeps one zero', () => {
    const { num } = createComposable('money', null);
    num.rawValue = '000.50';
    num.normalize();
    expect(num.rawValue).toBe('0.50');
  });

  it('normalize preserves negative sign', () => {
    const { num } = createComposable('number', null);
    num.rawValue = '-000123';
    num.normalize();
    expect(num.rawValue).toBe('-123');
  });

  it('normalize preserves negative sign with decimal', () => {
    const { num } = createComposable('number', null);
    num.rawValue = '-0.50';
    num.normalize();
    expect(num.rawValue).toBe('-0.50');
  });

  it('normalize leaves empty string unchanged', () => {
    const { num } = createComposable('money', null);
    num.rawValue = '';
    num.normalize();
    expect(num.rawValue).toBe('');
  });

  it('normalize leaves lone minus unchanged', () => {
    const { num } = createComposable('number', null);
    num.rawValue = '-';
    num.normalize();
    expect(num.rawValue).toBe('-');
  });

  it('normalize handles large bigint-style value', () => {
    const { num } = createComposable('bigint', null);
    num.rawValue = '0000000000000000123';
    num.normalize();
    expect(num.rawValue).toBe('123');
  });

  // ─── currency ───────────────────────────────────────────────────────

  it('currency defaults to EUR when type_config is null', () => {
    const { num } = createComposable('money', null);
    expect(num.currency).toBe('EUR');
  });

  it('currency defaults to EUR when type_config has no currency field', () => {
    const { num } = createComposable('money', JSON.stringify({ validation: { required: true, rules: {} } }));
    expect(num.currency).toBe('EUR');
  });

  it('currency reads from type_config', () => {
    const { num } = createComposable('money', JSON.stringify({ currency: 'USD', validation: { required: true, rules: {} } }));
    expect(num.currency).toBe('USD');
  });

  it('currency is EUR for non-money types', () => {
    const { num } = createComposable('bigint', null);
    expect(num.currency).toBe('EUR');
  });

  // ─── filterInput (money) ─────────────────────────────────────────────

  it('filterInput works for money type', () => {
    const { num } = createComposable('money', JSON.stringify({ currency: 'EUR', validation: { unsigned: true, required: true, rules: {} } }));
    num.filterInput('-99.99');
    expect(num.rawValue).toBe('99.99');
  });

  // ─── toNative ────────────────────────────────────────────────────────

  it('toNative converts to bigint for bigint type', () => {
    const { num } = createComposable('bigint', null);
    num.rawValue = '42';
    expect(num.toNative()).toBe(42n);
  });

  it('toNative converts to number for number type', () => {
    const { num } = createComposable('number', null);
    num.rawValue = '3.14';
    expect(num.toNative()).toBe(3.14);
  });

  it('toNative converts to number for money type', () => {
    const { num } = createComposable('money', null);
    num.rawValue = '99.99';
    expect(num.toNative()).toBe(99.99);
  });

  it('toNative returns empty string for empty input', () => {
    const { num } = createComposable('bigint', null);
    num.rawValue = '';
    expect(num.toNative()).toBe('');
  });

  it('toNative returns string for unparseable bigint', () => {
    const { num } = createComposable('bigint', null);
    num.rawValue = '-';
    expect(num.toNative()).toBe('-');
  });

  it('toNative returns string for unparseable number', () => {
    const { num } = createComposable('number', null);
    num.rawValue = 'abc';
    expect(num.toNative()).toBe('abc');
  });

  // ─── locale separators ───────────────────────────────────────────────

  it('decimalSeparator is "." for en-GB', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    expect(num.decimalSeparator).toBe('.');
  });

  it('decimalSeparator is "," for it-IT', () => {
    const { num } = createComposable('number', null, '', 'it-IT');
    expect(num.decimalSeparator).toBe(',');
  });

  it('thousandSeparator is "," for en-GB', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    expect(num.thousandSeparator).toBe(',');
  });

  it('thousandSeparator is "." for it-IT', () => {
    const { num } = createComposable('number', null, '', 'it-IT');
    expect(num.thousandSeparator).toBe('.');
  });

  // ─── displayValue (locale-aware formatting) ──────────────────────────

  it('displayValue formats with thousand separators in en-GB', () => {
    const { num } = createComposable('number', null, '1234567.89', 'en-GB');
    expect(num.displayValue).toBe('1,234,567.89');
  });

  it('displayValue formats with thousand separators in it-IT', () => {
    const { num } = createComposable('number', null, '1234567.89', 'it-IT');
    expect(num.displayValue).toBe('1.234.567,89');
  });

  it('displayValue formats bigint with thousand separators in en-GB', () => {
    const { num } = createComposable('bigint', null, '1234567', 'en-GB');
    expect(num.displayValue).toBe('1,234,567');
  });

  it('displayValue formats bigint with thousand separators in it-IT', () => {
    const { num } = createComposable('bigint', null, '1234567', 'it-IT');
    expect(num.displayValue).toBe('1.234.567');
  });

  it('displayValue shows empty string for empty raw value', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    expect(num.displayValue).toBe('');
  });

  it('displayValue shows lone minus for minus raw value', () => {
    const { num } = createComposable('number', null, '-', 'en-GB');
    expect(num.displayValue).toBe('-');
  });

  it('displayValue updates when lang changes', () => {
    // Note: plain `let` in test helper is not reactive, so we create two
    // composables to verify locale-dependent formatting.
    const { num: numEn } = createComposable('number', null, '1234.5', 'en-GB');
    expect(numEn.displayValue).toBe('1,234.5');
    const { num: numIt } = createComposable('number', null, '1234.5', 'it-IT');
    expect(numIt.displayValue).toBe('1.234,5');
  });

  it('displayValue preserves trailing decimal separator (en-GB)', () => {
    const { num } = createComposable('number', null, '1234.', 'en-GB');
    expect(num.displayValue).toBe('1,234.');
  });

  it('displayValue preserves trailing decimal separator (it-IT)', () => {
    const { num } = createComposable('number', null, '1234.', 'it-IT');
    expect(num.displayValue).toBe('1.234,');
  });

  it('displayValue preserves trailing zeros in fractional part (en-GB)', () => {
    const { num } = createComposable('number', null, '1234.00', 'en-GB');
    expect(num.displayValue).toBe('1,234.00');
  });

  it('displayValue preserves trailing zeros in fractional part (it-IT)', () => {
    const { num } = createComposable('number', null, '1234.00', 'it-IT');
    expect(num.displayValue).toBe('1.234,00');
  });

  it('displayValue preserves single fractional digit (en-GB)', () => {
    const { num } = createComposable('number', null, '1234.5', 'en-GB');
    expect(num.displayValue).toBe('1,234.5');
  });

  it('displayValue shows 0. for lone decimal point (en-GB)', () => {
    const { num } = createComposable('number', null, '.', 'en-GB');
    expect(num.displayValue).toBe('0.');
  });

  it('displayValue shows 0, for lone decimal comma (it-IT)', () => {
    const { num } = createComposable('number', null, '.', 'it-IT');
    expect(num.displayValue).toBe('0,');
  });

  // ─── computeCursorPosition ───────────────────────────────────────────

  it('computeCursorPosition returns end position for empty input', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    const pos = num.computeCursorPosition(0, '', '');
    expect(pos).toBe(0);
  });

  it('computeCursorPosition tracks digit position through formatting', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    // Old display "1234", cursor after 4th char → 4 digits before cursor
    // New display "1,234" → position after 4th digit = index 5
    const pos = num.computeCursorPosition(4, '1234', '1,234');
    expect(pos).toBe(5);
  });

  it('computeCursorPosition handles decimal separator in en-GB', () => {
    const { num } = createComposable('number', null, '', 'en-GB');
    // Old display "3.14", cursor after the dot (index 2) → 2 meaningful chars (3, .)
    // New display "3.14" → position after 2nd meaningful char = index 2
    const pos = num.computeCursorPosition(2, '3.14', '3.14');
    expect(pos).toBe(2);
  });
});
