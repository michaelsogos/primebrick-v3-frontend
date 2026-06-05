import type { MetaColumn } from '$lib/entity-list/types';
import type { UiLang } from '$lib/i18n/languages';
import { isBlankish as isBlankishUtil } from '../utils';
import { formatListCellValue } from '$lib/i18n/date-format';
import { formatDatetimeCellDisplay } from '$lib/entity-list';

export const isBlankish = (value: unknown): boolean => isBlankishUtil(value);

export function getAuditFieldValue<TRow>(
  row: TRow,
  col: MetaColumn,
  uiLang: UiLang,
  formatListCellValueFn: (col: MetaColumn, raw: unknown, lang: UiLang) => string
): string {
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  // Check if this is an audit field that should have a _name variant
  const auditFields = ['created_by', 'updated_by', 'deleted_by'];
  if (auditFields.includes(col.key)) {
    const nameField = `${col.key}_name`;
    const nameValue = r[nameField];
    // Use _name if present and non-empty, otherwise use original value
    if (!isBlankish(nameValue)) {
      return String(nameValue);
    }
  }

  // For non-audit fields or if _name is empty, use original value
  if (isBlankish(raw)) return '-';
  return formatListCellValueFn(col, raw, uiLang);
}

export function isCardFieldEmpty<TRow>(
  row: TRow,
  col: MetaColumn,
  uiLang: UiLang,
  datetimeIanaModeByKey: Record<string, 'browser' | 'record'>,
  cell: any,
  formatDatetimeCellDisplayFn: (col: MetaColumn, row: Record<string, unknown>, lang: UiLang, mode: 'browser' | 'record') => { text: string; iana: string | null },
  formatListCellValueFn: (col: MetaColumn, raw: unknown, lang: UiLang) => string,
  isDatetimeIanaRecordModeFn: (col: MetaColumn, datetimeIanaModeByKey: Record<string, 'browser' | 'record'>) => boolean
): boolean {
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
