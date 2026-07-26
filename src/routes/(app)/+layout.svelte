<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import AppShell from '$lib/components/AppShell.svelte';
  import AuthMethodsPromptDialog from '$lib/components/auth/AuthMethodsPromptDialog.svelte';
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  let { children }: { children: Snippet } = $props();

  onMount(async () => {
    try {
      const res = await apiFetch('/api/v1/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.profile) {
          userProfileStore.set({
            uuid: data.profile.uuid,
            idp_code: data.profile.idp_code,
            idp_org: data.profile.idp_org,
            idp_username: data.profile.idp_username,
            display_name: data.profile.display_name,
            email: data.profile.email,
            avatar_color: data.profile.avatar_color,
            avatar_initials: data.profile.avatar_initials,
            is_admin: data.profile.is_admin,
            is_verified: data.profile.is_verified,
            issuer: data.profile.issuer,
            // Audit fields
            created_at: data.profile.created_at,
            created_by: data.profile.created_by,
            created_by_name: data.profile.created_by_name,
            updated_at: data.profile.updated_at,
            updated_by: data.profile.updated_by,
            updated_by_name: data.profile.updated_by_name,
            version: data.profile.version,
            // Auth method enforcer dialog fields
            has_passkey: data.has_passkey ?? false,
            auth_method_enforcer_dismissed: data.auth_method_enforcer_dismissed ?? false,
            has_mfa: data.has_mfa ?? false,
          });
        }
      } else if (res.status === 401) {
        // Session is invalid — clear stale profile so the passkey dialog
        // doesn't render on top of the session-expired dialog.
        userProfileStore.clear();
      }
    } catch (error) {
      console.error('Failed to bootstrap user profile:', error);
    }

    // Restore last-visited route from localStorage (if not already on it)
    const currentPath = page.url.pathname;
    const lastRoute = shellNav.getLastRoute();
    if (lastRoute && lastRoute !== '/login' && lastRoute !== currentPath) {
      await goto(lastRoute);
    }
  });
</script>

<AppShell>
  {@render children()}
</AppShell>

<AuthMethodsPromptDialog />

