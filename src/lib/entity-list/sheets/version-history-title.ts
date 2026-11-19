/**
 * version-history-title — pure helpers behind the timeline entry title.
 * Kept component-free so the contracts are unit-testable without mounting
 * the panel: the action-key normalization (the historical breakage was a
 * camelCase+uppercase key that never resolved) and the actor drill routing.
 */

/** Audit action vocabulary is a closed platform enum — the generic
 *  `system.entities.version_history.actions.*` block is the one served
 *  truth (per-entity blocks were seed duplicates, retired). Keys are
 *  lowercase; the wire `action` arrives uppercase (`INSERT`). */
export function auditActionKey(action: string): string {
  return `system.entities.version_history.actions.${action.toLowerCase()}`;
}

export type ChangedBySheetTarget =
  | { panel: "service.record"; props: { code: string } }
  | { panel: "entity.record"; props: { entity: string; value: string } };

/** Drill target for an audit writer — same affordance as audited ref
 *  cells: `system:<code>` actors open the service registry record; every
 *  other actor drills to `user_profile` on the raw value. `entity.record`
 *  owns the two error states (uuid-with-no-profile → notFound hero,
 *  non-uuid actor → pseudoRef hero), so no actor is filtered up-front. */
export function changedBySheetTarget(actor: string): ChangedBySheetTarget {
  return actor.startsWith("system:")
    ? { panel: "service.record", props: { code: actor.slice("system:".length) } }
    : { panel: "entity.record", props: { entity: "user_profile", value: actor } };
}
