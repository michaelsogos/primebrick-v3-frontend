/**
 * Tab-scoped client session id — identifies THIS browser tab across the
 * collaboration stack. `sessionStorage` is per-tab per spec: two tabs of the
 * same user get different ids (and a duplicated tab inherits the id — it is
 * the same logical session). The id is sent as `session_id` in presence
 * signals and as `X-Client-Session` on entity writes, so the server can
 * distinguish "my own tab" from "another tab of the same user".
 *
 * Falls back to a process-level uuid when sessionStorage is unavailable
 * (SSR, privacy modes) — presence still works, session granularity degrades
 * to the page lifetime.
 */
const KEY = 'pb.tab_session';
let fallback: string | null = null;

export function getTabSessionId(): string {
	if (typeof window === 'undefined') return 'ssr';
	try {
		let id = window.sessionStorage.getItem(KEY);
		if (!id) {
			id = crypto.randomUUID();
			window.sessionStorage.setItem(KEY, id);
		}
		return id;
	} catch {
		fallback ??= crypto.randomUUID();
		return fallback;
	}
}
