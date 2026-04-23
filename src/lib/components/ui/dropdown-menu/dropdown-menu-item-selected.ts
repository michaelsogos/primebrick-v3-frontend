import { cn } from '$lib/utils.js';

/**
 * Single-select dropdowns: style for the row that matches the current value (language, pagination, etc.).
 * Matches `menu-row-chrome` selected chrome (`menuSoftAriaSelected` / sidebar / command palette) in light and dark.
 */
export function dropdownMenuSelectedItemClass(selected?: boolean | null): string | undefined {
  if (!selected) return undefined;
  return [
    'border border-input bg-neutral-100 font-semibold text-neutral-950 shadow-xs',
    'data-[highlighted]:bg-neutral-200 data-[highlighted]:text-neutral-950',
    '[&_svg]:text-neutral-950',
    'dark:border-input dark:bg-neutral-800 dark:text-neutral-50 dark:shadow-xs',
    'dark:data-[highlighted]:bg-neutral-700 dark:data-[highlighted]:text-neutral-50',
    'dark:[&_svg]:text-neutral-50',
  ].join(' ');
}

/** Merge layout classes on `DropdownMenu.Item` with optional selected state. */
export function dropdownMenuItemWithSelectedClass(
  baseClass: string | undefined,
  selected?: boolean | null
): string {
  return cn(baseClass, dropdownMenuSelectedItemClass(selected));
}
