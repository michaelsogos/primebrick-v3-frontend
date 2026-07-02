/**
 * buildAuditData — util that builds the audit data object passed to
 * `<FormPageLayout auditData={...}>`.
 *
 * Consolidates the duplicated audit-data construction across Create/Edit
 * User/Org pages and the Profile page.
 *
 * - Create pages: call with no entity → returns empty audit shell
 *   (uuid='', version=0, all timestamp/user fields undefined).
 * - Edit pages: call with the loaded entity → maps the standard
 *   audit fields from the entity. Returns `{}` when entity is null
 *   (matches the existing `if (!user) return {}` guard).
 *
 * The entity shape uses the standard audit fields present on all
 * Primebrick entities (uuid, version, created_at/by, updated_at/by,
 * deleted_at/by, last_synced_at).
 */

export interface AuditData {
  uuid: string;
  version: number;
  created_at?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deleted_by_name?: string | null;
  last_synced_at?: string | null;
}

export interface AuditableEntity {
  uuid?: string;
  version?: number;
  created_at?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deleted_by_name?: string | null;
  last_synced_at?: string | null;
}

/**
 * Build audit data for a create page (empty shell).
 */
export function buildAuditData(): AuditData;

/**
 * Build audit data from a loaded entity.
 * Returns `{}` when entity is null/undefined (matches existing guard behaviour
 * in Edit pages where `FormPageLayout` receives an empty object until loaded).
 */
export function buildAuditData(entity: AuditableEntity | null | undefined): AuditData | Record<string, never>;

export function buildAuditData(
  entity?: AuditableEntity | null | undefined,
): AuditData | Record<string, never> {
  if (!entity) {
    // Distinguish "create page" (no arg) from "edit page, not yet loaded"
    // by argument arity: create pages call with zero args.
    if (arguments.length === 0) {
      return {
        uuid: "",
        version: 0,
        created_at: undefined,
        created_by: undefined,
        created_by_name: undefined,
        updated_at: undefined,
        updated_by: undefined,
        updated_by_name: undefined,
        deleted_at: undefined,
        deleted_by: undefined,
        deleted_by_name: undefined,
        last_synced_at: undefined,
      };
    }
    return {};
  }
  return {
    uuid: entity.uuid ?? '',
    version: entity.version ?? 0,
    created_at: entity.created_at,
    created_by: entity.created_by,
    created_by_name: entity.created_by_name,
    updated_at: entity.updated_at,
    updated_by: entity.updated_by,
    updated_by_name: entity.updated_by_name,
    deleted_at: entity.deleted_at,
    deleted_by: entity.deleted_by,
    deleted_by_name: entity.deleted_by_name,
    last_synced_at: entity.last_synced_at,
  };
}
