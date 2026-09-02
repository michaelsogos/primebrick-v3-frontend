/**
 * useNumericInput — composable that encapsulates all numeric input state and
 * logic for bigint/number/money config types.
 *
 * Owns:
 *   - local string state for the input element (bindable via getter/setter)
 *   - unsigned flag parsing from type_config.validation.unsigned
 *   - effective min derivation (explicit rules.min, or 0 for unsigned, or null)
 *   - inputmode attribute (numeric for bigint, decimal for number/money)
 *   - character filtering (strips invalid chars in real-time as user types)
 *   - native type conversion (string → bigint/number)
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 *   - $state consolidated into _state (underscore = internal)
 *   - $derived values exposed via individual getters
 *   - Mutations through mutator functions or controlled getter/setter pairs
 *
 * `localValue` is exposed as a getter/setter pair so that Svelte 5 `bind:value`
 * works. The setter writes to _state.localValue (controlled mutation — the
 * component cannot bypass it). `filterInput()` is called via `oninput` to
 * sanitize after each keystroke.
 *
 * Store auto-subscription ($derived) only works in .svelte.ts files, so the
 * caller passes reactive getters that read the props in the .svelte file.
 */
import type { DeepReadonly } from '$lib/types/deep-readonly';

type NumericType = 'bigint' | 'number' | 'money';

interface UseNumericInputOptions {
  /** Reactive getter for the numeric type */
  type: () => NumericType;
  /** Reactive getter for type_config JSON string */
  type_config: () => string | null;
  /** Reactive getter for the external value (prop) */
  value: () => string | bigint | number;
}

interface ParsedTypeConfig {
  validation?: {
    unsigned?: boolean;
    rules?: {
      min?: { value: number };
    };
  };
  currency?: string;
}

/**
 * Parse type_config JSON string, returning null if invalid or empty.
 */
function parseTypeConfig(type_config: string | null): ParsedTypeConfig | null {
  if (!type_config) return null;
  try {
    return JSON.parse(type_config) as ParsedTypeConfig;
  } catch {
    return null;
  }
}

/**
 * Normalize leading zeros in the integer part of a numeric string.
 * - `000123` → `123` (strip leading zeros before nonzero digits)
 * - `000` → `0` (all zeros → single zero)
 * - `0.50` → `0.50` (preserve decimal part, integer part already minimal)
 * - `000.50` → `0.50` (strip leading zeros, keep one zero before decimal)
 * - `-000123` → `-123` (preserve sign)
 * - `` → `` (empty stays empty)
 * - `-` → `-` (lone minus stays)
 */
function normalizeNumericString(raw: string): string {
  if (raw === '' || raw === '-') return raw;
  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;
  const [intPart, ...decParts] = body.split('.');
  // Strip leading zeros from integer part, keep at least one digit
  const normalizedInt = intPart.replace(/^0+(?=\d)/, '');
  const decPart = decParts.length > 0 ? '.' + decParts.join('.') : '';
  return (negative ? '-' : '') + normalizedInt + decPart;
}

/**
 * Character filter for numeric text inputs.
 * Strips invalid characters as the user types to prevent `--`, `++`, `ee`, etc.
 * - Unsigned: only digits and one decimal point (for number/money)
 * - Signed: digits, one leading minus, one decimal point (for number/money)
 */
function filterNumericInput(raw: string, type: NumericType, isUnsigned: boolean): string {
  if (type === 'bigint') {
    if (isUnsigned) {
      return raw.replace(/[^\d]/g, '');
    }
    const negative = raw.startsWith('-');
    const digits = raw.replace(/[^\d]/g, '');
    return digits === '' ? (negative ? '-' : '') : (negative ? '-' : '') + digits;
  }
  // number / money — allow one decimal point
  if (isUnsigned) {
    const cleaned = raw.replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    return parts.length <= 1 ? parts[0] : parts[0] + '.' + parts.slice(1).join('');
  }
  const negative = raw.startsWith('-');
  const cleaned = raw.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  const body = parts.length <= 1 ? parts[0] : parts[0] + '.' + parts.slice(1).join('');
  if (body === '') return negative ? '-' : '';
  return (negative ? '-' : '') + body;
}

export function useNumericInput(options: UseNumericInputOptions) {
  const { type, type_config, value } = options;

  // Consolidated internal state (underscore = internal)
  const _state = $state({
    _localValue: String(value()),
  });

  // Track last external value to detect prop changes
  let _lastExternalValue: string | bigint | number = value();

  // Derived values
  const isUnsigned = $derived.by<boolean>(() => {
    const parsed = parseTypeConfig(type_config());
    return parsed?.validation?.unsigned === true;
  });

  const effectiveMin = $derived.by<string | null>(() => {
    const parsed = parseTypeConfig(type_config());
    const rules = parsed?.validation?.rules;
    if (rules?.min) return String(rules.min.value);
    if (parsed?.validation?.unsigned) return '0';
    return null;
  });

  const inputMode = $derived.by<'numeric' | 'decimal'>(() => {
    return type() === 'bigint' ? 'numeric' : 'decimal';
  });

  const currency = $derived.by<string>(() => {
    const parsed = parseTypeConfig(type_config());
    return parsed?.currency ?? 'EUR';
  });

  /**
   * Sync localValue from the external prop.
   * Called by the component when the external value changes (e.g. form reset).
   */
  function syncFromProp() {
    const externalValue = value();
    _lastExternalValue = externalValue;
    _state._localValue = String(externalValue);
  }

  /**
   * oninput handler — strips invalid characters in real-time.
   * Call from the component's oninput event.
   */
  function filterInput() {
    _state._localValue = filterNumericInput(_state._localValue, type(), isUnsigned);
  }

  /**
   * Convert localValue to native JS type.
   * - bigint → native bigint (if parseable)
   * - number/money → native number (if parseable)
   * - fallback → string as-is
   */
  function toNative(): string | bigint | number {
    const currentType = type();
    const localStr = _state._localValue;
    if (localStr === '' || localStr === '-') return localStr;
    if (currentType === 'bigint') {
      try {
        return BigInt(localStr);
      } catch {
        return localStr;
      }
    }
    // number / money
    const n = Number(localStr);
    if (!isNaN(n)) return n;
    return localStr;
  }

  /**
   * Normalize leading zeros in the integer part of localValue.
   * Called on blur before writing to the bound form value.
   * Mutates _state._localValue in place.
   */
  function normalize(): void {
    _state._localValue = normalizeNumericString(_state._localValue);
  }

  return {
    // Bindable localValue — getter/setter pair for Svelte 5 `bind:value`
    get localValue(): string {
      return _state._localValue;
    },
    set localValue(v: string) {
      _state._localValue = v;
    },
    // Internal state exposure (DeepReadonly — no external mutations)
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    // $derived values via individual getters
    get isUnsigned(): boolean {
      return isUnsigned;
    },
    get effectiveMin(): string | null {
      return effectiveMin;
    },
    get inputMode(): 'numeric' | 'decimal' {
      return inputMode;
    },
    get currency(): string {
      return currency;
    },
    // Mutators
    syncFromProp,
    filterInput,
    toNative,
    normalize,
  };
}
