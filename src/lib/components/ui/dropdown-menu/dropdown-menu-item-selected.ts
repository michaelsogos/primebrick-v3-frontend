import { cn } from '$lib/utils.js';

/**
 * Single-select dropdowns: style for the row that matches the current value (language, breadcrumb branch, etc.).
 * Light: sky soft chip (brand). Dark: neutral chip, aligned with `menu-row-chrome` (`menuSoftAriaSelected` / sidebar).
 */
export function dropdownMenuSelectedItemClass(selected?: boolean | null): string | undefined {
  if (!selected) return undefined;
  return [
    'border border-input bg-sky-100 font-semibold text-sky-950 shadow-xs',
    'data-[highlighted]:bg-sky-200 data-[highlighted]:text-sky-950',
    'dark:border-input dark:bg-neutral-800 dark:text-neutral-50 dark:shadow-xs',
    'dark:data-[highlighted]:bg-neutral-700 dark:data-[highlighted]:text-neutral-50',
  ].join(' ');
}

/** Merge layout classes on `DropdownMenu.Item` with optional selected state. */
export function dropdownMenuItemWithSelectedClass(
  baseClass: string | undefined,
  selected?: boolean | null
): string {
  return cn(baseClass, dropdownMenuSelectedItemClass(selected));
}
