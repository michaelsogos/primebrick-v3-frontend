import { page } from '$app/state';
import { shellNav } from '$lib/shell/modules-shell.svelte';
import { routesCensusFromModules, type CensusRoute } from '$lib/api';
import { routePatternMatches } from '$lib/navigation/access-guard';

/**
 * useRouteDecl — resolves the CURRENT page's route declaration from the
 * route census (the same flattened `/modules` view `resolvePageForPath`
 * consumes): exact match first, then `[param]` template match.
 *
 * Returns plain functions — NEVER `$derived` values (the Svelte 5 compiler
 * would unwrap them into frozen snapshots). Consumers create their own
 * `$derived` around `decl()` — reads of `page.url.pathname` and
 * `shellNav.modules` are tracked normally.
 *
 * Fails soft → `null`: uncensused `(app)` paths are blocked upstream by the
 * access guard, so a null decl is a drift signal, not a normal state.
 */
export function useRouteDecl() {
	return {
		/** The census declaration for `page.url.pathname`, or null. */
		decl(): CensusRoute | null {
			const pathname = page.url.pathname;
			const routes = routesCensusFromModules(shellNav.modules);
			return (
				routes.find((r) => r.route === pathname) ??
				routes.find((r) => routePatternMatches(r.route, pathname)) ??
				null
			);
		},
	};
}
