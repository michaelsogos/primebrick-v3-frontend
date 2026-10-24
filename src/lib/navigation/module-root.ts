import { error, redirect } from '@sveltejs/kit';
import { fetchModules } from '$lib/api';
import { defaultLeafHref } from '$lib/shell/modules-shell.svelte';

/**
 * Universal `load` for a module-ROOT path (`/system/job`, `/system/ai`,
 * `/crm` module roots). The bare prefix is a namespace, never a page —
 * resolve the owning module's declared `default` leaf (post
 * access-filter; the first accessible leaf wins when the default is
 * filtered out) and redirect.
 *
 * A module with zero accessible leaves yields a 403 — the URL guard /
 * error surface renders the RFC error; the shim stays a pure resolver.
 */
export async function redirectToModuleDefault(prefix: string): Promise<never> {
  const modules = await fetchModules();
  const owner = modules.find((m) => m.route_prefixes?.includes(prefix));
  const root = prefix.split('/').filter(Boolean)[0] ?? '';
  const href = owner ? defaultLeafHref(owner, root) : undefined;
  if (!href) {
    error(
      403,
      `Access denied — the module at '${prefix}' exposes no page you may open`,
    );
  }
  redirect(307, href);
}
