<script lang="ts">
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
  import { pushAppError } from '$lib/errors/app-errors';

  let { children }: { children: Snippet } = $props();

  const STORAGE_KEY = 'pb.sidebarCollapsed';
  /** Default collapsed so the main content gets more horizontal space until the user pins it open. */
  let sidebarCollapsed = $state(true);

  let mobileOpen = $state(false);

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

  onMount(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      sidebarCollapsed = saved === 'true';
    }
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
</script>

<div class="h-dvh overflow-hidden bg-background text-foreground">
  <AppToastHost />
  <div class="hidden h-dvh md:flex">
    <AppSidebar collapsed={sidebarCollapsed} onRequestExpand={() => (sidebarCollapsed = false)} />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopbar {...({ onBurgerClick: toggleCollapse, burgerOpen: !sidebarCollapsed } as any)} />

      <AppServerBanner />

      <main class="min-w-0 flex-1 overflow-auto">
        {@render children()}
      </main>
    </div>
  </div>

  <div class="flex h-dvh flex-col md:hidden">
    <Sheet.Root bind:open={mobileOpen}>
      <AppTopbar {...({ onBurgerClick: () => (mobileOpen = !mobileOpen), burgerOpen: mobileOpen } as any)} />

      <AppServerBanner />

      <Sheet.Content side="left" class="p-0">
        <AppSidebar collapsed={false} />
      </Sheet.Content>
    </Sheet.Root>

    <main class="min-w-0 flex-1 overflow-auto">
      {@render children()}
    </main>
  </div>
</div>

