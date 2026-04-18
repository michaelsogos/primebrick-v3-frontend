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
