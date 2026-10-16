/**
 * Composable for building type_config JSON visually.
 *
 * Maintains a structured ParsedTypeConfig state and serializes to JSON
 * on every change. Supports parsing an existing type_config string
 * (for edit mode) and overriding from raw JSON (advanced mode).
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 * - Internal _state object, exposed via readonly getter
 * - Mutations only through exposed mutator functions
 * - $derived values exposed via individual getters
 */
import { parseTypeConfig, serializeTypeConfig, autoErrorLabelKey } from '$lib/config/type-config-schema';
import type { ParsedTypeConfig, ConfigValidation } from '$lib/config/type-config-schema';
import type { ConfigEntryType } from '$lib/api-types';
import type { DeepReadonly } from '$lib/types/deep-readonly';

interface BuilderState {
  /** The structured type_config being built. */
  config: ParsedTypeConfig;
  /** The config key (used for auto-generating error_label_keys). */
  configKey: string;
  /** Whether the user is in advanced (raw JSON) mode. */
  advancedMode: boolean;
  /** Raw JSON string in advanced mode. */
  rawJson: string;
  /** Error message if raw JSON parsing failed. */
  rawJsonError: string | null;
}

export function useTypeConfigBuilder(
  type: () => ConfigEntryType,
  configKey: () => string,
  initialTypeConfig: () => string | null,
  onTypeConfigChange: (json: string) => void,
) {
  const _state = $state<BuilderState>({
    config: parseTypeConfig(initialTypeConfig()) ?? {},
    configKey: configKey(),
    advancedMode: false,
    rawJson: initialTypeConfig() ?? '',
    rawJsonError: null,
  });

  // ─── Config key sync ──────────────────────────────────────────

  /**
   * Update the config key. Auto-generated error_label_keys are injected at
   * serialization time (in sync()), so changing the key just updates the
   * stored key and re-serializes — no need to mutate existing rules.
   */
  function setConfigKey(newKey: string) {
    if (newKey === _state.configKey) return;
    _state.configKey = newKey;
    sync();
  }

  // ─── Helpers ─────────────────────────────────────────────────

  /** Ensure validation object exists and return it. */
  function ensureValidation(): ConfigValidation {
    if (!_state.config.validation) {
      _state.config.validation = { required: false, rules: {} };
    }
    // Raw JSON (advanced mode / AI-applied) may carry a validation object
    // without `rules` — e.g. {"validation":{"required":true}}. Mutators write
    // into v.rules.* and would crash on the missing bucket.
    _state.config.validation.rules ??= {};
    return _state.config.validation;
  }

  /**
   * Deep clone the config and inject auto-generated error_label_keys for
   * any validation rules that don't have a custom error_label_key.
   * This keeps _state.config clean (no auto keys stored) while ensuring
   * the serialized JSON always contains error_label_key for runtime validation.
   */
  function withAutoErrorKeys(): ParsedTypeConfig {
    // JSON round-trip to clone — $state proxies can't be structuredClone'd
    const clone: ParsedTypeConfig = JSON.parse(JSON.stringify(_state.config));
    const v = clone.validation;
    if (!v || !v.rules) return clone;
    const rules = v.rules;
    const ruleNames = ['min', 'max', 'url', 'email', 'regex'] as const;
    for (const rule of ruleNames) {
      const r = rules[rule];
      if (r && !r.error_label_key) {
        r.error_label_key = autoErrorLabelKey(_state.configKey, rule);
      }
    }
    return clone;
  }

  /** Sync state → JSON string → notify parent. */
  function sync() {
    if (_state.advancedMode) return; // advanced mode is source of truth
    const configWithAutoKeys = withAutoErrorKeys();
    const json = serializeTypeConfig(configWithAutoKeys);
    _state.rawJson = json; // keep preview in sync
    onTypeConfigChange(json);
  }

  // ─── Validation mutators ─────────────────────────────────────

  function setRequired(required: boolean) {
    ensureValidation().required = required;
    sync();
  }

  function setRequiredErrorLabelKey(key: string) {
    const v = ensureValidation();
    if (key) v.required_error_label_key = key;
    else delete v.required_error_label_key;
    sync();
  }

  function setUnsigned(unsigned: boolean) {
    const v = ensureValidation();
    if (unsigned) v.unsigned = true;
    else delete v.unsigned;
    sync();
  }

  function setMin(value: number | null, errorLabelKey?: string) {
    const v = ensureValidation();
    if (value === null) {
      delete v.rules.min;
    } else {
      v.rules.min = {
        value,
        // Only store if user provided a custom key; auto-generated at serialization
        ...(errorLabelKey ? { error_label_key: errorLabelKey } : {}),
      };
    }
    sync();
  }

  function setMax(value: number | null, errorLabelKey?: string) {
    const v = ensureValidation();
    if (value === null) {
      delete v.rules.max;
    } else {
      v.rules.max = {
        value,
        ...(errorLabelKey ? { error_label_key: errorLabelKey } : {}),
      };
    }
    sync();
  }

  function setUrlProtocols(protocols: string[], errorLabelKey?: string) {
    const v = ensureValidation();
    if (protocols.length === 0) {
      delete v.rules.url;
    } else {
      v.rules.url = {
        protocols,
        ...(errorLabelKey ? { error_label_key: errorLabelKey } : {}),
      };
    }
    sync();
  }

  function setEmail(enabled: boolean, errorLabelKey?: string) {
    const v = ensureValidation();
    if (enabled) {
      v.rules.email = {
        ...(errorLabelKey ? { error_label_key: errorLabelKey } : {}),
      };
    } else {
      delete v.rules.email;
    }
    sync();
  }

  function setRegex(pattern: string, flags?: string, errorLabelKey?: string) {
    const v = ensureValidation();
    if (!pattern) {
      delete v.rules.regex;
    } else {
      v.rules.regex = {
        pattern,
        ...(flags ? { flags } : {}),
        ...(errorLabelKey ? { error_label_key: errorLabelKey } : {}),
      };
    }
    sync();
  }

  // ─── Widget-specific mutators ────────────────────────────────

  function setCurrency(code: string) {
    _state.config.currency = code;
    sync();
  }

  function setValuesSource(source: string | null) {
    if (source) {
      _state.config.values_source = source;
    } else {
      delete _state.config.values_source;
    }
    sync();
  }

  function setApiUrl(url: string) {
    if (url) {
      _state.config.api_url = url;
    } else {
      delete _state.config.api_url;
    }
    sync();
  }

  function setApiVerb(verb: string) {
    if (verb) {
      _state.config.api_verb = verb;
    } else {
      delete _state.config.api_verb;
    }
    sync();
  }

  function setValueField(field: string) {
    if (field) {
      _state.config.value_field = field;
    } else {
      delete _state.config.value_field;
    }
    sync();
  }

  function setLabelField(field: string) {
    if (field) {
      _state.config.label_field = field;
    } else {
      delete _state.config.label_field;
    }
    sync();
  }

  /**
   * Allowed URL protocols — drives BOTH the widget prefix options
   * (`allowed_protocols`) and the validation rule (`rules.url.protocols`).
   * A single UI control owns both; the error_label_key is auto-generated
   * at serialization time.
   */
  function setAllowedProtocols(protocols: string[]) {
    if (protocols.length === 0) {
      delete _state.config.allowed_protocols;
      delete _state.config.default_protocol;
      const v = ensureValidation();
      delete v.rules.url;
    } else {
      _state.config.allowed_protocols = protocols;
      // Default protocol must come from the allowed set.
      const cur = _state.config.default_protocol;
      if (!cur || !protocols.includes(cur)) {
        _state.config.default_protocol = protocols[0];
      }
      const v = ensureValidation();
      const existing = v.rules.url;
      v.rules.url = {
        protocols,
        ...(existing?.error_label_key ? { error_label_key: existing.error_label_key } : {}),
      };
    }
    sync();
  }

  function setDefaultProtocol(protocol: string | null) {
    if (protocol) {
      _state.config.default_protocol = protocol;
    } else {
      delete _state.config.default_protocol;
    }
    sync();
  }

  function setCountry(country: string | null) {
    if (country) {
      _state.config.country = country;
    } else {
      delete _state.config.country;
    }
    sync();
  }

  function setAllowedCountries(countries: string[]) {
    if (countries.length === 0) {
      delete _state.config.allowed_countries;
    } else {
      _state.config.allowed_countries = countries;
      // Default country must come from the allowed set.
      const cur = _state.config.country;
      if (cur && !countries.includes(cur)) {
        _state.config.country = countries[0];
      }
    }
    sync();
  }

  function setAllowedCurrencies(currencies: string[]) {
    if (currencies.length === 0) {
      delete _state.config.allowed_currencies;
    } else {
      _state.config.allowed_currencies = currencies;
      const cur = _state.config.currency;
      if (cur && !currencies.includes(cur)) {
        _state.config.currency = currencies[0];
      }
    }
    sync();
  }

  // ─── Badge values mutators ───────────────────────────────────

  function setBadgeValue(value: string, labelKey?: string, color?: string) {
    if (!_state.config.values) _state.config.values = {};
    _state.config.values[value] = {
      ...(labelKey ? { label_key: labelKey } : {}),
      ...(color ? { color } : {}),
    };
    sync();
  }

  function removeBadgeValue(value: string) {
    if (_state.config.values) {
      delete _state.config.values[value];
      if (Object.keys(_state.config.values).length === 0) delete _state.config.values;
    }
    sync();
  }

  /** Reorder badge values — the `values` map preserves insertion order in JSON. */
  function reorderBadgeValues(orderedValues: string[]) {
    const values = _state.config.values;
    if (!values) return;
    const next: Record<string, (typeof values)[string]> = {};
    for (const v of orderedValues) {
      if (values[v]) next[v] = values[v];
    }
    // Keep any keys not present in orderedValues (defensive).
    for (const v of Object.keys(values)) {
      if (!(v in next)) next[v] = values[v];
    }
    _state.config.values = next;
    sync();
  }

  // ─── Advanced mode (raw JSON) ────────────────────────────────

  function setAdvancedMode(enabled: boolean) {
    _state.advancedMode = enabled;
    if (enabled) {
      // Entering advanced mode: sync current state to raw JSON
      _state.rawJson = serializeTypeConfig(_state.config);
    } else {
      // Leaving advanced mode: parse raw JSON back to state
      overrideFromJson(_state.rawJson);
    }
  }

  function setRawJson(json: string) {
    _state.rawJson = json;
    overrideFromJson(json);
  }

  function overrideFromJson(json: string) {
    const parsed = parseTypeConfig(json);
    if (parsed === null && json.trim() !== '') {
      _state.rawJsonError = 'Invalid JSON';
      return;
    }
    _state.rawJsonError = null;
    _state.config = parsed ?? {};
    if (!_state.advancedMode) {
      onTypeConfigChange(json.trim() === '' ? '' : serializeTypeConfig(_state.config));
    } else {
      onTypeConfigChange(json);
    }
  }

  // ─── Derived getters ─────────────────────────────────────────

  const json = $derived(serializeTypeConfig(withAutoErrorKeys()));

  const validation = $derived(_state.config.validation);

  const currency = $derived(_state.config.currency);

  const values = $derived(_state.config.values);

  const urlConfig = $derived({
    allowed_protocols: _state.config.allowed_protocols,
    default_protocol: _state.config.default_protocol,
  });

  const phoneConfig = $derived({
    country: _state.config.country,
    allowed_countries: _state.config.allowed_countries,
  });

  const allowedCurrencies = $derived(_state.config.allowed_currencies);

  const selectConfig = $derived({
    values_source: _state.config.values_source,
    api_url: _state.config.api_url,
    api_verb: _state.config.api_verb,
    value_field: _state.config.value_field,
    label_field: _state.config.label_field,
  });

  return {
    get state(): DeepReadonly<BuilderState> { return _state as DeepReadonly<BuilderState>; },
    get json() { return json; },
    get validation() { return validation; },
    get currency() { return currency; },
    get values() { return values; },
    get selectConfig() { return selectConfig; },
    get urlConfig() { return urlConfig; },
    get phoneConfig() { return phoneConfig; },
    get allowedCurrencies() { return allowedCurrencies; },
    // Validation mutators
    setRequired,
    setRequiredErrorLabelKey,
    setUnsigned,
    setMin,
    setMax,
    setUrlProtocols,
    setEmail,
    setRegex,
    // Widget mutators
    setCurrency,
    setValuesSource,
    setApiUrl,
    setApiVerb,
    setValueField,
    setLabelField,
    setAllowedProtocols,
    setDefaultProtocol,
    setCountry,
    setAllowedCountries,
    setAllowedCurrencies,
    // Badge mutators
    setBadgeValue,
    removeBadgeValue,
    reorderBadgeValues,
    // Advanced mode
    setAdvancedMode,
    setRawJson,
    overrideFromJson,
    // Config key sync
    setConfigKey,
  };
}
