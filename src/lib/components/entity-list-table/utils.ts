import type { MetaColumn } from '$lib/entity-list/types';
import { getAuditableDisplayValue, isAuditableFieldEmpty } from './utils/auditable-fields';

/**
 * Check if a value is blank (null, undefined, empty string, or whitespace-only)
 */
export function isBlankish(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return false;
  if (typeof value === 'boolean') return false;
  return false;
}

/**
 * Check if a row is deleted
 */
export function isRowDeleted<T extends Record<string, unknown>>(row: T): boolean {
  return 'deleted_at' in row && row.deleted_at !== null && row.deleted_at !== undefined;
}

/**
 * Get the unique key for a row
 */
export function getRowKey<T extends Record<string, unknown>>(
  row: T,
  uid: string
): string {
  const v = row[uid as keyof T] as unknown;
  return typeof v === 'string' ? v : String(v ?? '');
}

/**
 * Get audit field value with _name fallback.
 * For audit fields (created_by, updated_by, deleted_by), checks for the corresponding
 * _name field (e.g., created_by_name) and uses it as fallback to show human-readable names.
 * 
 * @deprecated Use getAuditableDisplayValue from ./utils/auditable-fields.ts instead.
 * This function is kept for backward compatibility.
 */
export function getAuditFieldValue<T extends Record<string, unknown>>(
  row: T,
  col: MetaColumn,
  auditingColumns?: MetaColumn[]
): string {
  return getAuditableDisplayValue(row, col, auditingColumns);
}

/**
 * Check if a card field is empty
 * Used in card view to determine if a field should be displayed
 * 
 * @deprecated Use isAuditableFieldEmpty from ./utils/auditable-fields.ts instead.
 * This function is kept for backward compatibility.
 */
export function isCardFieldEmpty<T extends Record<string, unknown>>(
  row: T,
  col: MetaColumn,
  auditingColumns?: MetaColumn[]
): boolean {
  return isAuditableFieldEmpty(row, col, auditingColumns);
}

/**
 * Get cell display class based on column type
 */
export function getCellClass(column: MetaColumn): string {
  const baseClass = 'px-4 py-3';
  
  switch (column.type) {
    case 'number':
    case 'currency':
      return `${baseClass} text-right`;
    case 'date':
    case 'datetime':
      return `${baseClass} text-center`;
    default:
      return `${baseClass} text-left`;
  }
}

/**
 * Toggle a search key in the searchInKeys array
 */
export function toggleSearchKey(
  key: string,
  searchInKeys: string[] | null,
  onSearchInKeysChange: (keys: string[] | null) => void
) {
  if (!searchInKeys || searchInKeys.length === 0) {
    onSearchInKeysChange([key]);
    return;
  }
  if (searchInKeys.includes(key)) {
    const next = searchInKeys.filter((k) => k !== key);
    onSearchInKeysChange(next.length ? next : null);
    return;
  }
  onSearchInKeysChange([...searchInKeys, key]);
}

/**
 * Toggle a column key in the visibleKeys array
 */
export function toggleColumnKey(
  key: string,
  columns: MetaColumn[],
  visibleKeys: string[],
  onVisibleKeysChange: (keys: string[]) => void
) {
  const col = columns.find((c) => c.key === key);
  if (col?.hideable === false) return;

  if (visibleKeys.includes(key)) {
    const next = visibleKeys.filter((k) => k !== key);
    if (next.length > 0) onVisibleKeysChange(next);
    return;
  }
  onVisibleKeysChange([...visibleKeys, key]);
}
