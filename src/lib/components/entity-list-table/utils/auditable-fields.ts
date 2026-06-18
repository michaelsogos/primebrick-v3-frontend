import type { MetaColumn } from '$lib/entity-list/types';
import { isBlankish } from '../utils';

/**
 * Check if a column is an auditable field based on metadata.
 * A column is considered auditable if it appears in the auditingColumns array.
 * 
 * @param fieldKey - The field key to check
 * @param auditingColumns - The auditing columns from entity metadata
 * @returns true if the column is an auditable field
 */
export function isAuditableColumn(
  fieldKey: string,
  auditingColumns?: MetaColumn[]
): boolean {
  if (!auditingColumns || auditingColumns.length === 0) {
    return false;
  }
  return auditingColumns.some((auditCol) => auditCol.key === fieldKey);
}

/**
 * Get the display name field key for an auditable field.
 * For example, 'created_by' -> 'created_by_name'
 * 
 * @param fieldKey - The original field key
 * @returns The display name field key
 */
export function getDisplayNameFieldKey(fieldKey: string): string {
  return `${fieldKey}_name`;
}

/**
 * Get the display value for an auditable field with fallback.
 * If the field is auditable and has a corresponding _name field with a non-empty value,
 * use the display name. Otherwise, fall back to the original value.
 *
 * @param row - The row data
 * @param col - The column definition
 * @param auditingColumns - The auditing columns from entity metadata
 * @returns The display value (display name or original value)
 */
export function getAuditableDisplayValue<T extends Record<string, unknown>>(
  row: T,
  col: MetaColumn,
  auditingColumns?: MetaColumn[]
): string {
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  // Check if this field is auditable and ends with _by
  if (isAuditableColumn(col.key, auditingColumns) && col.key.endsWith('_by')) {
    const nameFieldKey = getDisplayNameFieldKey(col.key);
    const nameValue = r[nameFieldKey];

    // Use display name if present and non-empty
    if (!isBlankish(nameValue)) {
      return String(nameValue);
    }
  }

  // Fall back to original value
  if (isBlankish(raw)) return '-';
  return String(raw);
}

/**
 * Check if an auditable field should be considered empty.
 * A field is empty if both the raw value and the display name value are blank.
 *
 * @param row - The row data
 * @param col - The column definition
 * @param auditingColumns - The auditing columns from entity metadata
 * @returns true if the field is empty
 */
export function isAuditableFieldEmpty<T extends Record<string, unknown>>(
  row: T,
  col: MetaColumn,
  auditingColumns?: MetaColumn[]
): boolean {
  const r = row as Record<string, unknown>;
  const raw = r[col.key];

  // For auditable fields, check both raw and display name
  if (isAuditableColumn(col.key, auditingColumns)) {
    const nameField = getDisplayNameFieldKey(col.key);
    const nameValue = r[nameField];
    return isBlankish(raw) && isBlankish(nameValue);
  }

  // For non-auditable fields, just check the raw value
  return isBlankish(raw);
}
