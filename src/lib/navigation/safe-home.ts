import { shellNav } from '$lib/shell/modules-shell.svelte';
import { fetchModuleMeta } from '$lib/api';

/**
 * Resolve a safe landing URL for a failed/missing route.
 *
 * Walks the pathname parent-by-parent; for each ancestor it consults module
 * metadata (`route_prefixes` + the module nav links fetched from the BE):
 * - ancestor === a module route_prefix → module default page (first nav link)
 * - ancestor === a nav link href → the ancestor itself
 * - ancestor inside a module's prefix but not a nav page → module default page
 * - no module matches any ancestor → '/'
 *
 * Never throws: any fetch failure degrades to '/'.
 */
export async function resolveSafeHome(pathname: string): Promise<string> {
  const segments = pathname.split('/').filter(Boolean);
  const ancestors: string[] = [];
  for (let i = segments.length - 1; i >= 0; i--) {
    ancestors.push('/' + segments.slice(0, i).join('/'));
  }

  if (shellNav.modules.length === 0) {
    try {
      await shellNav.loadShellNav();
    } catch {
      return '/';
    }
  }

  for (const ancestor of ancestors) {
    if (ancestor === '/') return '/';
    const mod = shellNav.modules.find((m) =>
      m.route_prefixes?.some(
        (p) => ancestor === p || (p !== '/' && ancestor.startsWith(p + '/'))
      )
    );
    if (!mod) continue;
    try {
      const meta = await fetchModuleMeta(mod.id);
      if (meta.nav.some((l) => l.href === ancestor)) return ancestor;
      return meta.nav[0]?.href ?? ancestor;
    } catch {
      continue;
    }
  }
  return '/';
}
