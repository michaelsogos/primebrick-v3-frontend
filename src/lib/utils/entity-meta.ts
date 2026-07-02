/**
 * Entity meta helpers — `resolvePageTitle` and `getColMeta`.
 *
 * Consolidate the duplicated meta-lookup logic across Edit User, Edit Org,
 * Create User, and Create Org pages.
 */
import type { EntityMetadata } from "$lib/composables/useEntityMetadata.svelte";
import { interpolateTemplate } from "$lib/template-interpolate";

/**
 * Resolve the page title for an edit page using the metadata's
 * `updatePageTitle` template expression. Falls back to the provided
 * fallback string when meta or entity is not yet loaded, or when
 * the template is missing.
 *
 * @param meta Entity metadata (may be null until loaded)
 * @param entity The loaded entity (may be null until loaded)
 * @param fallback Fallback title when template can't be resolved
 */
export function resolvePageTitle(
  meta: EntityMetadata | null,
  entity: Record<string, unknown> | null,
  fallback: string,
): string {
  if (meta?.updatePageTitle && entity) {
    return interpolateTemplate(meta.updatePageTitle, entity);
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
  meta: EntityMetadata | null,
  key: string,
) {
  return meta?.list?.columns?.find((c) => c.key === key);
}
