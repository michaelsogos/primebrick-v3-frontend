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
 * Canonical entity page title — single source of truth for list/create/edit
 * H1 titles. Reads the generic interpolable templates
 * `system.entities.page_title.{list|create|edit}` and substitutes
 * `{entity_plural}` / `{entity_singular}` with the entity's translated names
 * (`system.entities.<translation_key>.{plural|singular}`).
 *
 * Per-language word order lives in the translation value (en: "{entity_plural}
 * List", it: "Lista {entity_plural}") — never hardcode suffixes.
 *
 * `meta.title_key`, when present and non-empty, is an explicit override and
 * wins over the dynamic template (kept for custom pages that need a bespoke
 * title). CRUD entity metas must NOT set `title_key` — the canonical
 * templates cover them.
 *
 * @param metaOrKey Entity metadata or a bare `translation_key` (for pages
 *   that do not load entity metadata)
 * @param kind Which page title to resolve
 * @param t The i18n translate function (e.g. `$t`)
 */
export function entityPageTitle(
  metaOrKey: { translation_key?: string; title_key?: string } | string | null,
  kind: "list" | "create" | "edit",
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const meta = typeof metaOrKey === "string" ? null : metaOrKey;
  if (kind === "list" && meta?.title_key) return t(meta.title_key);
  const tk = typeof metaOrKey === "string" ? metaOrKey : metaOrKey?.translation_key;
  // entity names are lowercase in some locales (e.g. "organization") because
  // the same key is reused mid-sentence (dialogs) — capitalize the injected
  // value so the title reads correctly in every template position.
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  return t(`system.entities.page_title.${kind}`, {
    entity_plural: tk ? cap(t(`system.entities.${tk}.plural`)) : "",
    entity_singular: tk ? cap(t(`system.entities.${tk}.singular`)) : "",
  });
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
