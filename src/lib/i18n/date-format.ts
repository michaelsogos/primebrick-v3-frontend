import type { MetaColumn } from '$lib/entity-list/types';
import type { UiLang } from './languages';

/** BCP 47 tags aligned with UI languages (short month names, locale-appropriate ordering). */
const LOCALE_BY_UI_LANG: Record<UiLang, string> = {
  en: 'en-GB',
  it: 'it-IT',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
  pt: 'pt-PT'
};

const dateOnlyFmt = new Map<string, Intl.DateTimeFormat>();
const dateTimeFmt = new Map<string, Intl.DateTimeFormat>();

export function uiLocaleTag(lang: UiLang): string {
  return LOCALE_BY_UI_LANG[lang];
}

function getCached(
  cache: Map<string, Intl.DateTimeFormat>,
  tag: string,
  init: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const key = `${tag}:${JSON.stringify(init)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(tag, init);
    cache.set(key, f);
  }
  return f;
}

/**
 * Calendar date: two-digit day, short month, full year (e.g. `01 Jan 2026` in English).
 * Locale follows {@link UiLang}.
 */
export function formatUiDate(input: Date | string | number, lang: UiLang): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const tag = uiLocaleTag(lang);
  const fmt = getCached(dateOnlyFmt, tag, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  return fmt.format(d);
}

/**
 * English UI: 12-hour clock with AM/PM. European UI langs (it, fr, es, de, pt): 24-hour clock.
 * Always includes seconds on the time part.
 */
function useHour12Clock(lang: UiLang): boolean {
  return lang === 'en';
}

/**
 * Calendar date + time (entity `datetime` columns, error drawer timestamps, etc.).
 * Date part matches {@link formatUiDate}; time part follows shell clock convention.
 */
export function formatUiDateTime(input: Date | string | number, lang: UiLang): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const tag = uiLocaleTag(lang);
  const hour12 = useHour12Clock(lang);
  const fmt = getCached(dateTimeFmt, tag, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12
  });
  return fmt.format(d);
}

/** Default table cell: `date` → locale date only; `datetime` → {@link formatUiDateTime}; else `String(raw)`. */
export function formatListCellValue(
  column: Pick<MetaColumn, 'type'>,
  raw: unknown,
  lang: UiLang
): string {
  if (raw === null || raw === undefined) return '';
  const kind = column.type ?? 'text';
  if (kind === 'date') {
    if (typeof raw === 'string' || typeof raw === 'number' || raw instanceof Date) {
      return formatUiDate(raw, lang);
    }
  }
  if (kind === 'datetime') {
    if (typeof raw === 'string' || typeof raw === 'number' || raw instanceof Date) {
      return formatUiDateTime(raw, lang);
    }
  }
  return String(raw);
}
