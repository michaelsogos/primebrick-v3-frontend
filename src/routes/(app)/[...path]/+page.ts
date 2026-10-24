import { error, redirect } from '@sveltejs/kit';
import { fetchModules } from '$lib/api';
import { resolvePageForPath, type ResolvedPage } from '$lib/navigation/page-resolver';

// apiFetch does not forward the session cookie during SSR — the census
// resolution runs client-side only (same as every module route today).
export const ssr = false;

/**
 * THE catch-all universal load — static routes keep precedence, so this
 * only ever serves: bare module prefixes / part_of roots (→ redirect to
 * the declared default leaf), declared remote routes (→ component mounts
 * the chunk), and access-denied or non-declared paths (→ RFC error page).
 */
export async function load({ url }) {
	let resolved: ResolvedPage;
	try {
		resolved = resolvePageForPath(url.pathname, await fetchModules());
	} catch (e) {
		// Census fetch failed — hand the component a retryable network error
		// rather than a SvelteKit 500 (the remote-page UX contract).
		resolved = {
			kind: 'error',
			error_kind: 'network',
			detail: e instanceof Error ? e.message : String(e),
		};
	}
	if (resolved.kind === 'redirect') redirect(307, resolved.href);
	if (resolved.kind === 'denied') error(403, `Access denied — ${resolved.detail}`);
	if (resolved.kind === 'not-found') error(404, `The page '${url.pathname}' does not exist`);
	return { resolved };
}
