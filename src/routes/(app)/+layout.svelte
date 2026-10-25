<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import AppShell from '$lib/components/AppShell.svelte';
  import AuthMethodsPromptDialog from '$lib/components/auth/AuthMethodsPromptDialog.svelte';
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { authConfigState, loadAuthConfig } from '$lib/auth-config-store.svelte';
  import { shouldShowEnforcer, showEnforcer } from '$lib/auth-enforcer-store.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { isRouteAccessible, safePageFor } from '$lib/navigation/access-guard';
  import { pushNotification } from '$lib/errors/app-errors';
  import { useModuleTranslations, loadModuleTranslations } from '$lib/i18n/use-module-translations.svelte';
  import { CORE_DICT_MODULES } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { get } from 'svelte/store';

  let { children }: { children: Snippet } = $props();

  // Route-aware translation loader — watches route + language changes
  const moduleI18n = useModuleTranslations();

  /**
   * Access-axis URL guard — every route under a module-owned prefix must
   * resolve to a leaf that survived the server-side access filter in the
   * `/modules` payload. A denied path (unknown OR filtered — deliberately
   * indistinguishable) pushes an RFC7807 notification naming the page and
   * redirects to the owning module's default leaf (or `/`). Runs on every
   * navigation — direct URL, last-route restore, and in-app links alike.
   */
  $effect(() => {
    const pathname = page.url.pathname;
    const mods = shellNav.modules;
    if (shellNav.loading || mods.length === 0) return;
    if (isRouteAccessible(pathname, mods)) return;
    pushNotification({
      type: '/errors/access-denied',
      title: 'Access denied',
      status: 403,
      detail: `No access to '${pathname}' — it requires an access grant your roles do not hold.`,
      instance: pathname,
      internal_code: 'ACCESS_DENIED',
      severity: 'HIGH',
    });
    void goto(resolve(safePageFor(pathname, mods) as '/'));
  });

  onMount(async () => {
    // Ensure auth config is loaded — shouldShowEnforcer needs it to know
    // which methods are enabled. If config isn't loaded, the enforcer stays
    // hidden (can't decide → don't show).
    await loadAuthConfig();

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
            // Auth method enforcer dialog fields.
            // NO `?? false` fallbacks — we pass the actual response values to
            // shouldShowEnforcer. If the BE omits a field, it stays undefined
            // and the enforcer stays hidden (can't decide → don't show).
            has_passkey: data.has_passkey,
            auth_method_enforcer_dismissed: data.auth_method_enforcer_dismissed,
            has_mfa: data.has_mfa,
            // Expanded permission set for per-CTA enablement (BE stays authoritative).
            permissions: data.permissions,
          });

          // ONE-TIME enforcer decision — made right here, with confirmed
          // /auth/me data in hand. Not reactive, not derived from stale
          // sessionStorage. If this block doesn't run (401, network error),
          // the enforcer stays hidden by default.
          if (
            shouldShowEnforcer({
              has_passkey: data.has_passkey,
              has_mfa: data.has_mfa,
              dismissed: data.auth_method_enforcer_dismissed,
              config: authConfigState.config,
            })
          ) {
            showEnforcer();
          }
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

    // Core dictionaries on app init — the single CORE_DICT_MODULES list:
    // "app" (shell + public pages), "custom" (user-created global keys),
    // "system" (system.entities.* labels + shared chrome needed by every
    // page including service-owned module pages). Each dict revalidates
    // via the same localStorage + ETag flow on every F5.
    for (const dictModule of CORE_DICT_MODULES) {
      await loadModuleTranslations(dictModule, get(uiLang));
    }
  });
</script>

<AppShell>
  {@render children()}
</AppShell>

<AuthMethodsPromptDialog />

