import type { ModuleInfo } from '$lib/api-types';
import {
  defaultLeafHref,
  flattenNavLeaves,
  resolveModuleIdFromPrefixes,
} from '$lib/shell/modules-shell.svelte';

/**
 * Access-axis URL guard — "does this pathname exist for THIS user".
 *
 * The `/modules` payload is the access-filtered census: a pathname owned
 * by a module (longest `route_prefixes` match, same rule as module
 * attribution) is accessible iff it resolves to a leaf that survived the
 * server-side filter — a declared route pattern or a nav leaf href.
 * Everything else under an owned prefix is DENIED: unknown pages and
 * access-filtered pages are deliberately indistinguishable, so denial
 * never leaks whether the page exists at all.
 *
 * Open surface: paths no module owns (`/`, `/login`, `/docs`, `/dev`)
 * and bare-prefix paths themselves — the `(app)/[...path]` catch-all
 * resolves the declared `default` leaf there via `resolvePageForPath`
 * (the guard denies first when the whole module is `accessible:false`).
 */
export function isRouteAccessible(
  pathname: string,
  modules: readonly ModuleInfo[],
): boolean {
  const ownerId = resolveModuleIdFromPrefixes(modules, pathname);
  if (!ownerId) return true; // host surface — outside the access axis
  const owner = modules.find((m) => m.id === ownerId);
  if (!owner) return true;
  if (owner.accessible === false) return false; // zero reachable leaves
  if ((owner.route_prefixes ?? []).includes(pathname)) {
    // Bare prefix → the root shim resolves the default leaf.
    return true;
  }
  return (
    (owner.routes ?? []).some((r) => routePatternMatches(r.route, pathname)) ||
    flattenNavLeaves(owner.nav ?? []).some((l) => l.href === pathname)
  );
}

/**
 * `[param]` segments are per-leaf wildcards — `/x/[uuid]` matches `/x/abc`.
 * Segment count must match exactly (a leaf never swallows deeper paths).
 */
export function routePatternMatches(pattern: string, pathname: string): boolean {
  const p = pattern.split('/').filter(Boolean);
  const u = pathname.split('/').filter(Boolean);
  if (p.length !== u.length) return false;
  return p.every(
    (seg, i) => (seg.startsWith('[') && seg.endsWith(']')) || seg === u[i],
  );
}

/**
 * Where a denied/missing pathname may fall back to — the owning module's
 * default leaf under the pathname's root, else the root's default module,
 * else `/`. Pure over the already-loaded discovery payload.
 */
export function safePageFor(pathname: string, modules: readonly ModuleInfo[]): string {
  const root = pathname.split('/').filter(Boolean)[0] ?? '';
  const ownerId = resolveModuleIdFromPrefixes(modules, pathname);
  const owner = modules.find((m) => m.id === ownerId);
  if (owner && owner.accessible !== false) {
    const href = defaultLeafHref(owner, root);
    if (href) return href;
  }
  const dflt = modules.find(
    (m) => m.part_of === root && m.is_default && m.accessible !== false,
  ) ?? modules.find((m) => m.part_of === root && m.accessible !== false);
  return (dflt ? defaultLeafHref(dflt, root) : undefined) ?? '/';
}
