<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import AppTopbar from '$lib/components/AppTopbar.svelte';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import AppServerBanner from '$lib/components/AppServerBanner.svelte';
  import AppToastHost from '$lib/components/AppToastHost.svelte';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { t } from '$lib/i18n';
  import { loadShellNav } from '$lib/shell/modules-shell.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { backendState, probeHealth } from '$lib/backend-availability';
  import { pushAppError } from '$lib/errors/app-errors';

  let { children }: { children: Snippet } = $props();

  let wasOffline = $state(false);
  const backendOffline = $derived(backendState.offline);

  onMount(() => {
    void probeHealth();
    void loadShellNav();

    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const fallback = $t('shell.errors.unhandledRejectionFallback');
      const msg = reason instanceof Error ? reason.message : String(reason ?? fallback);
      pushAppError({ message: msg, scope: $t('shell.errors.unhandledRejection') });
    };
    const onWindowError = (e: ErrorEvent) => {
      const fallback = $t('shell.errors.unhandledErrorFallback');
      const msg = e.error instanceof Error ? e.error.message : e.message;
      pushAppError({
        message: msg || fallback,
        scope: $t('shell.errors.unhandledError')
      });
    };
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('error', onWindowError);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('error', onWindowError);
    };
  });

  /** One interval: poll while BE is unreachable, or while BE is up but DB is down (503 health). */
  $effect(() => {
    if (!browser) return;
    const dbDown =
      backendState.health !== null && !backendState.health.db.ok;
    if (!backendState.offline && !dbDown) return;
    const id = setInterval(() => void probeHealth(), 5000);
    return () => clearInterval(id);
  });

  // When we recover from offline, re-attempt loading modules once.
  $effect(() => {
    const off = backendOffline;
    if (off) {
      wasOffline = true;
      return;
    }
    if (!wasOffline) return;
    wasOffline = false;
    if (shellNav.loading) return;
    if (shellNav.unreachable || shellNav.error) void loadShellNav();
  });
</script>

<div class="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
  <AppToastHost />

  <!--
    Single route tree: one `{@render children()}`.
    Previously we duplicated desktop + mobile columns, which mounted every page twice (duplicate effects, duplicate errors).
  -->
  <Sidebar.Provider class="flex h-full min-h-0 w-full flex-1 flex-row bg-background">
    <AppSidebar />

    <!-- Sidebar.Inset renders `<main>`; keep a single main landmark (no nested `<main>`). -->
    <Sidebar.Inset class="min-h-0 flex-1">
      <!-- z-40 above main (z-0) so topbar chrome (command palette, menus) paints over scrolling page content. -->
      <div class="relative z-40 shrink-0">
        <AppTopbar />
        <AppServerBanner />
      </div>

      <div class="relative z-0 min-h-0 min-w-0 flex-1 overflow-auto">
        {@render children()}
      </div>
    </Sidebar.Inset>
  </Sidebar.Provider>
</div>

