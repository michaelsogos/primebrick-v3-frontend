import type { MetaColumn } from '$lib/entity-list/types';
import type { UiLang } from './languages';

const dateOnlyFmt = new Map<string, Intl.DateTimeFormat>();
const dateTimeFmt = new Map<string, Intl.DateTimeFormat>();
/** Key: `${localeTag}@@${timeZone}` */
const dateTimeTzFmt = new Map<string, Intl.DateTimeFormat>();

/** `UiLang` is already a BCP 47 tag — pass through to `Intl` as-is. */
export function uiLocaleTag(lang: UiLang): string {
  return lang;
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
 * Calendar date + time (entity `datetime` columns, error drawer timestamps, etc.).
 * Uses one BCP 47 tag per shell language; does **not** set `hour12` — `Intl` applies each
 * locale’s default hour cycle (e.g. 12h vs 24h) from the standard algorithm.
 */
export function formatUiDateTime(input: Date | string | number, lang: UiLang): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const tag = uiLocaleTag(lang);
  const fmt = getCached(dateTimeFmt, tag, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });
  return fmt.format(d);
}

/**
 * Same calendar/hour presentation as {@link formatUiDateTime}, but in a specific IANA zone
 * (DST rules from the environment). Falls back to {@link formatUiDateTime} if `timeZone` is invalid.
 */
export function formatUiDateTimeInTimeZone(
  input: Date | string | number,
  lang: UiLang,
  timeZone: string
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const tag = uiLocaleTag(lang);
  const mapKey = `${tag}@@${timeZone}`;
  let fmt = dateTimeTzFmt.get(mapKey);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat(tag, {
        timeZone,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      });
      dateTimeTzFmt.set(mapKey, fmt);
    } catch {
      return formatUiDateTime(input, lang);
    }
  }
  try {
    return fmt.format(d);
  } catch {
    return formatUiDateTime(input, lang);
  }
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
