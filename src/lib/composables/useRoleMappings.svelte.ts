/**
 * useRoleMappings — composable that provides CRUD operations for role mappings.
 *
 * The list page uses the entity-pattern endpoints (`/api/v1/entities/role_mappings/...`)
 * directly via EntityListTable. This composable is used by the create/edit pages
 * for single-record CRUD.
 *
 * Exposes:
 *   - state: { roles, loading, error } (DeepReadonly)
 *   - list(): refresh the roles list (legacy system endpoint)
 *   - get(uuid): fetch a single role by uuid (entity endpoint)
 *   - create(input): create a new role (entity endpoint)
 *   - update(uuid, input): update a role by uuid (entity endpoint)
 *   - remove(uuid): delete a role by uuid (entity endpoint)
 *
 * All field names are snake_case (matching the BE JSON shape).
 *
 * Follows the composable state exposure pattern from AGENTS.md.
 */
import type { DeepReadonly } from "$lib/types/deep-readonly";
import { apiFetch } from "$lib/api";
import { pushNotification } from "$lib/errors/app-errors";

export interface RoleMapping {
  id: string;
  uuid: string;
  idp_role: string;
  idp_org?: string;
  label_key?: string;
  permissions: string[];
  is_admin: boolean;
  last_synced_at?: string;
  version: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

export interface CreateRoleInput {
  idp_role: string;
  idp_org: string;
  label_key?: string;
  is_admin: boolean;
  permissions: string[];
}

export interface UpdateRoleInput {
  label_key?: string;
  is_admin?: boolean;
  permissions?: string[];
}

export function useRoleMappings() {
  const _state = $state({
    roles: [] as RoleMapping[],
    loading: true,
    error: null as string | null,
  });

  async function list(): Promise<void> {
    _state.loading = true;
    _state.error = null;
    try {
      const res = await apiFetch("/api/v1/system/role-mappings");
      if (res.ok) {
        const data = await res.json();
        _state.roles = (data.roles ?? []) as RoleMapping[];
      } else {
        const body = await res.json().catch(() => null);
        _state.error = body?.detail ?? `HTTP ${res.status}`;
        pushNotification(body ?? { impact: "HIGH", message: `HTTP ${res.status}`, scope: "roles" });
      }
    } catch (e) {
      _state.error = e instanceof Error ? e.message : "Failed to load roles";
      pushNotification({ impact: "HIGH", message: _state.error, scope: "roles" });
    } finally {
      _state.loading = false;
    }
  }

  async function get(uuid: string): Promise<RoleMapping | null> {
    try {
      const res = await apiFetch(`/api/v1/entities/role_mappings/${encodeURIComponent(uuid)}`);
      if (res.ok) {
        return (await res.json()) as RoleMapping;
      }
      const body = await res.json().catch(() => null);
      pushNotification(body ?? { impact: "MEDIUM", message: `HTTP ${res.status}`, scope: "roles" });
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load role";
      pushNotification({ impact: "HIGH", message: msg, scope: "roles" });
      return null;
    }
  }

  async function create(input: CreateRoleInput): Promise<RoleMapping | null> {
    try {
      const res = await apiFetch("/api/v1/entities/role_mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; role: RoleMapping };
        await list();
        pushNotification({ impact: "NONE", message: "Role created", scope: "roles" });
        return data.role;
      }
      const body = await res.json().catch(() => null);
      pushNotification(body ?? { impact: "HIGH", message: `HTTP ${res.status}`, scope: "roles" });
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create role";
      pushNotification({ impact: "HIGH", message: msg, scope: "roles" });
      return null;
    }
  }

  async function update(uuid: string, input: UpdateRoleInput): Promise<boolean> {
    try {
      const res = await apiFetch(`/api/v1/entities/role_mappings/${encodeURIComponent(uuid)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        await list();
        pushNotification({ impact: "NONE", message: "Role updated", scope: "roles" });
        return true;
      }
      const body = await res.json().catch(() => null);
      pushNotification(body ?? { impact: "HIGH", message: `HTTP ${res.status}`, scope: "roles" });
      return false;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update role";
      pushNotification({ impact: "HIGH", message: msg, scope: "roles" });
      return false;
    }
  }

  async function remove(uuid: string): Promise<boolean> {
    try {
      const res = await apiFetch(`/api/v1/entities/role_mappings/${encodeURIComponent(uuid)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await list();
        pushNotification({ impact: "NONE", message: "Role deleted", scope: "roles" });
        return true;
      }
      const body = await res.json().catch(() => null);
      pushNotification(body ?? { impact: "HIGH", message: `HTTP ${res.status}`, scope: "roles" });
      return false;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete role";
      pushNotification({ impact: "HIGH", message: msg, scope: "roles" });
      return false;
    }
  }

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    list,
    get,
    create,
    update,
    remove,
  };
}
