import { fetchModules, fetchModuleMeta, ApiUnreachableError, type ModuleInfo, type ModuleNav } from '$lib/api';
import type { DeepReadonly } from '$lib/types/deep-readonly';

const _state = $state({
  loading: true,
  modules: [] as ModuleInfo[],
  unreachable: false,
  error: null as string | null,
  selected_module_id: null as string | null,
  module_nav: null as ModuleNav | null,
  module_nav_loading: false,
  module_nav_error: null as string | null,
});

const LAST_ROUTE_KEY = 'pb:shell:lastRoute';

function getLastRoute(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(LAST_ROUTE_KEY);
}

function saveLastRoute(pathname: string): void {
  if (typeof localStorage === 'undefined') return;
  // Only meaningful app pages are restorable — `/` (blank home), `/login`
  // and API paths must never overwrite the last real page, otherwise the
  // post-login restore degenerates to "always `/`".
  if (pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/api/')) return;
  localStorage.setItem(LAST_ROUTE_KEY, pathname);
}

function clearLastRoute(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(LAST_ROUTE_KEY);
}

/**
 * Pure prefix-ownership resolver: longest-prefix match wins — a module
 * declaring a specific route_prefix (e.g. job → /system/job) owns that
 * page even when it sits under a broader prefix owned by another module
 * (settings → /system). First-match would let the broad prefix swallow
 * service-owned routes. No match → `null` (neutral: no module owns the
 * route — e.g. `/` home). Shared by the shell and route loaders.
 */
export function resolveModuleIdFromPrefixes(
  modules: readonly { id: string; route_prefixes?: string[] }[],
  pathname: string,
): string | null {
  let best: { id: string; len: number } | null = null;
  for (const m of modules) {
    if (!m.route_prefixes) continue;
    for (const prefix of m.route_prefixes) {
      const matches =
        prefix === '/'
          ? pathname === '/'
          : pathname === prefix || pathname.startsWith(prefix + '/');
      if (matches && (!best || prefix.length > best.len)) {
        best = { id: m.id, len: prefix.length };
      }
    }
  }
  return best?.id ?? null;
}

function resolveModuleFromRoute(pathname: string): string | null {
  // Neutral when nothing owns the route: no module is attributed — the
  // switcher shows a neutral state instead of falsely attributing the
  // page to the reserved module.
  return resolveModuleIdFromPrefixes(_state.modules, pathname);
}

/**
 * Distinct root levels (`part_of`) across the registered modules —
 * 'system' first (the platform root), the rest alphabetical. Drives the
 * sidebar's root-level selector and the breadcrumb root segment.
 */
function listRoots(modules: readonly ModuleInfo[]): string[] {
  const roots = [...new Set(modules.filter((m) => m.enabled !== false).map((m) => m.part_of).filter(Boolean))];
  return roots.sort((a, b) => (a === 'system' ? -1 : b === 'system' ? 1 : a.localeCompare(b)));
}

export const shellNav = {
  get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
  get loading() { return _state.loading; },
  get modules() { return _state.modules; },
  get unreachable() { return _state.unreachable; },
  get error() { return _state.error ?? undefined; },
  get selectedModuleId() { return _state.selected_module_id; },
  get moduleNav() { return _state.module_nav; },
  get moduleNavLoading() { return _state.module_nav_loading; },
  get moduleNavError() { return _state.module_nav_error ?? undefined; },
  /** Root levels present in the registry (e.g. ['system', 'crm']). */
  get roots(): string[] { return listRoots(_state.modules); },
  /** The selected module's root level — 'system' when nothing is selected
   *  (the platform root is the shell's neutral level). */
  get selectedRoot(): string {
    return _state.modules.find((m) => m.id === _state.selected_module_id)?.part_of ?? 'system';
  },
  /** Modules living under a root level (sidebar filtering). */
  modulesForRoot(root: string): ModuleInfo[] {
    return _state.modules.filter((m) => m.part_of === root);
  },
  loadShellNav,
  selectModule,
  reloadModuleNav,
  syncModuleFromRoute,
  resolveModuleFromRoute,
  getLastRoute,
  saveLastRoute,
  clearLastRoute,
};

export { loadShellNav };

async function loadShellNav(): Promise<void> {
  _state.loading = true;
  _state.error = null;
  try {
    _state.modules = await fetchModules();
    _state.unreachable = false;
  } catch (e) {
    if (e instanceof ApiUnreachableError) {
      _state.unreachable = true;
      _state.error = null;
    } else {
      _state.unreachable = false;
      _state.error = e instanceof Error ? e.message : 'Failed to load modules';
    }
  } finally {
    _state.loading = false;
  }
}

async function selectModule(moduleId: string): Promise<void> {
  if (_state.selected_module_id === moduleId && _state.module_nav) return;
  _state.selected_module_id = moduleId;
  _state.module_nav = null;
  _state.module_nav_error = null;
  _state.module_nav_loading = true;
  try {
    _state.module_nav = await fetchModuleMeta(moduleId);
  } catch (e) {
    _state.module_nav_error = e instanceof Error ? e.message : 'Failed to load module navigation';
    _state.module_nav = null;
  } finally {
    _state.module_nav_loading = false;
  }
}

async function reloadModuleNav(): Promise<void> {
  if (!_state.selected_module_id) return;
  const id = _state.selected_module_id;
  _state.selected_module_id = null;
  await selectModule(id);
}

async function syncModuleFromRoute(pathname: string): Promise<void> {
  if (_state.loading || _state.modules.length === 0) return;
  const moduleId = resolveModuleFromRoute(pathname);
  if (moduleId === _state.selected_module_id) return;
  if (moduleId) {
    await selectModule(moduleId);
    return;
  }
  // No module owns this route → neutral selection, no stale attribution.
  _state.selected_module_id = null;
  _state.module_nav = null;
  _state.module_nav_error = null;
  _state.module_nav_loading = false;
}
