import { error, redirect } from '@sveltejs/kit';
import { fetchModules, type ModuleInfo } from '$lib/api';

// Client-only: every authenticated API call in this app happens from the
// browser — SSR-side fetch has no session cookie and the BE would 401.
export const ssr = false;

// Landing on the bare root prefix `/system` must not 404: `/system` is
// the ROOT level (`service_registry.part_of`), not a module prefix — no
// module declares it. Resolve the level's reserved module (settings is
// the platform landing for the system area), then send the user to its
// declared home for that root — `ModuleInfo.home[root]`, the first nav
// link of the root slice (may itself redirect deeper e.g.
// /system/settings → /system/settings/profile).
// A fetch/ownership failure surfaces as an error page, not an arbitrary
// redirect to a module the route does not belong to.
export async function load() {
  let modules: ModuleInfo[];
  try {
    modules = await fetchModules();
  } catch (e) {
    error(500, `Cannot resolve module for '/system': ${e instanceof Error ? e.message : String(e)}`);
  }
  const owner =
    modules.find((m) => m.part_of === 'system' && m.is_reserved) ??
    modules.find((m) => m.part_of === 'system' && m.enabled);
  if (!owner) {
    error(500, "No module declares ownership of route '/system'");
  }
  const home = owner.home?.['system'];
  if (!home) {
    error(500, `Module '${owner.id}' owns '/system' but declares no nav home`);
  }
  redirect(307, home);
}
