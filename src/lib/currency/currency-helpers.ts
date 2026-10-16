/**
 * Currency helpers for the Primebrick frontend.
 *
 * This is a FE standalone implementation — it does NOT depend on @primebrick/sdk
 * (which is BE/US only). It installs `countries-list` directly.
 *
 * The SDK has its own copy for Node.js BE/US reuse. A future browser-safe
 * shared package could remove this duplication, but that is outside the
 * current task scope.
 */

import { getCurrency, currencies } from "countries-list/currencies";
import { getCountryData } from "countries-list";
import type { TCurrencyCode, TCountryCode } from "countries-list";

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  symbolNative: string;
  numeric: string;
  decimals: number;
}

/**
 * Get currency metadata for an ISO 4217 currency code.
 * Returns `null` for unknown codes (including incomplete package results).
 *
 * Note: `countries-list` returns a partial `{ code }` object for unknown codes
 * rather than `null`, so we validate required fields before constructing
 * `CurrencyInfo`.
 */
export function getCurrencyInfo(code: string): CurrencyInfo | null {
  try {
    const raw = getCurrency(code as TCurrencyCode);
    // countries-list returns a partial object ({code}) for unknown codes — treat as unknown
    if (!raw || !raw.name || !raw.symbol) return null;
    return {
      code: raw.code,
      name: raw.name,
      symbol: raw.symbol,
      symbolNative: raw.symbolNative,
      numeric: raw.numeric,
      decimals: raw.decimals,
    };
  } catch {
    return null;
  }
}

/**
 * Get the currency symbol for a code, falling back to the code itself
 * if metadata is unavailable.
 */
export function currencySymbol(code: string): string {
  const info = getCurrencyInfo(code);
  return info?.symbol ?? code;
}

/**
 * Get the number of decimal places for a currency, falling back to 2
 * if metadata is unavailable.
 */
export function currencyDecimals(code: string): number {
  const info = getCurrencyInfo(code);
  return info?.decimals ?? 2;
}

/**
 * Get all available currencies as a selector-friendly array.
 */
export function getAllCurrencies(): Array<CurrencyInfo & { label: string }> {
  return Object.entries(currencies).map(([code, data]) => ({
    code,
    name: data.name,
    symbol: data.symbol,
    symbolNative: data.symbolNative,
    numeric: data.numeric,
    decimals: data.decimals,
    label: `${code} — ${data.name}`,
  }));
}

/**
 * Derive a sensible default currency code from a language tag.
 * Uses the country code embedded in the locale (e.g. "en-US" → "USD")
 * and falls back to the country's first currency.
 * Returns "EUR" as a final fallback.
 */
export function defaultCurrencyForLang(lang: string): string {
  // Extract country code from locale (e.g. "en-US" → "US", "it-IT" → "IT")
  const parts = lang.split(/[-_]/);
  const countryPart = parts.length >= 2 ? parts[parts.length - 1].toUpperCase() : null;

  if (countryPart) {
    const country = getCountryData(countryPart as TCountryCode);
    if (country?.currency && Array.isArray(country.currency) && country.currency.length > 0) {
      return country.currency[0] as string;
    } else if (country?.currency && typeof country.currency === "string") {
      return country.currency as string;
    }
  }

  // Final fallback
  return "EUR";
}

/**
 * Format a numeric amount as a locale-aware money string with currency.
 * Uses the browser's `Intl.NumberFormat` for locale-aware formatting.
 */
export function formatMoney(
  amount: number,
  lang: string,
  currency: string,
): string {
  try {
    const formatter = new Intl.NumberFormat(lang, {
      style: "currency",
      currency,
    });
    return formatter.format(amount);
  } catch {
    // Fallback: amount + currency code
    return `${amount} ${currency}`;
  }
}
