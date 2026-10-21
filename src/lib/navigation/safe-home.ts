import { shellNav } from '$lib/shell/modules-shell.svelte';

/**
 * Resolve a safe landing URL for a failed/missing route.
 *
 * Walks the pathname parent-by-parent; for each ancestor it consults module
 * metadata (`route_prefixes` + the access-filtered nav already embedded in
 * the `/modules` discovery payload — no extra fetch):
 * - ancestor === a module route_prefix → module home in that root
 * - ancestor === a nav link href → the ancestor itself
 * - ancestor inside a module's prefix but not a nav page → module home
 * - no module matches any ancestor → '/'
 *
 * Never throws: any load failure degrades to '/'.
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
    const root = ancestor.split('/').filter(Boolean)[0];
    const mod = shellNav.modules.find((m) =>
      m.route_prefixes?.some(
        (p) => ancestor === p || (p !== '/' && ancestor.startsWith(p + '/'))
      )
    );
    if (!mod) continue;
    if (mod.nav?.some((l) => l.href === ancestor)) return ancestor;
    return mod.home?.[root] ?? mod.nav?.[0]?.href ?? ancestor;
  }
  return '/';
}
