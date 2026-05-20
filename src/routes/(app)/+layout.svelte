<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import AppShell from '$lib/components/AppShell.svelte';
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';

  let { children }: { children: Snippet } = $props();

  onMount(async () => {
    try {
      const res = await apiFetch('/api/v1/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.profile) {
          userProfileStore.set({
            idp_code: data.profile.idp_code,
            displayName: data.profile.display_name,
            email: data.profile.email,
            avatar_color: data.profile.avatar_color,
            // Audit fields
            uuid: data.profile.uuid,
            created_at: data.profile.created_at,
            created_by: data.profile.created_by,
            created_by_name: data.profile.created_by_name,
            updated_at: data.profile.updated_at,
            updated_by: data.profile.updated_by,
            updated_by_name: data.profile.updated_by_name,
            version: data.profile.version
          });
        }
      }
    } catch (error) {
      console.error('Failed to bootstrap user profile:', error);
    }
  });
</script>

<AppShell>
  {@render children()}
</AppShell>

