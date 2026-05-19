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
