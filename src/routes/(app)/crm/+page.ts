import { error, redirect } from '@sveltejs/kit';
import { fetchModuleMeta, fetchModules, type ModuleInfo } from '$lib/api';

// Client-only: every authenticated API call in this app happens from the
// browser — SSR-side fetch has no session cookie and the BE would 401.
export const ssr = false;

// Landing on the bare root prefix `/crm` must not 404: the root level
// (`service_registry.part_of`) aggregates modules — resolve the first
// enabled module under this root and send the user to its declared home
// (`nav[0].href`). A fetch/ownership failure surfaces as an error page.
export async function load() {
  let modules: ModuleInfo[];
  try {
    modules = await fetchModules();
  } catch (e) {
    error(500, `Cannot resolve module for '/crm': ${e instanceof Error ? e.message : String(e)}`);
  }
  const ownerId = modules.find((m) => m.part_of === 'crm' && m.enabled)?.id;
  if (!ownerId) {
    error(500, "No module declares ownership of root 'crm'");
  }
  let home: string | undefined;
  try {
    const nav = await fetchModuleMeta(ownerId);
    home = nav.nav?.[0]?.href;
  } catch (e) {
    error(500, `Cannot load nav meta for module '${ownerId}': ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!home) {
    error(500, `Module '${ownerId}' owns root 'crm' but declares no nav home`);
  }
  redirect(307, home);
}
