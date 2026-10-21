<script lang="ts">
  import { page } from '$app/state';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { t } from '$lib/i18n';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { afterNavigate } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { userProfileState, userProfileStore } from '$lib/user-profile-store.svelte';
  import { getAndClearRedirectUrl } from '$lib/auth/redirect-cache';
  import type { ModuleNavLink } from '$lib/api-types';

  import SidebarOrgSwitcher from '$lib/components/sidebar/SidebarOrgSwitcher.svelte';
  import SidebarAppLauncher from '$lib/components/sidebar/SidebarAppLauncher.svelte';
  import SidebarProfileMenu from '$lib/components/sidebar/SidebarProfileMenu.svelte';
  import SidebarHealthBadge from '$lib/components/sidebar/SidebarHealthBadge.svelte';
  import SidebarVersionBadge from '$lib/components/sidebar/SidebarVersionBadge.svelte';
  import DynamicIcon from '$lib/components/ui/dynamic-icon/DynamicIcon.svelte';

  import ChevronRight from '@lucide/svelte/icons/chevron-right';

  let openGroups = $state<Record<string, boolean>>({});

  const sidebar = Sidebar.useSidebar();
  const collapsed = $derived(sidebar.state === 'collapsed');

  const user = $derived(userProfileState.current);

  /**
   * Nav items scoped to the ROUTE's root — a module with pages under two
   * roots (crm → /crm/* + /system/crm/*) only shows the slice owned by
   * the current app level. Links whose first segment differs from the
   * route root are hidden; children inherit their parent's scope.
   */
  const navItems = $derived.by(() => {
    const nav = shellNav.moduleNav?.nav ?? [];
    const root = shellNav.rootForRoute(page.url.pathname);
    return nav.filter((item) => item.href.split('/').filter(Boolean)[0] === root);
  });
  const moduleNavLoading = $derived(shellNav.moduleNavLoading);
  const moduleNavError = $derived(shellNav.moduleNavError);

  /** All declared nav hrefs (links + group children) — flattened once so
   *  active resolution can pick the longest match. */
  const navHrefs = $derived(
    navItems.flatMap((item) => [
      item.href,
      ...(item.children ?? []).map((child) => child.href)
    ])
  );

  function isLinkActive(href: string): boolean {
    const pathname = page.url.pathname;
    // Prefix match alone is not enough: a link only glows when the current
    // route actually belongs to THIS module — otherwise a broad declared
    // prefix would light up on pages owned by another module.
    if (!(pathname === href || pathname.startsWith(href + '/'))) return false;
    if (shellNav.resolveModuleFromRoute(pathname) !== shellNav.selectedModuleId) return false;
    // LONGEST MATCH WINS — sibling links may share prefixes (e.g. `/system/job`
    // and `/system/job/rules`); only the most specific declared link is active,
    // never both. On deeper sub-pages (`/system/job/rules/123`) the longest
    // declared prefix still resolves correctly.
    return !navHrefs.some(
      (h) => h !== href && h.length > href.length && (pathname === h || pathname.startsWith(h + '/'))
    );
  }

  $effect(() => {
    const pathname = page.url.pathname;
    const loading = shellNav.loading;
    const moduleCount = shellNav.modules.length;
    if (loading || moduleCount === 0) return;
    void shellNav.syncModuleFromRoute(pathname);
  });

  async function handleLogout() {
    // Auth cookies are HttpOnly — document.cookie cannot touch them (the
    // previous attempt was dead code: the refresh cookie survived and the
    // login boot silently re-authenticated). Only the server can clear
    // them, via POST /auth/logout. Best-effort: local state is cleared
    // regardless of the response.
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // offline / BE down — still clear everything local
    }
    userProfileStore.clear();      // sessionStorage['user'] + in-memory profile
    getAndClearRedirectUrl();      // a logout must never restore a saved redirect
    shellNav.clearLastRoute();     // don't land the next session on this user's page
    window.location.href = '/login'; // NO redirect_path — by definition
  }

  afterNavigate(() => {
    shellNav.saveLastRoute(page.url.pathname);
  });
</script>

