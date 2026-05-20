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
            avatar_color: data.profile.avatar_color
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

