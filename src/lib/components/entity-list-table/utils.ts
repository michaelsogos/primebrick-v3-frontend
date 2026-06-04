import type { MetaColumn } from '$lib/entity-list/types';

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
 */
export function getAuditFieldValue<T extends Record<string, unknown>>(
  row: T,
  col: MetaColumn
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

  return String(raw);
}

/**
 * Check if a card field is empty
 * Used in card view to determine if a field should be displayed
 */
export function isCardFieldEmpty<T extends Record<string, unknown>>(
  row: T,
  col: MetaColumn
): boolean {
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  // For audit fields, check if both the value and _name are blank
  const auditFields = ['created_by', 'updated_by', 'deleted_by'];
  if (auditFields.includes(col.key)) {
    const nameField = `${col.key}_name`;
    const nameValue = r[nameField];
    // Consider empty if both raw and _name are blank
    return isBlankish(raw) && isBlankish(nameValue);
  }

  // For non-audit fields, just check the raw value
  return isBlankish(raw);
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


