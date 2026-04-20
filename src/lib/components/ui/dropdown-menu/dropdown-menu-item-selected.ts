import { cn } from '$lib/utils.js';

/**
 * Single-select dropdowns: style for the row that matches the current value (language, breadcrumb branch, etc.).
 * Same soft chrome as `menu-row-chrome.ts` (sky fill + `border-input` + `shadow-xs`).
 */
export function dropdownMenuSelectedItemClass(selected?: boolean | null): string | undefined {
  if (!selected) return undefined;
  return [
    'border border-input bg-sky-100 font-semibold text-sky-950 shadow-xs',
    'data-[highlighted]:bg-sky-200 data-[highlighted]:text-sky-950',
  ].join(' ');
}

/** Merge layout classes on `DropdownMenu.Item` with optional selected state. */
export function dropdownMenuItemWithSelectedClass(
  baseClass: string | undefined,
  selected?: boolean | null
): string {
  return cn(baseClass, dropdownMenuSelectedItemClass(selected));
}
