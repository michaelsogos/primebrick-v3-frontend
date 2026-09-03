/**
 * useNumericInput — composable that encapsulates all numeric input state and
 * logic for bigint/number/money config types.
 *
 * Owns:
 *   - internal canonical raw value (dot decimal, no thousand separators)
 *   - derived locale-formatted display value (locale decimal + thousand separators)
 *   - unsigned flag parsing from type_config.validation.unsigned
 *   - effective min derivation (explicit rules.min, or 0 for unsigned, or null)
 *   - inputmode attribute (numeric for bigint, decimal for number/money)
 *   - character filtering (strips invalid chars in real-time as user types)
 *   - native type conversion (string → bigint/number)
 *   - leading-zero normalization on blur
 *   - cursor position management for masked display
 *
 * Dual-value architecture:
 *   - _rawValue: canonical string (dot decimal, no separators) — written to form/DB
 *   - displayValue: locale-formatted string — what the user sees in the input
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 *   - $state consolidated into _state (underscore = internal)
 *   - $derived values exposed via individual getters
 *   - Mutations through mutator functions or controlled getter/setter pairs
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
  /** Reactive getter for the BCP 47 language tag (e.g. 'it-IT', 'en-GB') */
  lang: () => string;
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
 * Normalize leading zeros in the integer part of a canonical numeric string.
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
 * Filter a canonical numeric string (dot decimal, no separators).
 * Strips invalid characters to prevent `--`, `++`, `ee`, etc.
 * - Unsigned: only digits and one decimal point (for number/money)
 * - Signed: digits, one leading minus, one decimal point (for number/money)
 * - BigInt: no decimal point at all
 */
function filterCanonicalInput(raw: string, type: NumericType, isUnsigned: boolean): string {
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

/**
 * Convert a canonical string to a locale-formatted display string.
 * Formats the integer part with locale thousand separators, then appends
 * the decimal part (if any) with the locale's decimal separator.
 *
 * This approach preserves:
 *   - A trailing decimal separator (e.g. `1234.` → `1.234,` in it-IT)
 *     so the user can continue typing fractional digits after pressing
 *     the decimal separator key.
 *   - Exact fractional digits including trailing zeros (e.g. `1234.00` → `1.234,00`)
 *     because `Intl.NumberFormat` with `minimumFractionDigits: 0` would strip them.
 *
 * @param canonical - canonical string (dot decimal, no thousand separators)
 * @param type - numeric type (bigint has no decimal)
 * @param lang - BCP 47 language tag
 */
function formatDisplay(canonical: string, type: NumericType, lang: string): string {
  if (canonical === '' || canonical === '-') return canonical;

  const negative = canonical.startsWith('-');
  const body = negative ? canonical.slice(1) : canonical;
  const dotIndex = body.indexOf('.');
  const hasDecimal = dotIndex !== -1;
  const intPart = hasDecimal ? body.slice(0, dotIndex) : body;
  const decPart = hasDecimal ? body.slice(dotIndex + 1) : '';

  // Detect locale decimal separator
  let decSep = '.';
  try {
    const parts = new Intl.NumberFormat(lang).formatToParts(1.1);
    decSep = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  } catch { /* use default */ }

  try {
    // Format integer part with grouping
    let formattedInt: string;
    if (intPart === '') {
      formattedInt = '0';
    } else if (type === 'bigint') {
      // For bigint, use BigInt for accurate large number formatting
      try {
        const n = BigInt(intPart);
        const num = Number(n);
        if (Number.isSafeInteger(num)) {
          formattedInt = new Intl.NumberFormat(lang, { useGrouping: true, maximumFractionDigits: 0 }).format(num);
        } else {
          formattedInt = formatWithGrouping(intPart, lang);
        }
      } catch {
        formattedInt = formatWithGrouping(intPart, lang);
      }
    } else {
      const n = Number(intPart);
      if (isNaN(n)) return canonical;
      formattedInt = new Intl.NumberFormat(lang, { useGrouping: true, maximumFractionDigits: 0 }).format(n);
    }

    // Build result: sign + formatted integer + optional decimal part
    let result = formattedInt;
    if (hasDecimal && type !== 'bigint') {
      result += decSep + decPart;
    }

    return (negative ? '-' : '') + result;
  } catch {
    return canonical;
  }
}

/**
 * Manual grouping for very large bigint values that exceed Number precision.
 * Uses Intl.NumberFormat to detect the locale's group separator.
 */
function formatWithGrouping(digits: string, lang: string): string {
  let groupSep = ',';
  try {
    const parts = new Intl.NumberFormat(lang).formatToParts(1111111);
    groupSep = parts.find((p) => p.type === 'group')?.value ?? ',';
  } catch { /* use default */ }

  const negative = digits.startsWith('-');
  const body = negative ? digits.slice(1) : digits;
  // Group from right in chunks of 3
  const groups: string[] = [];
  for (let i = body.length; i > 0; i -= 3) {
    groups.unshift(body.slice(Math.max(0, i - 3), i));
  }
  return (negative ? '-' : '') + groups.join(groupSep);
}

/**
 * Parse a locale-formatted display string back to canonical (dot decimal, no separators).
 * @param display - locale-formatted string (e.g. "1.234,50" in it-IT)
 * @param decimalSep - the locale's decimal separator (e.g. "," for it-IT)
 * @param thousandSep - the locale's thousand separator (e.g. "." for it-IT)
 */
function parseDisplayToCanonical(
  display: string,
  decimalSep: string,
  thousandSep: string,
): string {
  let s = display;
  // Remove thousand separators
  if (thousandSep) {
    // Escape regex special chars
    const escaped = thousandSep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(escaped, 'g'), '');
  }
  // Replace locale decimal separator with canonical dot
  if (decimalSep !== '.') {
    s = s.replace(decimalSep, '.');
  }
  return s;
}

