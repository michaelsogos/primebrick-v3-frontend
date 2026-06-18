import { getContext, setContext } from 'svelte';
import type { MetaColumn } from '$lib/entity-list/types';

const AUDIT_COLUMNS_KEY = Symbol('auditColumns');

/**
 * Set the audit columns context for child components.
 * Should be called in the parent component (EntityListTable).
 */
export function setAuditColumnsContext(auditingColumns?: MetaColumn[]) {
  setContext(AUDIT_COLUMNS_KEY, auditingColumns);
}

/**
 * Get the audit columns context from the parent component.
 * Returns undefined if no context is set.
 */
export function getAuditColumnsContext(): MetaColumn[] | undefined {
  return getContext(AUDIT_COLUMNS_KEY);
}
