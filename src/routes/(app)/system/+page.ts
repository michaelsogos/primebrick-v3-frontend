import { error, redirect } from '@sveltejs/kit';
import { fetchModuleMeta, fetchModules, type ModuleInfo } from '$lib/api';

// Client-only: every authenticated API call in this app happens from the
// browser — SSR-side fetch has no session cookie and the BE would 401.
export const ssr = false;

// Landing on the bare root prefix `/system` must not 404: `/system` is
// the ROOT level (`service_registry.part_of`), not a module prefix — no
// module declares it. Resolve the level's reserved module (settings is
// the platform landing for the system area), then send the user to its
// declared home — the first nav link (`nav[0].href`, may itself redirect
// deeper e.g. /system/settings → /system/settings/profile).
// A fetch/ownership failure surfaces as an error page, not an arbitrary
// redirect to a module the route does not belong to.
export async function load() {
  let modules: ModuleInfo[];
  try {
    modules = await fetchModules();
  } catch (e) {
    error(500, `Cannot resolve module for '/system': ${e instanceof Error ? e.message : String(e)}`);
  }
  const ownerId =
    modules.find((m) => m.part_of === 'system' && m.is_reserved)?.id ??
    modules.find((m) => m.part_of === 'system' && m.enabled)?.id;
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
