import { SvelteSet } from 'svelte/reactivity';
import { fetchModules, ApiUnreachableError, type ModuleInfo, type ModuleNav, type ModuleNavLink } from '$lib/api';
import type { ModuleSheetDecl } from '@primebrick/ui';
import type { DeepReadonly } from '@primebrick/ui';

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
 * Resolve a remote sheet declaration by open-sheet key (`<module>.<name>`)
 * across every discovered module's `sheets[]` — the declarations arrive
 * inside the `/modules` payload already access-filtered server-side, so a
 * resolved decl is always one this user may open. `null` = no module
 * declared that key (or discovery hasn't landed yet).
 */
export function resolveRemoteSheetDecl(key: string): ModuleSheetDecl | null {
  for (const m of _state.modules) {
    const decl = m.sheets?.find((s) => s.key === key);
    if (decl) return decl;
  }
  return null;
}

/** First path segment — the root level a href lives under. */
function rootOfPath(href: string): string {
  return href.split('/').filter(Boolean)[0] ?? '';
}

/**
 * Every nav leaf in declaration order — children flattened after their
 * parent. `nav` is already access-filtered server-side, so every entry
 * here is a page this user may open.
 */
export function flattenNavLeaves(
  links: readonly { children?: readonly unknown[] }[],
  out: ModuleNavLink[] = [],
): ModuleNavLink[] {
  for (const l of links as ModuleNavLink[]) {
    out.push(l);
    if (l.children) flattenNavLeaves(l.children, out);
  }
  return out;
}

/**
 * GOTO(module, root) target — the declared `default` leaf when it lives
 * under this root AND survived access filtering, else the first
 * accessible leaf under the root. `undefined` when nothing is navigable
 * there — the module is routing-domain only in that root.
 */
export function defaultLeafHref(
  mod: Pick<ModuleInfo, 'nav'>,
  root: string,
): string | undefined {
  const leaves = flattenNavLeaves(mod.nav ?? []).filter(
    (l) => rootOfPath(l.href) === root,
  );
  return leaves.find((l) => l.default === true)?.href ?? leaves[0]?.href;
}

/**
 * Distinct NAVIGABLE root levels — 'system' first (the platform root),
 * the rest alphabetical. A root appears only when at least one module
 * has an accessible leaf under it; declared prefixes that own no
 * navigable page stay in the routing domain, not the launcher.
 */
function listRoots(modules: readonly ModuleInfo[]): string[] {
  const set = new SvelteSet<string>();
  for (const m of modules) {
    if (m.enabled === false || m.accessible === false) continue;
    for (const l of flattenNavLeaves(m.nav ?? [])) set.add(rootOfPath(l.href));
  }
  return [...set].sort((a, b) => (a === 'system' ? -1 : b === 'system' ? 1 : a.localeCompare(b)));
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
  /**
   * Root level for a ROUTE — the URL's first segment when it is a known
   * root (a crm page under /system/crm/* reports 'system', not 'crm');
   * falls back to the selected module's `part_of` for rootless paths.
   * Drives breadcrumb/app-switcher highlight: the shown app is where the
   * page lives, not where its module is registered.
   */
  rootForRoute(pathname: string): string {
    const seg = pathname.split('/').filter(Boolean)[0];
    if (seg && this.roots.includes(seg)) return seg;
    return this.selectedRoot;
  },
  /** Modules NAVIGABLE under a root level — the access-filtered nav has
   *  at least one leaf under that root. Prefix-only membership is
   *  routing-domain (the module owns URLs there but has nothing to
   *  navigate to). */
  modulesForRoot(root: string): ModuleInfo[] {
    return _state.modules.filter(
      (m) =>
        m.accessible !== false &&
        flattenNavLeaves(m.nav ?? []).some((l) => rootOfPath(l.href) === root),
    );
  },
  /** Modules that declare surface under `root` but have ZERO accessible
   *  leaves (`accessible:false`) — the launcher reveal switch renders
   *  them disabled; never navigable. */
  inaccessibleModulesForRoot(root: string): ModuleInfo[] {
    return _state.modules.filter(
      (m) =>
        m.accessible === false &&
        (m.route_prefixes ?? []).some((p) => rootOfPath(p) === root),
    );
  },
  /** Declared default module for a root — `is_default` among `part_of`
   *  members (the claim is for the module's OWN root), else first member. */
  defaultModuleForRoot(root: string): ModuleInfo | undefined {
    const members = this.modulesForRoot(root);
    return members.find((m) => m.part_of === root && m.is_default) ?? members[0];
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
  _state.module_nav_error = null;
  // No fetch — the discovery payload already embeds every reachable
  // module's nav + routes (access-filtered server-side). The nav is
  // available from the first paint, not a second request later.
  const mod = _state.modules.find((m) => m.id === moduleId);
  // A page-less module (headless service) yields an empty nav, not an error.
  _state.module_nav = mod ? { module: mod.id, nav: mod.nav ?? [], routes: mod.routes } : null;
  _state.module_nav_error = mod ? null : `Unknown or unreachable module '${moduleId}'`;
  _state.module_nav_loading = false;
}

async function reloadModuleNav(): Promise<void> {
  const id = _state.selected_module_id;
  _state.selected_module_id = null;
  _state.module_nav = null;
  // The nav lives inside the discovery payload — a real reload re-fetches
  // it, then re-derives the selection.
  await loadShellNav();
  if (id) await selectModule(id);
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
