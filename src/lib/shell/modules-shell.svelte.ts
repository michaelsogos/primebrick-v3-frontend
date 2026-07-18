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
  localStorage.setItem(LAST_ROUTE_KEY, pathname);
}

function resolveModuleFromRoute(pathname: string): string | null {
  for (const m of _state.modules) {
    if (!m.route_prefixes) continue;
    for (const prefix of m.route_prefixes) {
      if (prefix === '/') {
        if (pathname === '/') return m.id;
      } else {
        if (pathname === prefix || pathname.startsWith(prefix + '/')) {
          return m.id;
        }
      }
    }
  }
  return null;
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
  loadShellNav,
  selectModule,
  reloadModuleNav,
  syncModuleFromRoute,
  resolveModuleFromRoute,
  getLastRoute,
  saveLastRoute,
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
  if (moduleId && moduleId !== _state.selected_module_id) {
    await selectModule(moduleId);
  }
}
