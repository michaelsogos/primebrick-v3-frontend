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

  function setRegex(pattern: string, errorLabelKey?: string) {
    const v = ensureValidation();
    if (!pattern) {
      delete v.rules.regex;
    } else {
      v.rules.regex = {
        pattern,
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
    // Badge mutators
    setBadgeValue,
    removeBadgeValue,
    // Advanced mode
    setAdvancedMode,
    setRawJson,
    overrideFromJson,
    // Config key sync
    setConfigKey,
  };
}
