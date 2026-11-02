import { userPreferences } from '$lib/composables/useUserPreferences.svelte';

export interface UserProfile {
  uuid?: string;
  username?: string;
  idp_code?: string;
  /** Access-token expiry (ms epoch) — session metadata, written by login/refresh. */
  expires_at?: number;
  idp_org?: string;
  idp_username?: string;
  display_name?: string;
  email?: string;
  organization?: string;
  avatar_color?: string | null;
  avatar_initials?: string | null;
  is_admin?: boolean;
  is_verified?: boolean;
  email_verified?: boolean;
  issuer?: string;
  roles?: string[];
  /** Expanded permission set emitted by `GET /api/v1/auth/me` (may contain `*` wildcards). */
  permissions?: string[];
  // Audit fields
  created_at?: string;
  created_by?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by?: string;
  updated_by_name?: string;
  deleted_at?: string;
  deleted_by?: string;
  deleted_by_name?: string;
  version?: number;
  last_synced_at?: string;
  has_passkey?: boolean;
  auth_method_enforcer_dismissed?: boolean;
  has_mfa?: boolean;
}

function loadFromStorage(): UserProfile | null {
  try {
    const stored = sessionStorage.getItem('user');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return null;
}

// Single $state object - mutate in place to preserve reactivity
export const userProfileState = $state({
  current: loadFromStorage() as UserProfile | null
});

export const userProfileStore = {
  get current() { return userProfileState.current; },

  set(profile: Partial<UserProfile>) {
    const current = userProfileState.current;
    // Always assign a NEW object reference to `.current` to force updates
    // while preserving any fields not present in the PATCH response.
    const next = current ? { ...current, ...profile } : ({ ...profile } as UserProfile);
    userProfileState.current = next;
    sessionStorage.setItem('user', JSON.stringify(next));
  },

  /**
   * Session-fields writer — login/refresh payloads (IDP JWT claims) may
   * update ONLY session metadata. Identity fields (`display_name`,
   * `avatar_*`, `is_admin`, `uuid`, …) are owned solely by
   * `GET /api/v1/auth/me` → `user_profiles`: claims are NOT authoritative
   * and must never overwrite them (single source of truth, certified —
   * never deduced).
   *
   * Account switch: when the payload's `idp_code` differs from the stored
   * one the identity fields are dropped — `/auth/me` repopulates them
   * reactively, so no stale identity of a different account can linger.
   */
  setSession(user: Record<string, unknown>) {
    const SESSION_FIELDS = ['username', 'idp_code', 'expires_at', 'roles', 'organization'] as const;
    const patch: Partial<UserProfile> = {};
    for (const k of SESSION_FIELDS) {
      if (user[k] !== undefined) (patch as Record<string, unknown>)[k] = user[k];
    }
    const nextIdp = user.idp_code as string | undefined;
    const current = userProfileState.current;
    const differentAccount = !!nextIdp && !!current?.idp_code && nextIdp !== current.idp_code;
    const next = differentAccount ? ({ ...patch } as UserProfile) : ({ ...current, ...patch } as UserProfile);
    userProfileState.current = next;
    sessionStorage.setItem('user', JSON.stringify(next));
  },

  clear() {
    userProfileState.current = null;
    sessionStorage.removeItem('user');
    // Session-bound stores clear together — the preferences mirror holds
    // per-user data (favorites…) that must never leak across accounts.
    userPreferences.clear();
  },
};

export function getUserName(): string {
  return userProfileState.current?.display_name || userProfileState.current?.username || 'Prime Brick';
}

export function getUserEmail(): string {
  return userProfileState.current?.email || 'm@example.com';
}
