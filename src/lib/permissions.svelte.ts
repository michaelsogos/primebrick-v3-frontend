import { userProfileStore } from "./user-profile-store.svelte";

/**
 * FE-local permission helper.
 *
 * The FE does NOT import @primebrick/sdk (see lib/api-ext.ts). The BE meta
 * emits `requiredPermission` as a plain string (the human-readable sentinel
 * name). This helper maps that string to a check against the current user's
 * profile in `userProfileStore`.
 *
 * Extend this map as new sentinels are introduced. For now only
 * "AUTHENTICATED_ADMIN" is supported.
 */
const permissionChecks: Record<string, () => boolean> = {
  AUTHENTICATED_ADMIN: () => userProfileStore.current?.is_admin === true,
};

/**
 * Returns true when the current user satisfies the given `requiredPermission`.
 *
 * - `undefined` / omitted → always true (backward compatible: existing custom
 *   actions without a permission gate keep rendering for everyone).
 * - Unknown string → false (fail closed: hide the action rather than expose it).
 * - Known sentinel → evaluates the corresponding check.
 */
export function hasRequiredPermission(requiredPermission?: string): boolean {
  if (!requiredPermission) {
    return true;
  }
  const check = permissionChecks[requiredPermission];
  if (!check) {
    return false;
  }
  return check();
}
