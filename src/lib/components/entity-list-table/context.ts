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

const META_UID_KEY = Symbol('metaUid');

/** Set the table's identity column (`meta.uid`) for child components —
 *  e.g. `reverse_ref` links filter the child list by this row's uid. */
export function setMetaUidContext(uid: string) {
  setContext(META_UID_KEY, uid);
}

/** The table's identity column key — `'uuid'` by contract default. */
export function getMetaUidContext(): string {
  return getContext(META_UID_KEY) ?? 'uuid';
}

const TABLE_ENTITY_KEY = Symbol('tableEntity');

export type TableEntityContext = {
  /** Entity API name — e.g. `user_profile`, `customer`. */
  entity: string;
  /** i18n translation_key for entity names (defaults to `entity`). */
  translationKey: string;
  /** The uid column key — the row-identity field. */
  uid: string;
  /** Full resolved meta columns — needed by sheet-level drifts
   *  (version history renders its diff from these). */
  columns: MetaColumn[];
};

/** Set the table's entity context — cell-level drifts (the `version`
 *  column's version-history badge) open sheets with exactly the payload
 *  `useRowActions.loadVersionHistory` builds: same entity, same columns. */
export function setTableEntityContext(ctx: TableEntityContext) {
  setContext(TABLE_ENTITY_KEY, ctx);
}

export function getTableEntityContext(): TableEntityContext | undefined {
  return getContext(TABLE_ENTITY_KEY);
}
