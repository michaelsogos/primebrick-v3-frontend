import { formatUiDateTime, formatUiDate } from '$lib/i18n';
import { uiLang } from '$lib/i18n/store.svelte';
import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
import { get } from 'svelte/store';
import { getAuditableDisplayValue } from '$lib/components/entity-list-table/utils/auditable-fields';
import type { MetaColumn } from '$lib/entity-list/types';

export type AuditBoxState = {
  auditData: Record<string, any>;
  auditingColumns: MetaColumn[];
  isCreatePage: boolean;
  entity: string;
  rowUuid: string;
};

export function useAuditBox(state: AuditBoxState) {
  const { auditData, auditingColumns, isCreatePage, entity, rowUuid } = state;

  function getDeletedFields(cols: MetaColumn[]): MetaColumn[] {
    return cols.filter(f => f.key.startsWith('deleted_'));
  }

  function getUpdatedFields(cols: MetaColumn[]): MetaColumn[] {
    return cols.filter(f => f.key.startsWith('updated_'));
  }

  function getSyncFields(cols: MetaColumn[]): MetaColumn[] {
    return cols.filter(f => f.key.startsWith('last_synced_'));
  }

  function getCreatedFields(cols: MetaColumn[]): MetaColumn[] {
    return cols.filter(f => f.key.startsWith('created_'));
  }

  function getVersionField(cols: MetaColumn[]): MetaColumn | undefined {
    return cols.find(f => f.key === 'version');
  }

  function formatValue(value: any, column?: MetaColumn): string {
    // Sequential formatter logic (same as TableCell.svelte)

    // Skip custom snippet (not applicable for audit box)

    // Boolean type
    if (column?.type === 'boolean') {
      if (value === true) return 'true';
      if (value === false) return 'false';
      return '-';
    }

    // Badge metadata
    if (column?.badge?.values && value) {
      const badgeValue = value as string;
      return column.badge.values[badgeValue]?.labelText || badgeValue;
    }

    // Datetime type
    if (column?.type === 'datetime' || column?.key?.endsWith('_at')) {
      if (!value) return '-';
      return formatUiDateTime(value, get(uiLang));
    }

    // Date type
    if (column?.type === 'date') {
      if (!value) return '-';
      return formatUiDate(value, get(uiLang));
    }

    // Default case: use getAuditableDisplayValue for _name fallback
    if (column) {
      return getAuditableDisplayValue(
        auditData,
        column,
        auditingColumns
      );
    }

    // Fallback for fields without column metadata
    if (!value) return '-';
    return String(value);
  }

  function openVersionHistory() {
    openSheet('entity.versionHistory', { entity, rowUuid });
  }

  return {
    getDeletedFields,
    getUpdatedFields,
    getSyncFields,
    getCreatedFields,
    getVersionField,
    formatValue,
    openVersionHistory
  };
}
