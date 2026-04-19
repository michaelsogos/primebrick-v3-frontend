import type { MetaColumn } from './types';
import type { UiLang } from '$lib/i18n/languages';
import { formatListCellValue, formatUiDateTimeInTimeZone } from '$lib/i18n/date-format';

/** Shared by `EntityListTable` and route `{#snippet cell}` when a custom snippet wraps default formatting. */
export function formatDatetimeIanaListCell(
  column: MetaColumn,
  row: Record<string, unknown>,
  lang: UiLang,
  mode: 'browser' | 'record'
): string {
  if (column.type !== 'datetime' || !column.datetimeIanaToggle) {
    return formatListCellValue(column, row[column.key], lang);
  }
  const raw = row[column.key];
  if (raw === null || raw === undefined) return '';
  if (mode === 'browser') {
    return formatListCellValue(column, raw, lang);
  }
  const tzRaw = row[column.datetimeIanaToggle.recordIanaField];
  const tz = typeof tzRaw === 'string' && tzRaw.trim() ? tzRaw.trim() : '';
  if (!tz) return formatListCellValue(column, raw, lang);
  return formatUiDateTimeInTimeZone(raw as string | number | Date, lang, tz);
}

/**
 * Same formatted string as {@link formatDatetimeIanaListCell} plus the IANA id for the subtitle badge
 * **only in record mode** (stored API field). Browser mode always returns `iana: null`.
 */
export function formatDatetimeCellDisplay(
  column: MetaColumn,
  row: Record<string, unknown>,
  lang: UiLang,
  mode: 'browser' | 'record'
): { text: string; iana: string | null } {
  const text = formatDatetimeIanaListCell(column, row, lang, mode);
  if (column.type !== 'datetime' || !column.datetimeIanaToggle) {
    return { text, iana: null };
  }
  const raw = row[column.key];
  if (raw === null || raw === undefined) {
    return { text: '', iana: null };
  }
  if (mode === 'browser') {
    return { text, iana: null };
  }
  const tzRaw = row[column.datetimeIanaToggle.recordIanaField];
  const tz = typeof tzRaw === 'string' && tzRaw.trim() ? tzRaw.trim() : null;
  return { text, iana: tz };
}
