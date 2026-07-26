/**
 * usePermissionsCatalog — composable that fetches the full non-sentinel
 * permission catalog from `/api/v1/system/permissions`, grouped by module.
 *
 * Used by the FE role-management form to render the Permissions tab.
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 *   - _state is internal (underscore prefix)
 *   - Exposed via get state() returning DeepReadonly
 */
import type { DeepReadonly } from "$lib/types/deep-readonly";
import { apiFetch } from "$lib/api";
import { onMount } from "svelte";

export interface PermissionEntry {
  code: string;
  label_key: string;
}

export interface PermissionModule {
  code: string;
  label_key: string;
  permissions: PermissionEntry[];
}

export function usePermissionsCatalog() {
  const _state = $state({
    modules: [] as PermissionModule[],
    loading: true,
    error: null as string | null,
  });

  onMount(async () => {
    try {
      const res = await apiFetch("/api/v1/system/permissions");
      if (res.ok) {
        const data = await res.json();
        _state.modules = (data.modules ?? []) as PermissionModule[];
      } else {
        _state.error = `HTTP ${res.status}`;
      }
    } catch (e) {
      _state.error = e instanceof Error ? e.message : "Failed to load permissions";
    } finally {
      _state.loading = false;
    }
  });

  // Flat list of all permission codes (for quick lookup).
  const all_codes = $derived(
    _state.modules.flatMap((m) => m.permissions.map((p) => p.code))
  );

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    get all_codes() {
      return all_codes;
    },
  };
}
