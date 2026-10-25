import { shellNav } from '$lib/shell/modules-shell.svelte';
import { safePageFor } from './access-guard';

/**
 * Resolve a safe landing URL for a failed/missing/denied route.
 *
 * The owning module's declared `default` leaf wins (post access-filter,
 * falling back to the first accessible leaf); when the whole module is
 * inaccessible the root's default module is tried; `/` is the last
 * resort. Pure over the `/modules` discovery payload — no extra fetch.
 *
 * Never throws: any load failure degrades to '/'.
 */
export async function resolveSafePage(pathname: string): Promise<string> {
  if (shellNav.modules.length === 0) {
    try {
      await shellNav.loadShellNav();
    } catch {
      return '/';
    }
  }
  return safePageFor(pathname, shellNav.modules);
}
