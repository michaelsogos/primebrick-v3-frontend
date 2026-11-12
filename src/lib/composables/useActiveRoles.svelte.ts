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
import type { DeepReadonly } from '@primebrick/ui';
import { apiFetch } from "$lib/api";
import { onMount } from "svelte";

export interface ActiveRole {
  idp_role: string;
  label_key?: string;
  permissions?: string[];
  is_admin?: boolean;
}

export function useActiveRoles(options?: {
  /** Lazy gate — the fetch fires only once the getter first reports true
   *  (dispatcher instances for non-roles columns never hit the endpoint).
   *  Default: always enabled (the pages' original fetch-on-mount). */
  enabled?: () => boolean;
}) {
  const _state = $state({ roles: [] as ActiveRole[], loading: false });
  const enabled = options?.enabled ?? (() => true);

  let fetched = false;
  $effect(() => {
    if (!enabled() || fetched) return;
    fetched = true;
    _state.loading = true;
    void (async () => {
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
    })();
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
