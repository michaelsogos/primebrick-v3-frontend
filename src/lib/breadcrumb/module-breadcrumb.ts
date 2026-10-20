import type { AppBreadcrumbMenuSegment } from './types';
import { shellNav } from '$lib/shell/modules-shell.svelte';

/**
 * Generic module menu segment for page breadcrumbs — works for ANY
 * module-owned page (job, crm, …), not just settings.
 *
 * Reads `shellNav.moduleNav` — the nav the resolved module declares via
 * `endpoints.nav` — and renders a dropdown listing the module's own links
 * (same sibling links as the sidebar). Label = the module's display name
 * (from `/modules`), so a job page shows "Job Handler ▾", never a foreign
 * module's label.
 *
 * Current-item detection uses LONGEST-MATCH semantics: on `/jobs/rules`
 * only the `/jobs/rules` item is marked current — `/jobs` is a prefix of
 * it, not a second current entry.
 */
export function moduleMenuSegment(args: {
  pathname: string;
  t: (key: string) => string;
}): AppBreadcrumbMenuSegment {
  const nav = shellNav.moduleNav;
  const module = shellNav.modules.find((m) => m.id === shellNav.selectedModuleId);

  const hrefs = (nav?.nav ?? []).map((i) => i.href);
  const activeHref = hrefs
    .filter((h) => args.pathname === h || args.pathname.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0];

  const items = (nav?.nav ?? []).map((item) => ({
    label: args.t(item.label_key),
    href: item.href,
    icon: item.icon,
    current: item.href === activeHref
  }));

  const currentItem = items.find((item) => item.current);
  return {
    kind: 'menu',
    label: module?.name ?? currentItem?.label ?? items[0]?.label ?? '',
    icon: module?.icon ?? currentItem?.icon,
    menuAriaLabel: module?.name,
    items
  };
}
