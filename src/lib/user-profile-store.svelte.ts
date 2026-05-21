import { getContrastTextColor } from './avatar-chrome-palette';

interface UserProfile {
  username?: string;
  idp_code?: string;
  idp_org?: string;
  idp_username?: string;
  displayName?: string;
  email?: string;
  organization?: string;
  avatar_color?: string | null;
  // Audit fields
  uuid?: string;
  created_at?: string;
  created_by?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by?: string;
  updated_by_name?: string;
  version?: number;
}

function loadFromStorage(): UserProfile | null {
  try {
    const stored = sessionStorage.getItem('user');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return null;
}

// Single $state object - mutate in place to preserve reactivity
let currentProfile = $state<UserProfile | null>(loadFromStorage());

export const userProfileStore = {
  get current() { return currentProfile; },
  
  set(profile: Partial<UserProfile>) {
    console.log('[userProfileStore] set called with:', profile);
    if (!currentProfile) {
      currentProfile = {
        idp_code: profile.idp_code,
        idp_org: profile.idp_org,
        idp_username: profile.idp_username,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.email,
        organization: profile.organization,
        avatar_color: profile.avatar_color,
        // Audit fields
        uuid: profile.uuid,
        created_at: profile.created_at,
        created_by: profile.created_by,
        created_by_name: profile.created_by_name,
        updated_at: profile.updated_at,
        updated_by: profile.updated_by,
        updated_by_name: profile.updated_by_name,
        version: profile.version
      };
    } else {
      // Full object replacement ensures reactivity
      currentProfile = { ...currentProfile, ...profile };
    }
    console.log('[userProfileStore] updated currentProfile:', currentProfile);
    sessionStorage.setItem('user', JSON.stringify(currentProfile));
  }
};

export function getUserAvatarStyle(): { style: string; class: string } | null {
  if (!currentProfile?.avatar_color) return null;
  const textColor = getContrastTextColor(currentProfile.avatar_color);
  return {
    style: `background-color: ${currentProfile.avatar_color}; color: ${textColor};`,
    class: 'rounded-none text-xs font-semibold'
  };
}

export function getUserName(): string {
  return currentProfile?.displayName || currentProfile?.username || 'Prime Brick';
}

export function getUserEmail(): string {
  return currentProfile?.email || 'm@example.com';
}
