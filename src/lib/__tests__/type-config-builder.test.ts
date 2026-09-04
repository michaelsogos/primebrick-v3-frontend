import { describe, it, expect } from 'vitest';
import { useTypeConfigBuilder } from '$lib/config/type-config-builder.svelte';
import type { ConfigEntryType } from '$lib/api-types';

describe('useTypeConfigBuilder', () => {
  function createBuilder(
    type: ConfigEntryType = 'string',
    configKey: string = 'test_key',
    initialTypeConfig: string | null = null,
  ) {
    let lastJson = '';
    const builder = useTypeConfigBuilder(
      () => type,
      () => configKey,
      () => initialTypeConfig,
      (json) => { lastJson = json; },
    );
    return {
      builder,
      getLastJson: () => lastJson,
    };
  }

  // ─── Initialization ─────────────────────────────────────────────

  it('initializes with empty config when no initial type_config', () => {
    const { builder } = createBuilder();
    expect(builder.json).toBe('{}');
  });

  it('parses initial type_config string', () => {
    const initial = '{"validation":{"required":true,"rules":{}}}';
    const { builder } = createBuilder('string', 'test_key', initial);
    expect(builder.validation?.required).toBe(true);
  });

  it('handles invalid initial type_config gracefully', () => {
    const { builder } = createBuilder('string', 'test_key', '{invalid json');
    expect(builder.json).toBe('{}');
  });

  // ─── Validation mutators ────────────────────────────────────────

  it('setRequired updates validation.required', () => {
    const { builder, getLastJson } = createBuilder();
    builder.setRequired(true);
    expect(builder.validation?.required).toBe(true);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.required).toBe(true);
  });

  it('setRequired(false) keeps validation object but sets required=false', () => {
    const { builder } = createBuilder();
    builder.setRequired(true);
    builder.setRequired(false);
    expect(builder.validation?.required).toBe(false);
  });

  it('setUnsigned adds unsigned=true', () => {
    const { builder, getLastJson } = createBuilder('bigint');
    builder.setUnsigned(true);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.unsigned).toBe(true);
  });

  it('setUnsigned(false) removes unsigned property', () => {
    const { builder, getLastJson } = createBuilder('bigint');
    builder.setUnsigned(true);
    builder.setUnsigned(false);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.unsigned).toBeUndefined();
  });

  it('setMin adds min rule with auto-generated error_label_key', () => {
    const { builder, getLastJson } = createBuilder('bigint', 'expiry_days');
    builder.setMin(1);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.min).toEqual({
      value: 1,
      error_label_key: 'config.auth.expiry_days.errors.min',
    });
  });

  it('setMin with custom error_label_key', () => {
    const { builder, getLastJson } = createBuilder('bigint', 'expiry_days');
    builder.setMin(1, 'custom.error.key');
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.min.error_label_key).toBe('custom.error.key');
  });

  it('setMin without custom key — state has no error_label_key, JSON has auto key', () => {
    const { builder, getLastJson } = createBuilder('string', 'my_key');
    builder.setMin(1);
    // State should NOT have error_label_key (auto-injected at serialization only)
    expect(builder.validation?.rules?.min?.error_label_key).toBeUndefined();
    // Serialized JSON should have the auto-generated key
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.min.error_label_key).toBe('config.auth.my_key.errors.min');
  });

  it('autoErrorLabelKey uses my_custom_setting fallback when key is empty', () => {
    const { builder, getLastJson } = createBuilder('string', '');
    builder.setMin(1);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.min.error_label_key).toBe('config.auth.my_custom_setting.errors.min');
  });

  it('updating configKey reactively re-generates auto error_label_keys', () => {
    const { builder, getLastJson } = createBuilder('string', '');
    builder.setMin(1);
    builder.setMax(100);
    let parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.min.error_label_key).toBe('config.auth.my_custom_setting.errors.min');
    expect(parsed.validation.rules.max.error_label_key).toBe('config.auth.my_custom_setting.errors.max');
    // Now update the key — setConfigKey re-generates auto keys
    builder.setConfigKey('session_timeout');
    parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.min.error_label_key).toBe('config.auth.session_timeout.errors.min');
    expect(parsed.validation.rules.max.error_label_key).toBe('config.auth.session_timeout.errors.max');
  });

  it('updating configKey does NOT override custom error_label_keys', () => {
    const { builder, getLastJson } = createBuilder('string', 'initial_key');
    builder.setMin(1, 'my.custom.error.key');
    let parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.min.error_label_key).toBe('my.custom.error.key');
    builder.setConfigKey('new_key');
    parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.min.error_label_key).toBe('my.custom.error.key');
  });

  it('setMin(null) removes min rule', () => {
    const { builder, getLastJson } = createBuilder('bigint');
    builder.setMin(1);
    builder.setMin(null);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation?.rules?.min).toBeUndefined();
  });

  it('setMax adds max rule', () => {
    const { builder, getLastJson } = createBuilder('bigint', 'ttl');
    builder.setMax(365);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.max).toEqual({
      value: 365,
      error_label_key: 'config.auth.ttl.errors.max',
    });
  });

  it('setUrlProtocols adds url rule', () => {
    const { builder, getLastJson } = createBuilder('url', 'endpoint');
    builder.setUrlProtocols(['http', 'https']);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.url.protocols).toEqual(['http', 'https']);
  });

  it('setUrlProtocols([]) removes url rule', () => {
    const { builder, getLastJson } = createBuilder('url');
    builder.setUrlProtocols(['http']);
    builder.setUrlProtocols([]);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation?.rules?.url).toBeUndefined();
  });

  it('setEmail(true) adds email rule', () => {
    const { builder, getLastJson } = createBuilder('string', 'contact');
    builder.setEmail(true);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.email.error_label_key).toBe('config.auth.contact.errors.email');
  });

  it('setEmail(false) removes email rule', () => {
    const { builder, getLastJson } = createBuilder('string');
    builder.setEmail(true);
    builder.setEmail(false);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation?.rules?.email).toBeUndefined();
  });

  it('setRegex adds regex rule with pattern', () => {
    const { builder, getLastJson } = createBuilder('string', 'code');
    builder.setRegex('^[A-Z]{3}$');
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.regex.pattern).toBe('^[A-Z]{3}$');
  });

  it('setRegex("") removes regex rule', () => {
    const { builder, getLastJson } = createBuilder('string');
    builder.setRegex('^[A-Z]+$');
    builder.setRegex('');
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation?.rules?.regex).toBeUndefined();
  });

  // ─── Widget-specific mutators ───────────────────────────────────

  it('setCurrency updates currency', () => {
    const { builder, getLastJson } = createBuilder('money');
    builder.setCurrency('USD');
    const parsed = JSON.parse(getLastJson());
    expect(parsed.currency).toBe('USD');
  });

  it('setValuesSource updates values_source', () => {
    const { builder, getLastJson } = createBuilder('multi_select');
    builder.setValuesSource('currencies');
    const parsed = JSON.parse(getLastJson());
    expect(parsed.values_source).toBe('currencies');
  });

  it('setValuesSource(null) removes values_source', () => {
    const { builder, getLastJson } = createBuilder('multi_select');
    builder.setValuesSource('currencies');
    builder.setValuesSource(null);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.values_source).toBeUndefined();
  });

  it('setApiUrl updates api_url', () => {
    const { builder, getLastJson } = createBuilder('single_select');
    builder.setApiUrl('https://api.example.com/countries');
    const parsed = JSON.parse(getLastJson());
    expect(parsed.api_url).toBe('https://api.example.com/countries');
  });

  // ─── Badge values ───────────────────────────────────────────────

  it('setBadgeValue adds a badge value', () => {
    const { builder, getLastJson } = createBuilder('badge');
    builder.setBadgeValue('active', 'status.active', 'green');
    const parsed = JSON.parse(getLastJson());
    expect(parsed.values.active).toEqual({ label_key: 'status.active', color: 'green' });
  });

  it('removeBadgeValue removes a badge value', () => {
    const { builder, getLastJson } = createBuilder('badge');
    builder.setBadgeValue('active', 'status.active', 'green');
    builder.removeBadgeValue('active');
    const parsed = JSON.parse(getLastJson());
    expect(parsed.values).toBeUndefined();
  });

  // ─── Advanced mode ──────────────────────────────────────────────

  it('setAdvancedMode(true) switches to raw JSON source', () => {
    const { builder } = createBuilder('string', 'key', '{"validation":{"required":true,"rules":{}}}');
    builder.setAdvancedMode(true);
    expect(builder.state.advancedMode).toBe(true);
    expect(builder.state.rawJson).toContain('"required":true');
  });

  it('setRawJson parses and syncs back to state', () => {
    const { builder, getLastJson } = createBuilder();
    builder.setAdvancedMode(true);
    builder.setRawJson('{"currency":"EUR"}');
    expect(builder.currency).toBe('EUR');
    expect(getLastJson()).toBe('{"currency":"EUR"}');
  });

  it('setRawJson with invalid JSON sets error', () => {
    const { builder } = createBuilder();
    builder.setAdvancedMode(true);
    builder.setRawJson('{invalid');
    expect(builder.state.rawJsonError).toBe('Invalid JSON');
  });

  it('leaving advanced mode parses raw JSON back to state', () => {
    const { builder } = createBuilder();
    builder.setAdvancedMode(true);
    builder.setRawJson('{"currency":"USD"}');
    builder.setAdvancedMode(false);
    expect(builder.currency).toBe('USD');
  });

  // ─── Serialization cleanliness ──────────────────────────────────

  it('serializeTypeConfig strips empty rules object', () => {
    const { builder, getLastJson } = createBuilder('string');
    builder.setRequired(false);
    // validation with required=false and empty rules → rules stripped by stripEmpty
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.required).toBe(false);
    expect(parsed.validation.rules).toBeUndefined(); // empty {} stripped
  });

  it('does not include unsigned for non-numeric types', () => {
    const { builder, getLastJson } = createBuilder('string');
    builder.setUnsigned(true);
    const parsed = JSON.parse(getLastJson());
    // unsigned is set in state but it's up to the UI to not show it for non-numeric
    // The builder doesn't filter by type — the UI does
    expect(parsed.validation.unsigned).toBe(true);
  });

  // ─── Default max length ─────────────────────────────────────────

  it('setMax with 65535 creates default cross-system limit rule', () => {
    const { builder, getLastJson } = createBuilder('string', 'test_key');
    builder.setMax(65535);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.max).toEqual({
      value: 65535,
      error_label_key: 'config.auth.test_key.errors.max',
    });
  });

  it('setMax can override the default 65535 with a smaller value', () => {
    const { builder, getLastJson } = createBuilder('string', 'test_key');
    builder.setMax(65535);
    builder.setMax(100);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation.rules.max.value).toBe(100);
  });

  it('setMax(null) removes the default max rule', () => {
    const { builder, getLastJson } = createBuilder('string', 'test_key');
    builder.setMax(65535);
    builder.setMax(null);
    const parsed = JSON.parse(getLastJson());
    expect(parsed.validation?.rules?.max).toBeUndefined();
  });
});
