import { getContrastTextColor } from './avatar-chrome-palette';

interface UserProfile {
  username?: string;
  idp_code?: string;
  displayName?: string;
  email?: string;
  organization?: string;
  avatar_color?: string | null;
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
    if (!currentProfile) {
      currentProfile = {
        idp_code: profile.idp_code,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.email,
        organization: profile.organization,
        avatar_color: profile.avatar_color
      };
    } else {
      Object.assign(currentProfile, profile);
    }
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
