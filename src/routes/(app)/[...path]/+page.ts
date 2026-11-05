/**
 * THE catch-all — static routes keep precedence, so this page only ever
 * serves declared remote routes, module-prefix redirects and the shared
 * error surfaces. Resolution lives in the COMPONENT, never in `load()`:
 * `fetchModules` goes through `apiFetch`, and a 401 with no session is
 * enqueued by the session-expired flow — the returned promise only
 * settles after re-login, a `load()` awaiting it never returns, the
 * component tree never mounts, and the SessionExpiredDialog itself
 * (rendered by the root layout) can never appear → blank-page deadlock.
 */
export const ssr = false;
