import { error, redirect } from '@sveltejs/kit';
import { fetchModules, type ModuleInfo } from '$lib/api';
import { defaultLeafHref } from '$lib/shell/modules-shell.svelte';

// Client-only: every authenticated API call in this app happens from the
// browser — SSR-side fetch has no session cookie and the BE would 401.
export const ssr = false;

// Landing on the bare root prefix `/system` must not 404: `/system` is
// the ROOT level (`service_registry.part_of`), not a module prefix — no
// module declares it. Resolve the level's reserved module (settings is
// the platform landing for the system area), then send the user to its
// declared `default` leaf — post access-filter, so the first accessible
// leaf wins when the default itself is filtered out.
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
    modules.find((m) => m.part_of === 'system' && m.is_reserved && m.accessible !== false) ??
    modules.find((m) => m.part_of === 'system' && m.enabled && m.accessible !== false);
  const home = owner ? defaultLeafHref(owner, 'system') : undefined;
  if (!home) {
    error(403, `Access denied — no accessible page under '/system'`);
  }
  redirect(307, home);
}
