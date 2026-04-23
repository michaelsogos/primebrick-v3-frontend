import { cn } from '$lib/utils.js';

/**
 * Single-select dropdowns: selected row (language, pagination, …).
 * Light: sky fill only — no `border-input` outline; dark: neutral fill only (same idea as dark soft chips).
 */
export function dropdownMenuSelectedItemClass(selected?: boolean | null): string | undefined {
  if (!selected) return undefined;
  return [
    'border-transparent bg-sky-100 font-semibold text-sky-950 shadow-xs',
    'data-[highlighted]:bg-sky-200 data-[highlighted]:text-sky-950',
    '[&_svg]:text-sky-950',
    'dark:border-transparent dark:bg-neutral-800 dark:text-neutral-50 dark:shadow-xs',
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
