import { cn } from '$lib/utils.js';
import { menuListSelectedSurfaceDropdownClasses } from '../menu-row-chrome.js';

/**
 * Single-select dropdowns: selected row (language, pagination, …).
 * Same surface as command palette + sidebar active (`menu-row-chrome`).
 */
export function dropdownMenuSelectedItemClass(selected?: boolean | null): string | undefined {
  if (!selected) return undefined;
  return menuListSelectedSurfaceDropdownClasses;
}

/** Merge layout classes on `DropdownMenu.Item` with optional selected state. */
export function dropdownMenuItemWithSelectedClass(
  baseClass: string | undefined,
  selected?: boolean | null
): string {
  return cn(baseClass, dropdownMenuSelectedItemClass(selected));
}
