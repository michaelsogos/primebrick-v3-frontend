import type { MetaColumn } from '$lib/entity-list/types';

/**
 * Card view: sticky uuid/code-style fields — dark uses **neutral** (same ramp as table sticky, no slate `gray`).
 */
export function stickyCardFieldChromeClass(
  col: MetaColumn,
  rowSelected: boolean,
  destructive: boolean = false,
  stickyColumnsGroup: MetaColumn[]
): string | undefined {
  const stickyKeys = new Set(stickyColumnsGroup.map((c) => c.key));
  if (!stickyKeys.has(col.key)) return undefined;

  const baseClass = 'rounded-md border p-2 transition-colors group-hover';
  if (destructive) {
    if (rowSelected) {
      return `${baseClass} border-rose-300/80 bg-rose-300/85 group-hover:bg-rose-400/90 dark:border-rose-600 dark:bg-rose-700 dark:group-hover:bg-rose-600`;
    }
    return `${baseClass} border-rose-200/80 bg-rose-100/90 group-hover:bg-rose-200/90 dark:border-rose-900 dark:bg-rose-900 dark:group-hover:bg-rose-800`;
  }
  if (rowSelected) {
    return `${baseClass} border-gray-300/80 bg-gray-200/85 group-hover:bg-gray-300/90 dark:border-neutral-600 dark:bg-neutral-700 dark:group-hover:bg-neutral-600`;
  }
  return `${baseClass} border-gray-200/80 bg-gray-100/90 group-hover:bg-gray-200/90 dark:border-neutral-800 dark:bg-neutral-900 dark:group-hover:bg-neutral-800`;
}
