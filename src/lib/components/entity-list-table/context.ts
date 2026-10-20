import { getContext, setContext } from 'svelte';
import type { MetaColumn } from '$lib/entity-list/types';

const AUDIT_COLUMNS_KEY = Symbol('auditColumns');
const ENTITIES_NS_KEY = Symbol('entitiesNs');

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

/**
 * Set the entity-label i18n namespace for the table subtree — comes from
 * the served `meta.entities_ns` (service-owned entities e.g. `job`) —
 * `'system'` for BE/core-owned entities.
 */
export function setEntitiesNsContext(ns: string) {
  setContext(ENTITIES_NS_KEY, ns);
}

/**
 * Entity-label namespace for the current table subtree — `'system'` is the
 * contract default for BE/core-owned entities (EntityMeta.entities_ns is
 * absent for them). `system.entities.list.*` / `system.entities.page_title.*`
 * are CORE shared vocabulary and stay `system` regardless.
 */
export function getEntitiesNsContext(): string {
  return getContext(ENTITIES_NS_KEY) ?? 'system';
}
