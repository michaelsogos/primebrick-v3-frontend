/**
 * Auth config store — fetches the public auth configuration from the BE
 * (`GET /api/v1/auth/config`) and exposes the flags the FE needs to decide
 * which login methods to show.
 *
 * Uses the same pattern as `user-profile-store.svelte.ts`: the `$state` is
 * exported directly as a module-level singleton, ensuring reactivity works
 * across components.
 *
 * If the fetch fails (BE unreachable, config not loaded), all flags default
 * to `false` — fail closed.
 */

import { apiFetch } from "$lib/api";

export interface AuthConfigPublic {
  enable_formauth: boolean;
  enable_webauthn: boolean;
  passkey_required: boolean;
}

// Export the $state directly — same pattern as userProfileState.
export const authConfigState = $state<{
  config: AuthConfigPublic | null;
  loaded: boolean;
}>({
  config: null,
  loaded: false,
});

let loadStarted = false;

export async function loadAuthConfig(): Promise<void> {
  if (loadStarted) return;
  loadStarted = true;
  try {
    const resp = await apiFetch("/api/v1/auth/config");
    if (resp.ok) {
      authConfigState.config = await resp.json();
    }
  } catch {
    // Fail closed — config stays null, flags are all false
  } finally {
    authConfigState.loaded = true;
  }
}

export const authConfigStore = {
  get enable_formauth(): boolean {
    return authConfigState.config?.enable_formauth ?? false;
  },
  get enable_webauthn(): boolean {
    return authConfigState.config?.enable_webauthn ?? false;
  },
  get passkey_required(): boolean {
    return authConfigState.config?.passkey_required ?? false;
  },
  get loaded(): boolean {
    return authConfigState.loaded;
  },
  load: loadAuthConfig,
};
