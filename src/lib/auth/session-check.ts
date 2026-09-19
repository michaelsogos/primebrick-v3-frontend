/**
 * session-check — local session state helpers shared between `api.ts`
 * (401 retry/refresh path) and the login page boot.
 *
 * The session mirror lives in `sessionStorage['user']` (written on login
 * and refresh via `userProfileStore.set`). `expires_at` lets the FE check
 * token validity client-side — no `/auth/me` round-trip needed. The
 * refresh cookie (HttpOnly) is the authoritative cross-tab channel.
 */

// Concurrency control for token refresh — multiple simultaneous callers
// wait on the same refresh operation.
let refreshPromise: Promise<void> | null = null;

/**
 * Check if there is a local user session in sessionStorage.
 * NOTE: sessionStorage is per-tab — a fresh tab has no local session even
 * when the HttpOnly refresh cookie is still valid; callers that need to
 * cover that case should attempt {@link triggerRefresh}.
 */
export function hasLocalSession(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) return false;

    const user = JSON.parse(userStr);
    // Consider session valid if it has at least an idp_code or username
    return !!(user.idp_code || user.username);
  } catch {
    return false;
  }
}

/**
 * Check if the access token is expired by comparing expiresAt from session storage.
 * Supports both expires_at (new snake_case) and expiresAt (old camelCase) for soft migration.
 * Missing/invalid data counts as expired — the refresh path self-heals and
 * rewrites a complete `user` on success.
 */
export function isTokenExpired(): boolean {
  if (typeof window === 'undefined') return true;

  try {
    const userStr = sessionStorage.getItem('user');
    if (!userStr) return true;

    const user = JSON.parse(userStr);
    // Support both expires_at (new snake_case) and expiresAt (old camelCase) for soft migration
    const expiresAt = user.expires_at || user.expiresAt;
    if (!expiresAt) return true;

    // Add 30 seconds buffer to account for clock skew
    const now = Date.now();
    return expiresAt - 30000 < now;
  } catch {
    return true;
  }
}

/**
 * Refresh the access token by calling the backend refresh endpoint.
 * Updates session storage with new user data on success.
 */
export async function refreshAccessToken(): Promise<void> {
  try {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Token Refresh] Failed:', errorData);
      throw new Error(errorData.detail || 'Token refresh failed');
    }

    const data = await response.json();

    // Update session storage with new user data
    if (data.success && data.user) {
      sessionStorage.setItem('user', JSON.stringify(data.user));
      console.log('[Token Refresh] Successfully refreshed token');
    }
  } catch (error) {
    console.error('[Token Refresh] Error:', error);
    throw error;
  }
}

/**
 * Trigger token refresh with concurrency control.
 * Multiple simultaneous calls will wait for the same refresh operation.
 */
export async function triggerRefresh(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  await refreshPromise;
}
