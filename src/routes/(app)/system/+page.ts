import { error, redirect } from '@sveltejs/kit';
import { fetchModuleMeta, fetchModules, type ModuleInfo } from '$lib/api';
import { resolveModuleIdFromPrefixes } from '$lib/shell/modules-shell.svelte';

// Client-only: every authenticated API call in this app happens from the
// browser — SSR-side fetch has no session cookie and the BE would 401.
export const ssr = false;

// Landing on the bare module prefix `/system` must not 404: resolve the
// module that owns the prefix by longest-prefix ownership (the same rule
// the shell applies — first-match would let an arbitrary module win),
// then send the user to its home — the first nav link declared by the
// module. That target may itself redirect deeper
// (e.g. /system/settings → /system/settings/profile).
// A fetch/ownership failure surfaces as an error page, not an arbitrary
// redirect to a module the route does not belong to.
export async function load() {
  let modules: ModuleInfo[];
  try {
    modules = await fetchModules();
  } catch (e) {
    error(500, `Cannot resolve module for '/system': ${e instanceof Error ? e.message : String(e)}`);
  }
  const ownerId = resolveModuleIdFromPrefixes(modules, '/system');
  if (!ownerId) {
    error(500, "No module declares ownership of route '/system'");
  }
  let home: string | undefined;
  try {
    const nav = await fetchModuleMeta(ownerId);
    home = nav.nav?.[0]?.href;
  } catch (e) {
    error(500, `Cannot load nav meta for module '${ownerId}': ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!home) {
    error(500, `Module '${ownerId}' owns '/system' but declares no nav home`);
  }
  redirect(307, home);
}