export function useNumericInput(options: UseNumericInputOptions) {
  const { type, type_config, value, lang } = options;

  // Consolidated internal state (underscore = internal)
  const _state = $state({
    _rawValue: String(value()),
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

  // Locale separators derived from lang using Intl.NumberFormat
  const decimalSeparator = $derived.by<string>(() => {
    try {
      const parts = new Intl.NumberFormat(lang()).formatToParts(1.1);
      return parts.find((p) => p.type === 'decimal')?.value ?? '.';
    } catch {
      return '.';
    }
  });

  const thousandSeparator = $derived.by<string>(() => {
    try {
      // Use a large number to ensure grouping is triggered in all locales
      const parts = new Intl.NumberFormat(lang()).formatToParts(1111111);
      return parts.find((p) => p.type === 'group')?.value ?? '';
    } catch {
      return '';
    }
  });

  // Display value — locale-formatted for the input element
  const displayValue = $derived.by<string>(() => {
    return formatDisplay(_state._rawValue, type(), lang());
  });

  /**
   * Sync rawValue from the external prop.
   * Called by the component when the external value changes (e.g. form reset).
   */
  function syncFromProp() {
    const externalValue = value();
    _lastExternalValue = externalValue;
    _state._rawValue = String(externalValue);
  }

  /**
   * oninput handler — parse display string to canonical, filter invalid chars.
   * Call from the component's oninput event with the input element's current value.
   * @param displayStr - the current value of the input element (locale-formatted)
   */
  function filterInput(displayStr: string): void {
    const canonical = parseDisplayToCanonical(displayStr, decimalSeparator, thousandSeparator);
    _state._rawValue = filterCanonicalInput(canonical, type(), isUnsigned);
  }

  /**
   * Convert rawValue to native JS type.
   * - bigint → native bigint (if parseable)
   * - number/money → native number (if parseable)
   * - fallback → string as-is
   */
  function toNative(): string | bigint | number {
    const currentType = type();
    const localStr = _state._rawValue;
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
   * Normalize leading zeros in the integer part of rawValue.
   * Called on blur before writing to the bound form value.
   * Mutates _state._rawValue in place.
   */
  function normalize(): void {
    _state._rawValue = normalizeNumericString(_state._rawValue);
  }

  /**
   * Compute the cursor position after reformatting.
   * Counts digits (and optional sign/decimal) before the old cursor position,
   * then finds the corresponding position in the new display string.
   *
   * @param oldCursorPos - cursor position in the old display string
   * @param oldDisplay - the old display string (before input)
   * @param newDisplay - the new display string (after reformatting)
   * @param currentType - the numeric type
   * @returns the new cursor position
   */
  function computeCursorPosition(
    oldCursorPos: number,
    oldDisplay: string,
    newDisplay: string,
  ): number {
    // Count meaningful characters (digits + sign + decimal sep) before cursor in old display
    let meaningfulBefore = 0;
    for (let i = 0; i < oldCursorPos && i < oldDisplay.length; i++) {
      const ch = oldDisplay[i];
      if (ch >= '0' && ch <= '9') meaningfulBefore++;
      else if (ch === '-' || ch === decimalSeparator) meaningfulBefore++;
    }

    // Find position in new display after that many meaningful characters
    let meaningfulSeen = 0;
    for (let i = 0; i < newDisplay.length; i++) {
      const ch = newDisplay[i];
      if (ch >= '0' && ch <= '9') meaningfulSeen++;
      else if (ch === '-' || ch === decimalSeparator) meaningfulSeen++;
      if (meaningfulSeen >= meaningfulBefore) {
        // Position cursor AFTER the current meaningful char
        return i + 1;
      }
    }
    return newDisplay.length;
  }

  return {
    // Bindable rawValue — getter/setter pair for direct access (used on blur)
    get rawValue(): string {
      return _state._rawValue;
    },
    set rawValue(v: string) {
      _state._rawValue = v;
    },
    // Display value — locale-formatted, read-only (derived)
    get displayValue(): string {
      return displayValue;
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
    get decimalSeparator(): string {
      return decimalSeparator;
    },
    get thousandSeparator(): string {
      return thousandSeparator;
    },
    // Mutators
    syncFromProp,
    filterInput,
    toNative,
    normalize,
    computeCursorPosition,
  };
}
