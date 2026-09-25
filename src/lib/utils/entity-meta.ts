/**
 * Entity meta helpers — `resolvePageTitle` and `getColMeta`.
 *
 * Consolidate the duplicated meta-lookup logic across Edit User, Edit Org,
 * Create User, and Create Org pages.
 */
import type { EntityMeta } from "$lib/entity-list/types";
import { interpolateTemplate } from "$lib/template-interpolate";

/**
 * Resolve the page title for an edit page using the meta's `display_name`
 * template expression (always materialized by `assembleMeta` — defaults to
 * `"${" + display_field + "}"`). Falls back to the provided fallback string
 * when meta or entity is not yet loaded.
 *
 * @param meta Entity metadata (may be null until loaded)
 * @param entity The loaded entity (may be null until loaded)
 * @param fallback Fallback title when template can't be resolved
 */
export function resolvePageTitle(
  meta: EntityMeta | null,
  entity: Record<string, unknown> | null,
  fallback: string,
): string {
  if (meta?.display_name && entity) {
    return interpolateTemplate(meta.display_name, entity);
  }
  return fallback;
}

/**
 * Look up a column metadata entry by key from the entity metadata.
 *
 * @param meta Entity metadata (may be null until loaded)
 * @param key Column key to find
 */
export function getColMeta(
  meta: EntityMeta | null,
  key: string,
) {
  return meta?.columns?.find((c) => c.key === key);
}