<Sidebar.Root side="left" variant="sidebar" collapsible="icon" aria-label={$t('app.nav.aria')}>
  <Sidebar.Content>
    <Sidebar.Group class="pb-0">
      <Sidebar.GroupLabel class="h-7">{$t('app.org.subtitle')}</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <SidebarOrgSwitcher {collapsed} />
      </Sidebar.GroupContent>
    </Sidebar.Group>

    <Sidebar.Group class="pt-0 pb-0">
      <Sidebar.GroupLabel class="h-7">{$t('app.nav.rootLevel')}</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <SidebarAppLauncher {collapsed} />
      </Sidebar.GroupContent>
    </Sidebar.Group>

    <Sidebar.Group class="pt-0">
      <Sidebar.GroupLabel class="h-7">{$t('app.nav.links')}</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          {#if moduleNavLoading}
            <div class="px-2 py-1.5 text-xs text-muted-foreground">{$t('app.common.loading')}</div>
          {:else if moduleNavError}
            <div class="px-2 py-1.5 text-xs text-destructive">
              {$t('app.modulesLoadFailed')}
              <button onclick={() => shellNav.reloadModuleNav()} class="ml-2 underline">
                {$t('app.retry')}
              </button>
            </div>
          {:else if navItems.length > 0}
            {#each navItems as item (item.id)}
              {@render navLink(item, 1)}
            {/each}
          {/if}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer class="gap-1.5 p-1.5">
    <div
      class="text-sidebar-foreground/70 ring-sidebar-ring flex h-7 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opa] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0"
      data-sidebar="group-label"
    >
      {$t('app.userMenu.title')}
    </div>
    <SidebarProfileMenu {user} {collapsed} onLogout={handleLogout} />

    <Sidebar.Separator />
    <div class="w-full px-2 pb-1.5 pt-1 group-data-[collapsible=icon]:px-1.5">
      <div
        class="flex w-full flex-wrap items-center gap-2 group-data-[collapsible=icon]:flex-nowrap group-data-[collapsible=icon]:justify-center"
      >
        <SidebarHealthBadge {collapsed} />
        <SidebarVersionBadge {collapsed} isMobile={sidebar.isMobile} />
      </div>
    </div>
  </Sidebar.Footer>
</Sidebar.Root>

{#snippet navLink(item: ModuleNavLink, level: 1 | 2)}
  {#if item.children && item.children.length > 0}
    {@const isParentActive =
      isLinkActive(item.href) || item.children.some((child) => isLinkActive(child.href))}
    {@const groupOpen = openGroups[item.id] ?? isParentActive}
    <Sidebar.MenuItem>
      <div class="group/collapsible" data-state={groupOpen ? 'open' : 'closed'}>
        <Sidebar.MenuButton
          isActive={isParentActive}
          aria-expanded={groupOpen}
          onclick={() => {
            if (collapsed) {
              sidebar.setOpen(true);
              openGroups[item.id] = true;
              return;
            }
            openGroups[item.id] = !groupOpen;
          }}
        >
          <DynamicIcon name={item.icon ?? 'circle'} size={16} />
          <span>{$t(item.label_key)}</span>
          <ChevronRight
            class="ms-auto size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden"
            aria-hidden="true"
          />
        </Sidebar.MenuButton>
        {#if groupOpen}
          <Sidebar.MenuSub>
            {#each item.children as child (child.id)}
              <Sidebar.MenuSubItem>
                <Sidebar.MenuSubButton href={child.href} isActive={isLinkActive(child.href)}>
                  <DynamicIcon name={child.icon ?? 'circle'} size={14} />
                  <span>{$t(child.label_key)}</span>
                </Sidebar.MenuSubButton>
              </Sidebar.MenuSubItem>
            {/each}
          </Sidebar.MenuSub>
        {/if}
      </div>
    </Sidebar.MenuItem>
  {:else if level === 1}
    <Sidebar.MenuItem>
      <Sidebar.MenuButton isActive={isLinkActive(item.href)}>
        {#snippet child({ props })}
          <a {...props} href={resolve(item.href as '/')}>
            <DynamicIcon name={item.icon ?? 'circle'} size={16} />
            <span>{$t(item.label_key)}</span>
          </a>
        {/snippet}
      </Sidebar.MenuButton>
    </Sidebar.MenuItem>
  {/if}
{/snippet}
