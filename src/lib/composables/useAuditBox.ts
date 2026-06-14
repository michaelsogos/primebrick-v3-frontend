import { formatUiDateTime } from '$lib/i18n';
import { uiLang } from '$lib/i18n/store.svelte';
import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
import { get } from 'svelte/store';

export type AuditField = {
  key: string;
  labelKey: string;
  type: string;
  sortable?: boolean;
  defaultVisible?: boolean;
  filterable?: boolean;
  searchable?: boolean;
};

export type AuditBoxState = {
  auditData: Record<string, any>;
  auditingColumns: AuditField[];
  isCreatePage: boolean;
  entity: string;
  rowUuid: string;
};

export function useAuditBox(state: AuditBoxState) {
  const { auditData, auditingColumns, isCreatePage, entity, rowUuid } = state;

  function getDeletedFields(cols: AuditField[]): AuditField[] {
    return cols.filter(f => f.key.startsWith('deleted_'));
  }
  
  function getUpdatedFields(cols: AuditField[]): AuditField[] {
    return cols.filter(f => f.key.startsWith('updated_'));
  }
  
  function getSyncFields(cols: AuditField[]): AuditField[] {
    return cols.filter(f => f.key.startsWith('last_synced_'));
  }
  
  function getCreatedFields(cols: AuditField[]): AuditField[] {
    return cols.filter(f => f.key.startsWith('created_'));
  }
  
  function getVersionField(cols: AuditField[]): AuditField | undefined {
    return cols.find(f => f.key === 'version');
  }

  function formatValue(value: any): string {
    if (!value) return '-';
    if (value instanceof Date || typeof value === 'string') {
      return formatUiDateTime(value, get(uiLang));
    }
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
