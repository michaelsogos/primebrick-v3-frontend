import type { ModuleInfo } from '$lib/api-types';
import { routesCensusFromModules, type CensusRoute } from '$lib/api';
import { defaultLeafHref } from '$lib/shell/modules-shell.svelte';
import { routePatternMatches } from './access-guard';
import type { RemoteErrorKind } from '$lib/components/remote-page/remote-loader';

/**
 * resolvePageForPath — THE single path→outcome resolver behind the `(app)`
 * catch-all. Pure: takes the already-fetched `/modules` payload, returns a
 * discriminated union; the caller decides transport (`redirect`/`error` in
 * load, panels in the component). Access control is NOT its job — the layout
 * guard gates navigation before this ever runs.
 *
 * Resolution order — ONE rule set, converging the three resolver variants
 * the deleted root shims carried (is_reserved-first for `/system`,
 * enabled-first for `/crm`, redirectToModuleDefault for module prefixes):
 *
 *  1. part_of root — single-segment path matching a module's `part_of`
 *     → redirect to the `is_default` module's default leaf (verified in
 *     service_registry: settings is default+reserved, crm is default — the
 *     landing is identical to the deleted variants).
 *  2. module bare prefix — `route_prefixes` exact hit → module default
 *     leaf, or `denied` when the module exposes nothing accessible.
 *  3. declared route — exact match first, THEN template match: both
 *     `/providers/create` and `/providers/[uuid]` may match a concrete
 *     path; the exact declaration always wins so a literal page can never
 *     be swallowed as a param value.
 *     - `component_url` present → `remote` + params extracted from `[name]`
 *       segments positionally.
 *     - `component_url` absent → `error/contract`: declared-but-not-
 *       mountable (host-rendered decl kinds, or nav leaf without a route
 *       decl) — declaration drift surfaced loudly until the generic
 *       archetypes exist (metadata-driven-page-system phase B).
 *  4. nothing → `not-found` (guard whitelisted it → host surface).
 */
export type ResolvedPage =
	| { kind: 'redirect'; href: string }
	| { kind: 'remote'; decl: CensusRoute; params: Record<string, string> }
	| { kind: 'error'; error_kind: RemoteErrorKind; detail: string | null }
	| { kind: 'denied'; detail: string }
	| { kind: 'not-found' };

export function resolvePageForPath(
	pathname: string,
	modules: readonly ModuleInfo[],
): ResolvedPage {
	const seg = pathname.split('/').filter(Boolean);

	// 1. part_of root — `/system`, `/crm`, …
	if (seg.length === 1) {
		const root = seg[0];
		const owner =
			modules.find((m) => m.part_of === root && m.is_default && m.accessible !== false) ??
			modules.find((m) => m.part_of === root && m.enabled !== false && m.accessible !== false);
		if (owner) {
			const href = defaultLeafHref(owner, root);
			if (!href) {
				return {
					kind: 'denied',
					detail: `the '${root}' root exposes no page you may open`,
				};
			}
			return { kind: 'redirect', href };
		}
	}

	// 2. module bare prefix — `/system/ai`, `/system/settings`, …
	const prefixOwner = modules.find((m) => (m.route_prefixes ?? []).includes(pathname));
	if (prefixOwner) {
		const href = defaultLeafHref(prefixOwner, seg[0] ?? '');
		if (!href) {
			return {
				kind: 'denied',
				detail: `the module at '${pathname}' exposes no page you may open`,
			};
		}
		return { kind: 'redirect', href };
	}

	// 3. declared route — exact beats template.
	const routes = routesCensusFromModules(modules);
	const decl =
		routes.find((r) => r.route === pathname) ??
		routes.find((r) => routePatternMatches(r.route, pathname));
	if (decl) {
		if (!decl.component_url) {
			return {
				kind: 'error',
				error_kind: 'contract',
				detail: `route '${decl.route}' is declared (kind:'${decl.kind}') without component_url — no static page and no remote chunk mounts it`,
			};
		}
		return { kind: 'remote', decl, params: extractTemplateParams(decl.route, pathname) };
	}

	return { kind: 'not-found' };
}

/**
 * Positional `[name]` → concrete segment extraction — pairs with
 * `routePatternMatches` (call only on a pattern that already matched).
 */
export function extractTemplateParams(
	pattern: string,
	pathname: string,
): Record<string, string> {
	const p = pattern.split('/').filter(Boolean);
	const u = pathname.split('/').filter(Boolean);
	const params: Record<string, string> = {};
	p.forEach((s, i) => {
		if (s.startsWith('[') && s.endsWith(']')) params[s.slice(1, -1)] = u[i];
	});
	return params;
}
