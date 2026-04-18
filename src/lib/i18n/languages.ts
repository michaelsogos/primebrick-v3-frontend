/**
 * Supported UI locales as full BCP 47 tags (language + region/script where relevant).
 * Add entries here + a matching `./messages/<tag>.json` to support e.g. `zh-Hans-CN` vs `zh-Hant-TW`.
 */
export const UI_LANGS = ['en-GB', 'en-US', 'it-IT', 'fr-FR', 'es-ES', 'de-DE', 'pt-PT'] as const;

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

type LangEntry = { code: UiLang; label: string };

/**
 * Order language rows: first those that match `navigator.languages` (browser preference order,
 * via {@link normalizeLang}), then the rest sorted alphabetically by `label`.
 */
export function orderLangEntriesByBrowser<T extends LangEntry>(
  entries: readonly T[],
  browserLanguages: readonly string[] | null | undefined
): T[] {
  const byCode = new Map<UiLang, T>(entries.map((e) => [e.code, e]));
  const seen = new Set<UiLang>();
  const out: T[] = [];
  if (browserLanguages?.length) {
    for (const raw of browserLanguages) {
      const ui = normalizeLang(raw);
      if (!ui || seen.has(ui)) continue;
      const row = byCode.get(ui);
      if (row) {
        seen.add(ui);
        out.push(row);
      }
    }
  }
  const rest = entries
    .filter((e) => !seen.has(e.code))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  return [...out, ...rest];
}

/**
 * Short region/script badge for UI (e.g. `en-GB` → `GB`, `it-IT` → `IT`, `zh-Hans-CN` → `CN`).
 * Prefers a 2-letter region subtag when present; otherwise the second subtag.
 */
export function uiLangRegionSuffix(tag: string): string {
  const parts = tag.split('-').filter(Boolean);
  if (parts.length < 2) return parts[0]?.toUpperCase() ?? '';
  const second = parts[1]!;
  if (second.length === 2) return second.toUpperCase();
  const region = parts.find((p, i) => i >= 2 && p.length === 2);
  if (region) return region.toUpperCase();
  return second.toUpperCase();
}

/**
 * Two-letter label for the compact topbar trigger: final BCP 47 subtag only (`en-GB` → `GB`, `it-IT` → `IT`).
 * Not for dropdown rows — use full `label` there.
 */
export function uiLangTopBarTwoLetterSuffix(tag: string): string {
  const parts = tag.split('-').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return last.toUpperCase().slice(0, 2);
}
