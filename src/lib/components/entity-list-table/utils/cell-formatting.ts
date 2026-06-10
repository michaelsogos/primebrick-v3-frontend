import type { MetaColumn } from '$lib/entity-list/types';
import type { UiLang } from '$lib/i18n/languages';
import { isBlankish as isBlankishUtil } from '../utils';
import { formatListCellValue } from '$lib/i18n/date-format';
import { formatDatetimeCellDisplay } from '$lib/entity-list';
import { getAuditableDisplayValue, isAuditableColumn, isAuditableFieldEmpty } from './auditable-fields';

export const isBlankish = (value: unknown): boolean => isBlankishUtil(value);

export function getAuditFieldValue<TRow extends Record<string, unknown>>(
  row: TRow,
  col: MetaColumn,
  uiLang: UiLang,
  formatListCellValueFn: (col: MetaColumn, raw: unknown, lang: UiLang) => string,
  auditingColumns?: MetaColumn[]
): string {
  return getAuditableDisplayValue(
    row,
    col,
    auditingColumns,
    (value) => formatListCellValueFn(col, value, uiLang)
  );
}

export function isCardFieldEmpty<TRow extends Record<string, unknown>>(
  row: TRow,
  col: MetaColumn,
  uiLang: UiLang,
  datetimeIanaModeByKey: Record<string, 'browser' | 'record'>,
  cell: any,
  formatDatetimeCellDisplayFn: (col: MetaColumn, row: Record<string, unknown>, lang: UiLang, mode: 'browser' | 'record') => { text: string; iana: string | null },
  formatListCellValueFn: (col: MetaColumn, raw: unknown, lang: UiLang) => string,
  isDatetimeIanaRecordModeFn: (col: MetaColumn, datetimeIanaModeByKey: Record<string, 'browser' | 'record'>) => boolean,
  auditingColumns?: MetaColumn[]
): boolean {
  // Use the centralized utility for auditable fields
  if (isAuditableColumn(col, auditingColumns)) {
    return isAuditableFieldEmpty(row, col, auditingColumns);
  }

  // Existing logic for non-auditable fields
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  if (col.type === 'datetime' && col.datetimeIanaToggle) {
    const mode = datetimeIanaModeByKey[col.key] ?? 'browser';
    const parts = formatDatetimeCellDisplayFn(col, r, uiLang, mode);
    const textEmpty = parts.text.trim().length === 0;
    // In record mode we may show an IANA badge even if the datetime text is empty; treat as non-empty.
    if (isDatetimeIanaRecordModeFn(col, datetimeIanaModeByKey) && parts.iana && parts.iana.trim().length > 0) return false;
    return textEmpty;
  }

  if (cell) {
    return isBlankish(raw);
  }

  if (isBlankish(raw)) return true;

  const formatted = formatListCellValueFn(col, raw, uiLang).trim();
  return formatted.length === 0;
}
