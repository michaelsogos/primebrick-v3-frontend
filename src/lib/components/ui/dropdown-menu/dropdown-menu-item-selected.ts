import { cn } from '$lib/utils.js';

/**
 * Single-select dropdowns: style for the row that matches the current value (language, breadcrumb branch, etc.).
 * Matches CRM sidebar sub-nav: base sky tint + on highlight a darker step (not generic `accent`), same idea as table row hover.
 */
export function dropdownMenuSelectedItemClass(selected?: boolean | null): string | undefined {
  if (!selected) return undefined;
  return [
    'bg-sky-100 font-medium text-foreground dark:bg-sky-950/45',
    'data-[highlighted]:bg-sky-200/70 data-[highlighted]:text-foreground',
    'dark:data-[highlighted]:bg-sky-950/55 dark:data-[highlighted]:text-foreground',
  ].join(' ');
}

/** Merge layout classes on `DropdownMenu.Item` with optional selected state. */
export function dropdownMenuItemWithSelectedClass(
  baseClass: string | undefined,
  selected?: boolean | null
): string {
  return cn(baseClass, dropdownMenuSelectedItemClass(selected));
}
