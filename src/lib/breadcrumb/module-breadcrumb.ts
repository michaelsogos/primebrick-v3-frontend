import type { AppBreadcrumbMenuSegment } from './types';
import { shellNav } from '$lib/shell/modules-shell.svelte';
import { resolveModuleLabel } from '$lib/shell/module-label';

/**
 * Generic module menu segment for page breadcrumbs — works for ANY
 * module-owned page (job, crm, …), not just settings.
 *
 * Reads `shellNav.moduleNav` — the nav the resolved module declares via
 * `endpoints.nav` — and renders a dropdown listing the module's own links
 * (same sibling links as the sidebar). Label = the module's LOCALIZED
 * display name via `service_registry.label_key` (resolveModuleLabel),
 * so a job page shows "Job Handler ▾" and a settings page "Impostazioni ▾"
 * — identical to what the launcher renders, never a foreign label.
 *
 * Current-item detection uses LONGEST-MATCH semantics: on `/system/job/rules`
 * only the `/system/job/rules` item is marked current — `/system/job` is a prefix of
 * it, not a second current entry.
 *
 * Items are scoped to the ROUTE's root (same rule as the sidebar): a module
 * with pages under two roots (crm → /crm/* + /system/crm/*) only lists the
 * slice owned by the current app level.
 */
export function moduleMenuSegment(args: {
  pathname: string;
  t: (key: string) => string;
}): AppBreadcrumbMenuSegment {
  const nav = shellNav.moduleNav;
  const module = shellNav.modules.find((m) => m.id === shellNav.selectedModuleId);
  const root = shellNav.rootForRoute(args.pathname);

  const rootNav = (nav?.nav ?? []).filter(
    (i) => i.href.split('/').filter(Boolean)[0] === root
  );
  const hrefs = rootNav.map((i) => i.href);
  const activeHref = hrefs
    .filter((h) => args.pathname === h || args.pathname.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0];

  const items = rootNav.map((item) => ({
    label: args.t(item.label_key),
    href: item.href,
    icon: item.icon,
    current: item.href === activeHref
  }));

  const currentItem = items.find((item) => item.current);
  const moduleLabel = resolveModuleLabel(module, args.t);
  return {
    kind: 'menu',
    label: moduleLabel || currentItem?.label || items[0]?.label || '',
    icon: module?.icon ?? currentItem?.icon,
    menuAriaLabel: moduleLabel || undefined,
    items
  };
}
