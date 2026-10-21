import type { AppBreadcrumbSegment } from './types';
import { shellNav } from '$lib/shell/modules-shell.svelte';
import { resolveModuleLabel } from '$lib/shell/module-label';

/**
 * Generic module breadcrumb segments — works for ANY module-owned page
 * (job, crm, …), not just settings.
 *
 * Returns the two mechanical middle segments of the standard breadcrumb
 * shape `{root} / {module} / {page} [/ {detail}]` (the root segment is
 * auto-prepended by `AppPageBreadcrumb`; detail pages append their own
 * trailing segment):
 *
 *   1. MODULE segment — dropdown labeled with the module's LOCALIZED
 *      display name (`service_registry.label_key` via resolveModuleLabel),
 *      listing the SIBLING modules of the same root level; each item
 *      points to that module's home WITHIN this root (`ModuleInfo.home[root]`
 *      — nav[0] of that root's slice, access-filtered server-side).
 *   2. PAGE segment — dropdown labeled with the CURRENT page's nav label
 *      (e.g. "Clienti"), listing the module's sibling pages in this root
 *      with the current one marked.
 *
 * Reads `shellNav.moduleNav` (current module's nav) and `shellNav.modules`
 * (sibling module list) — both come from the single `/modules` discovery
 * payload. Current-item detection uses LONGEST-MATCH semantics:
 * on `/crm/customers/create` the `/crm/customers` item is current — `/crm`
 * is a prefix, not a second current entry. Items are scoped to the
 * ROUTE's root (same rule as the sidebar): a module with pages under two
 * roots (crm → /crm/* + /system/crm/*) only lists the slice owned by the
 * current app level.
 */
export function moduleBreadcrumbSegments(args: {
  pathname: string;
  t: (key: string) => string;
}): AppBreadcrumbSegment[] {
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
    icon: item.icon ?? 'circle',
    current: item.href === activeHref
  }));

  const currentItem = items.find((item) => item.current);
  const moduleLabel = resolveModuleLabel(module, args.t);
  const segments: AppBreadcrumbSegment[] = [];

  // Sibling modules of this root — every level of the breadcrumb is a
  // switcher of its own level (Finder-style, symmetric with app/page).
  // A module without a reachable home in this root is not listed.
  const siblings = shellNav
    .modulesForRoot(root)
    .map((m) => ({
      label: resolveModuleLabel(m, args.t) || m.name,
      href: m.home?.[root],
      icon: m.icon ?? 'layout-grid',
      current: m.id === module?.id
    }))
    .filter((i): i is typeof i & { href: string } => !!i.href);

  if (moduleLabel) {
    segments.push({
      kind: 'menu',
      label: moduleLabel,
      icon: module?.icon ?? 'layout-grid',
      menuAriaLabel: moduleLabel,
      items: siblings.length > 0 ? siblings : [{ label: moduleLabel, href: rootNav[0]?.href ?? '/', icon: module?.icon ?? 'layout-grid', current: true }]
    });
  }
  if (items.length > 0) {
    segments.push({
      kind: 'menu',
      label: currentItem?.label ?? moduleLabel,
      icon: currentItem?.icon ?? module?.icon ?? 'circle',
      // Accessible name = the current page (module name lives on the
      // module switcher — distinct aria-labels keep the two triggers
      // addressable and truthful).
      menuAriaLabel: currentItem?.label || moduleLabel || undefined,
      items
    });
  }
  return segments;
}
