import { getContrastTextColor } from './avatar-chrome-palette';

export interface UserProfile {
  uuid?: string;
  username?: string;
  idp_code?: string;
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

  clear() {
    userProfileState.current = null;
    sessionStorage.removeItem('user');
  },
};

export function getUserAvatarStyle(): { style: string; class: string } | null {
  if (!userProfileState.current?.avatar_color) return null;
  const textColor = getContrastTextColor(userProfileState.current.avatar_color);
  return {
    style: `background-color: ${userProfileState.current.avatar_color}; color: ${textColor};`,
    class: 'rounded-none text-xs font-semibold'
  };
}

export function getUserName(): string {
  return userProfileState.current?.display_name || userProfileState.current?.username || 'Prime Brick';
}

export function getUserEmail(): string {
  return userProfileState.current?.email || 'm@example.com';
}
