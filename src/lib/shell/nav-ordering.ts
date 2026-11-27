/**
 * nav-ordering — the leaf ordering rule (user-ratified 2026-11-27):
 *
 *   pinned    — leaves carrying explicit `order` occupy their position
 *               (1-based, clamped to the array length; colliding pins
 *               tie-break alphabetically, overflow shifts forward)
 *   unpinned  — every other leaf fills the remaining slots ALPHABETICALLY
 *               by translated label, in the app's language
 *
 * The sort is render-time BY DESIGN: the translated label exists only
 * where the i18n dictionary is resolved — the nav payload itself stays
 * language-neutral and cacheable. `children` arrays recurse under the
 * same rule (same type, same semantic).
 */
import type { ModuleNavLink } from '$lib/api-types';

export function sortNavLeaves(
  leaves: readonly ModuleNavLink[],
  labelOf: (key: string) => string
): ModuleNavLink[] {
  const alpha = (a: ModuleNavLink, b: ModuleNavLink) =>
    labelOf(a.label_key).localeCompare(labelOf(b.label_key), undefined, { sensitivity: 'base' });

  // The ext-json wire codec is bigint-safe: integer contract fields may
  // arrive as BigInt. `order` is a small positional int by contract —
  // coerce at this consumer boundary (Math.min/max and mixed arithmetic
  // throw on raw BigInt).
  const ord = (l: ModuleNavLink): number | null => (l.order != null ? Number(l.order) : null);

  const pinned = leaves
    .filter((l) => ord(l) != null)
    .sort((a, b) => (ord(a) ?? 0) - (ord(b) ?? 0) || alpha(a, b));
  const unpinned = leaves.filter((l) => ord(l) == null).sort(alpha);

  const len = leaves.length;
  const slots: (ModuleNavLink | undefined)[] = new Array(len);
  for (const p of pinned) {
    let pos = Math.min(Math.max(ord(p) ?? 1, 1), len) - 1;
    while (slots[pos] !== undefined && pos < len - 1) pos++;
    if (slots[pos] !== undefined) pos = slots.findIndex((s) => s === undefined);
    slots[pos] = p;
  }
  let u = 0;
  for (let i = 0; i < len; i++) {
    if (slots[i] === undefined) slots[i] = unpinned[u++];
  }

  return (slots as ModuleNavLink[]).map((leaf) =>
    leaf.children?.length ? { ...leaf, children: sortNavLeaves(leaf.children, labelOf) } : leaf
  );
}
