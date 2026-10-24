import { error, redirect } from '@sveltejs/kit';
import { fetchModules, type ModuleInfo } from '$lib/api';
import { defaultLeafHref } from '$lib/shell/modules-shell.svelte';

// Client-only: every authenticated API call in this app happens from the
// browser — SSR-side fetch has no session cookie and the BE would 401.
export const ssr = false;

// Landing on the bare root prefix `/crm` must not 404: the root level
// (`service_registry.part_of`) aggregates modules — resolve the first
// enabled module under this root and send the user to its declared
// `default` leaf (post access-filter — the first accessible leaf wins
// when the default is filtered out). A fetch/ownership failure surfaces
// as an error page.
export async function load() {
  let modules: ModuleInfo[];
  try {
    modules = await fetchModules();
  } catch (e) {
    error(500, `Cannot resolve module for '/crm': ${e instanceof Error ? e.message : String(e)}`);
  }
  const owner = modules.find((m) => m.part_of === 'crm' && m.enabled && m.accessible !== false);
  const home = owner ? defaultLeafHref(owner, 'crm') : undefined;
  if (!home) {
    error(403, `Access denied — no accessible page under '/crm'`);
  }
  redirect(307, home);
}
