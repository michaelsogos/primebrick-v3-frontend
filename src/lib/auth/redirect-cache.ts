/**
 * URL redirect caching for login flow.
 * Saves the current URL before redirecting to login, and retrieves it after successful login.
 */

const REDIRECT_AFTER_LOGIN_KEY = 'redirectAfterLogin';

/**
 * Save the current URL for redirect after login.
 * Only saves if it's an application URL (not API routes).
 */
export function saveRedirectUrl(url: string): void {
  // Only save application URLs, not API routes
  if (url && !url.startsWith('/api/')) {
    sessionStorage.setItem(REDIRECT_AFTER_LOGIN_KEY, url);
  }
}

/**
 * Retrieve and clear the saved redirect URL.
 * Returns null if no URL was saved.
 */
export function getAndClearRedirectUrl(): string | null {
  const url = sessionStorage.getItem(REDIRECT_AFTER_LOGIN_KEY);
  if (url) {
    sessionStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY);
  }
  return url;
}

/**
 * Check if there's a saved redirect URL.
 */
export function hasRedirectUrl(): boolean {
  return sessionStorage.getItem(REDIRECT_AFTER_LOGIN_KEY) !== null;
}

/**
 * Sanitize a `redirect_path` value (query param or stored URL).
 * Accepts only application-relative paths (`/...`) — rejects absolute URLs,
 * protocol-relative `//host`, backslashes and control chars. Never returns
 * a full URL, so the post-login navigation stays on-origin.
 */
export function sanitizeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const p = raw.trim();
  if (!p.startsWith('/') || p.startsWith('//')) return null;
  if (p.startsWith('/api/')) return null;
  if (/[\\\x00-\x1f]/.test(p)) return null;
  return p;
}

/**
 * Resolve where the user lands after login — deterministic priority:
 *   1. sanitized `redirect_path` query param (explicit intent)
 *   2. sessionStorage-saved redirect (401 bounce / goToLoginPage)
 *   3. `lastRoute` — the last meaningful app page (caller passes
 *      `shellNav.getLastRoute()`; `/`, `/login` and `/api` are never
 *      saved, so this is always a real page or null)
 *   4. `'/'`
 * `lastRoute` is a parameter (not read here) to avoid a module cycle:
 * modules-shell → api → redirect-cache.
 */
export function resolvePostLoginTarget(
  redirectPathParam: string | null,
  lastRoute?: string | null
): string {
  return (
    sanitizeRedirectPath(redirectPathParam) ??
    getAndClearRedirectUrl() ??
    sanitizeRedirectPath(lastRoute) ??
    '/'
  );
}

/**
 * Hard-navigate to the login page, preserving the current location as the
 * post-login target (sessionStorage + `?redirect_path=` — the QS param
 * survives reloads and new-tab opens where sessionStorage wouldn't).
 */
export function goToLoginPage(): void {
  const current = window.location.pathname + window.location.search;
  saveRedirectUrl(current);
  const target = sanitizeRedirectPath(current);
  window.location.href =
    '/login' + (target ? `?redirect_path=${encodeURIComponent(target)}` : '');
}
