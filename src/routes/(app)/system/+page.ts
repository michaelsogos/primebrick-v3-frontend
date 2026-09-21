import { redirect } from '@sveltejs/kit';
import { fetchModuleMeta, fetchModules } from '$lib/api';

// Landing on the bare module prefix `/system` must not 404: resolve the
// module that owns the prefix, then send the user to its home — the first
// nav link declared by the module. That target may itself redirect deeper
// (e.g. /system/settings → /system/settings/profile).
export async function load() {
  let home: string | null = null;
  try {
    const modules = await fetchModules();
    const mod = modules.find((m) => m.route_prefixes?.includes('/system'));
    if (mod) {
      const nav = await fetchModuleMeta(mod.id);
      home = nav.nav?.[0]?.href ?? null;
    }
  } catch {
    // fall through to the static fallback
  }
  redirect(307, home ?? '/system/settings');
}
