import { userProfileStore } from "./user-profile-store.svelte";
import type { EntityAction } from "./entity-list/types";

/**
 * FE-local permission helper.
 *
 * The FE does NOT import @primebrick/sdk (see lib/api-ext.ts). The BE emits
 * `requiredPermission` on CTAs (meta customActions, derived `actions[].permissions`)
 * as a sentinel name, a concrete permission string, or an OR-array of strings.
 * This helper evaluates that requirement against the current user's profile in
 * `userProfileStore` (`is_admin` + expanded `permissions`).
 */

const permissionChecks: Record<string, () => boolean> = {
  PUBLIC: () => true,
  AUTHENTICATED_ADMIN: () => userProfileStore.current?.is_admin === true,
  AUTHENTICATED_USER: () => userProfileStore.current != null,
};

/** Concrete permission granted to the user? Exact match or user-side `*` wildcard. */
function isPermissionGranted(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes(required)) return true;
  for (const userPerm of userPermissions) {
    if (!userPerm.includes("*")) continue;
    const regex = new RegExp("^" + userPerm.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    if (regex.test(required)) return true;
  }
  return false;
}

/** Evaluate one concrete permission string (or sentinel name). */
function checkOne(required: string): boolean {
  const sentinel = permissionChecks[required];
  if (sentinel) return sentinel();
  const profile = userProfileStore.current;
  if (profile?.is_admin === true) return true;
  if (!profile?.permissions) return false;
  return isPermissionGranted(profile.permissions, required);
}

/**
 * Returns true when the current user satisfies `requiredPermission`.
 *
 * - `undefined` / omitted → always true (backward compatible: existing custom
 *   actions without a permission gate keep rendering for everyone).
 * - `string[]` → OR semantics: true when AT LEAST ONE entry is satisfied.
 * - Sentinel name (`AUTHENTICATED_ADMIN`, `AUTHENTICATED_USER`) → mapped check.
 * - Concrete permission (`organization.delete.single`) → admin bypass or
 *   exact/wildcard match against the user's expanded permissions.
 * - Unknown sentinel or non-matching perm → false (fail closed).
 */
export function hasRequiredPermission(requiredPermission?: string | string[]): boolean {
  if (!requiredPermission || (Array.isArray(requiredPermission) && requiredPermission.length === 0)) {
    return true;
  }
  const list = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
  return list.some(checkOne);
}

/** Sentinel values emitted by the BE (`_authenticated_admin`, ...) mapped to
 *  the checker names used by `hasRequiredPermission`. */
const SENTINEL_TO_CHECK: Record<string, string> = {
  _public: "PUBLIC",
  _authenticated_user: "AUTHENTICATED_USER",
  _authenticated_admin: "AUTHENTICATED_ADMIN",
};

/**
 * True when `op` exists in `meta.actions`, is `enabled`, and the current user
 * satisfies its declared requirement. FAIL-CLOSED: when `entityActions` is
 * absent (meta without `actions` — contract violation) the op is not allowed.
 */
export function isEntityOpAllowed(entityActions: EntityAction[] | undefined, op: string): boolean {
  if (!entityActions) return false;
  const action = entityActions.find((a) => a.op === op);
  if (!action || !action.enabled) return false;
  const required = action.sentinel
    ? SENTINEL_TO_CHECK[action.sentinel] ?? action.sentinel
    : action.permissions;
  return hasRequiredPermission(required);
}
