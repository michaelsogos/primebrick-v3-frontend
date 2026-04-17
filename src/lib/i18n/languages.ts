/**
 * Supported UI locales as full BCP 47 tags (language + region/script where relevant).
 * Add entries here + a matching `./messages/<tag>.json` to support e.g. `zh-Hans-CN` vs `zh-Hant-TW`.
 */
export const UI_LANGS = ['en-GB', 'it-IT', 'fr-FR', 'es-ES', 'de-DE', 'pt-PT'] as const;

export type UiLang = (typeof UI_LANGS)[number];

export const DEFAULT_LANG: UiLang = 'en-GB';

/** Lowercase canonical tag -> UiLang */
const CANONICAL: Record<string, UiLang> = Object.fromEntries(
  UI_LANGS.map((tag) => [tag.toLowerCase(), tag])
) as Record<string, UiLang>;

/** ISO 639-1 base (or legacy stored short code) -> default regional tag for this app */
const BASE_TO_DEFAULT: Record<string, UiLang> = {
  en: 'en-GB',
  it: 'it-IT',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
  pt: 'pt-PT'
};

/**
 * Resolves session / `navigator.language` / free text to a supported {@link UiLang}.
 * Uses lookup tables only (exact tag, then primary language subtag).
 */
export function normalizeLang(input: string | null | undefined): UiLang | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const exact = CANONICAL[trimmed.toLowerCase()];
  if (exact) return exact;
  const primary = trimmed.split('-')[0]?.toLowerCase() ?? '';
  return BASE_TO_DEFAULT[primary] ?? null;
}
