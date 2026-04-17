<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import AppTopbar from '$lib/components/AppTopbar.svelte';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import AppServerBanner from '$lib/components/AppServerBanner.svelte';
  import AppToastHost from '$lib/components/AppToastHost.svelte';
  import * as Sheet from '$lib/components/ui/sheet';
  import { t } from '$lib/i18n';
  import { loadShellNav } from '$lib/shell/modules-shell.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { backendState, probeHealth } from '$lib/backend-availability';
  import { pushAppError } from '$lib/errors/app-errors';

  let { children }: { children: Snippet } = $props();

  const STORAGE_KEY = 'pb.sidebarCollapsed';
  /** Default collapsed so the main content gets more horizontal space until the user pins it open. */
  let sidebarCollapsed = $state(true);

  let mobileOpen = $state(false);

  /** Matches Tailwind `md` (768px): desktop chrome vs mobile sheet. */
  let isMd = $state(false);

  let wasOffline = $state(false);
  const backendOffline = $derived(backendState.offline);

  const burgerOpen = $derived(isMd ? !sidebarCollapsed : mobileOpen);

  /**
   * After each in-app navigation: close the mobile sheet (slide away) and collapse the desktop
   * sidebar so the main content keeps maximum width. Skip desktop/localStorage on the first
   * navigation (no `from`) so `onMount` can still apply a saved preference once.
   */
  afterNavigate(({ from }) => {
    mobileOpen = false;
    if (from) {
      sidebarCollapsed = true;
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  });

  function toggleCollapse() {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem(STORAGE_KEY, String(sidebarCollapsed));
  }

  function onBurgerClick() {
    if (isMd) toggleCollapse();
    else mobileOpen = !mobileOpen;
  }

  onMount(() => {
    void probeHealth();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      sidebarCollapsed = saved === 'true';
    }
    void loadShellNav();

    const mq = window.matchMedia('(min-width: 768px)');
    const syncMq = () => {
      const next = mq.matches;
      isMd = next;
      if (next) mobileOpen = false;
    };
    syncMq();
    mq.addEventListener('change', syncMq);

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
      mq.removeEventListener('change', syncMq);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('error', onWindowError);
    };
  });

  /** One interval for the whole app — not per AppSidebar instance (desktop + sheet). */
  $effect(() => {
    if (!browser) return;
    if (!backendState.offline) return;
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

<div class="h-dvh overflow-hidden bg-background text-foreground">
  <AppToastHost />

  <!--
    Single route tree: one `{@render children()}`.
    Previously we duplicated desktop + mobile columns, which mounted every page twice (duplicate effects, duplicate errors).
  -->
  <div class="flex h-dvh min-h-0 w-full flex-col md:flex-row">
    <div class="hidden h-full shrink-0 md:flex">
      <AppSidebar collapsed={sidebarCollapsed} onRequestExpand={() => (sidebarCollapsed = false)} />
    </div>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <Sheet.Root bind:open={mobileOpen}>
        <AppTopbar {...({ onBurgerClick, burgerOpen } as any)} />

        <AppServerBanner />

        <Sheet.Content side="left" class="p-0 md:hidden">
          <AppSidebar collapsed={false} />
        </Sheet.Content>
      </Sheet.Root>

      <main class="min-h-0 min-w-0 flex-1 overflow-auto">
        {@render children()}
      </main>
    </div>
  </div>
</div>

