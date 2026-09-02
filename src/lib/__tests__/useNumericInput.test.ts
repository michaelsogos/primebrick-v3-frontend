import { describe, it, expect } from 'vitest';
import { useNumericInput } from '$lib/composables/useNumericInput.svelte';

describe('useNumericInput', () => {
  // Helper to create a composable with simple reactive getters
  function createComposable(
    type: 'bigint' | 'number' | 'money',
    type_config: string | null,
    value: string | bigint | number = '',
  ) {
    let _type = type;
    let _type_config = type_config;
    let _value = value;
    return {
      num: useNumericInput({
        type: () => _type,
        type_config: () => _type_config,
        value: () => _value,
      }),
      setType: (t: typeof _type) => { _type = t; },
      setTypeConfig: (tc: typeof _type_config) => { _type_config = tc; },
      setValue: (v: typeof _value) => { _value = v; },
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

  // ─── localValue + syncFromProp ───────────────────────────────────────

  it('localValue is initialized from the external value', () => {
    const { num } = createComposable('bigint', null, '42');
    expect(num.localValue).toBe('42');
  });

  it('localValue converts bigint to string', () => {
    const { num } = createComposable('bigint', null, 42n);
    expect(num.localValue).toBe('42');
  });

  it('localValue converts number to string', () => {
    const { num } = createComposable('number', null, 3.14);
    expect(num.localValue).toBe('3.14');
  });

  it('syncFromProp updates localValue from the external value', () => {
    const ctx = createComposable('bigint', null, '42');
    ctx.setValue('99');
    ctx.num.syncFromProp();
    expect(ctx.num.localValue).toBe('99');
  });

  // ─── filterInput (signed bigint) ─────────────────────────────────────

  it('filterInput strips non-digits for signed bigint', () => {
    const { num } = createComposable('bigint', null);
    num.localValue = '12abc34';
    num.filterInput();
    expect(num.localValue).toBe('1234');
  });

  it('filterInput keeps one leading minus for signed bigint', () => {
    const { num } = createComposable('bigint', null);
    num.localValue = '-42';
    num.filterInput();
    expect(num.localValue).toBe('-42');
  });

  it('filterInput prevents double minus for signed bigint', () => {
    const { num } = createComposable('bigint', null);
    num.localValue = '--42';
    num.filterInput();
    expect(num.localValue).toBe('-42');
  });

  it('filterInput keeps only one leading minus for signed bigint', () => {
    const { num } = createComposable('bigint', null);
    num.localValue = '--42-';
    num.filterInput();
    expect(num.localValue).toBe('-42');
  });

  // ─── filterInput (unsigned bigint) ───────────────────────────────────

  it('filterInput strips minus for unsigned bigint', () => {
    const { num } = createComposable('bigint', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    num.localValue = '-42';
    num.filterInput();
    expect(num.localValue).toBe('42');
  });

  it('filterInput strips plus for unsigned bigint', () => {
    const { num } = createComposable('bigint', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    num.localValue = '+42';
    num.filterInput();
    expect(num.localValue).toBe('42');
  });

  it('filterInput strips all non-digits for unsigned bigint', () => {
    const { num } = createComposable('bigint', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    num.localValue = '--42++abc';
    num.filterInput();
    expect(num.localValue).toBe('42');
  });

  // ─── filterInput (signed number) ─────────────────────────────────────

  it('filterInput keeps decimal point for signed number', () => {
    const { num } = createComposable('number', null);
    num.localValue = '3.14';
    num.filterInput();
    expect(num.localValue).toBe('3.14');
  });

  it('filterInput keeps only one decimal point for signed number', () => {
    const { num } = createComposable('number', null);
    num.localValue = '3.1.4';
    num.filterInput();
    expect(num.localValue).toBe('3.14');
  });

  it('filterInput keeps leading minus for signed number', () => {
    const { num } = createComposable('number', null);
    num.localValue = '-3.14';
    num.filterInput();
    expect(num.localValue).toBe('-3.14');
  });

  it('filterInput prevents double minus for signed number', () => {
    const { num } = createComposable('number', null);
    num.localValue = '--3.14';
    num.filterInput();
    expect(num.localValue).toBe('-3.14');
  });

  // ─── filterInput (unsigned number) ───────────────────────────────────

  it('filterInput strips minus for unsigned number', () => {
    const { num } = createComposable('number', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    num.localValue = '-3.14';
    num.filterInput();
    expect(num.localValue).toBe('3.14');
  });

  it('filterInput strips plus for unsigned number', () => {
    const { num } = createComposable('number', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    num.localValue = '+3.14';
    num.filterInput();
    expect(num.localValue).toBe('3.14');
  });

  it('filterInput keeps one decimal point for unsigned number', () => {
    const { num } = createComposable('number', JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } }));
    num.localValue = '3.1.4';
    num.filterInput();
    expect(num.localValue).toBe('3.14');
  });

  // ─── normalize ──────────────────────────────────────────────────────

  it('normalize strips leading zeros from integer part', () => {
    const { num } = createComposable('money', null);
    num.localValue = '000000000011123';
    num.normalize();
    expect(num.localValue).toBe('11123');
  });

  it('normalize reduces all-zero integer part to single zero', () => {
    const { num } = createComposable('money', null);
    num.localValue = '000';
    num.normalize();
    expect(num.localValue).toBe('0');
  });

  it('normalize keeps single zero', () => {
    const { num } = createComposable('money', null);
    num.localValue = '0';
    num.normalize();
    expect(num.localValue).toBe('0');
  });

  it('normalize preserves decimal part', () => {
    const { num } = createComposable('money', null);
    num.localValue = '0.50';
    num.normalize();
    expect(num.localValue).toBe('0.50');
  });

  it('normalize strips leading zeros before decimal, keeps one zero', () => {
    const { num } = createComposable('money', null);
    num.localValue = '000.50';
    num.normalize();
    expect(num.localValue).toBe('0.50');
  });

  it('normalize preserves negative sign', () => {
    const { num } = createComposable('number', null);
    num.localValue = '-000123';
    num.normalize();
    expect(num.localValue).toBe('-123');
  });

  it('normalize preserves negative sign with decimal', () => {
    const { num } = createComposable('number', null);
    num.localValue = '-0.50';
    num.normalize();
    expect(num.localValue).toBe('-0.50');
  });

  it('normalize leaves empty string unchanged', () => {
    const { num } = createComposable('money', null);
    num.localValue = '';
    num.normalize();
    expect(num.localValue).toBe('');
  });

  it('normalize leaves lone minus unchanged', () => {
    const { num } = createComposable('number', null);
    num.localValue = '-';
    num.normalize();
    expect(num.localValue).toBe('-');
  });

  it('normalize handles large bigint-style value', () => {
    const { num } = createComposable('bigint', null);
    num.localValue = '0000000000000000123';
    num.normalize();
    expect(num.localValue).toBe('123');
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
    num.localValue = '-99.99';
    num.filterInput();
    expect(num.localValue).toBe('99.99');
  });

  // ─── toNative ────────────────────────────────────────────────────────

  it('toNative converts to bigint for bigint type', () => {
    const { num } = createComposable('bigint', null);
    num.localValue = '42';
    expect(num.toNative()).toBe(42n);
  });

  it('toNative converts to number for number type', () => {
    const { num } = createComposable('number', null);
    num.localValue = '3.14';
    expect(num.toNative()).toBe(3.14);
  });

  it('toNative converts to number for money type', () => {
    const { num } = createComposable('money', null);
    num.localValue = '99.99';
    expect(num.toNative()).toBe(99.99);
  });

  it('toNative returns empty string for empty input', () => {
    const { num } = createComposable('bigint', null);
    num.localValue = '';
    expect(num.toNative()).toBe('');
  });

  it('toNative returns string for unparseable bigint', () => {
    const { num } = createComposable('bigint', null);
    num.localValue = '-';
    expect(num.toNative()).toBe('-');
  });

  it('toNative returns string for unparseable number', () => {
    const { num } = createComposable('number', null);
    num.localValue = 'abc';
    expect(num.toNative()).toBe('abc');
  });
});
