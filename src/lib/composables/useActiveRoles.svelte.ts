/**
 * useActiveRoles — composable that fetches active roles from
 * `/api/v1/system/roles/active` and exposes them for both readonly display
 * (string[] of role names) and form selection (full role objects).
 *
 * Consolidates the identical fetch logic duplicated across Profile, Create
 * User, and Edit User pages.
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 *   - _state is internal (underscore prefix)
 *   - Exposed via get state() returning DeepReadonly
 *   - $derived values (roleNames) exposed via individual getters
 */
import type { DeepReadonly } from "$lib/types/deep-readonly";
import { apiFetch } from "$lib/api";
import { onMount } from "svelte";

export interface ActiveRole {
  idp_role: string;
  label_key?: string;
  permissions?: string[];
  is_admin?: boolean;
}

export function useActiveRoles() {
  const _state = $state({ roles: [] as ActiveRole[], loading: true });

  onMount(async () => {
    try {
      const res = await apiFetch("/api/v1/system/roles/active");
      if (res.ok) {
        const data = await res.json();
        _state.roles = (data.roles ?? []) as ActiveRole[];
      }
    } catch (e) {
      console.error("Failed to load roles", e);
    } finally {
      _state.loading = false;
    }
  });

  const roleNames = $derived(_state.roles.map((r) => r.idp_role));

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    get roleNames() {
      return roleNames;
    },
  };
}
