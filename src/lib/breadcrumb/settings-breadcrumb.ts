import type { AppBreadcrumbMenuSegment } from './types';
import { shellNav } from '$lib/shell/modules-shell.svelte';

/**
 * Settings tab menu segment for the breadcrumb dropdown.
 *
 * Reads from the `shellNav` store (the single source of truth for module
 * navigation, fetched from the BE `/api/v1/modules/:code/meta` endpoint).
 * The BE defines the "settings" module nav in `module-nav-meta.ts` —
 * including icons and label keys. The FE never hardcodes the settings tabs.
 *
 * If the module nav is not loaded yet (e.g. on first paint), falls back to
 * an empty items array. The nav loads in the app layout via
 * `syncModuleFromRoute` which resolves the "settings" module for
 * `/system/settings/*` paths.
 */
export function settingsTabMenuSegment(args: {
  pathname: string;
  searchParams: URLSearchParams;
  t: (key: string) => string;
}): AppBreadcrumbMenuSegment {
  const pathname = args.pathname;
  const nav = shellNav.moduleNav;

  const items = (nav?.nav ?? []).map((item) => ({
    label: args.t(item.label_key),
    href: item.href,
    icon: item.icon,
    current: pathname === item.href || pathname.startsWith(item.href + '/')
  }));

  // Find the current item to use as the dropdown label
  const currentItem = items.find((item) => item.current);
  const label = currentItem?.label ?? (items[0]?.label ?? args.t('shell.settings.title'));

  return {
    kind: 'menu',
    label,
    icon: currentItem?.icon,
    menuAriaLabel: args.t('shell.settings.breadcrumbMenu'),
    items
  };
}
