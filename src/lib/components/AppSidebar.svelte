<script lang="ts">
  import { page } from '$app/state';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { t } from '$lib/i18n';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { afterNavigate } from '$app/navigation';
  import { userProfileState } from '$lib/user-profile-store.svelte';
  import type { ModuleNavLink } from '$lib/api-types';

  import SidebarOrgSwitcher from '$lib/components/sidebar/SidebarOrgSwitcher.svelte';
  import SidebarModuleSwitcher from '$lib/components/sidebar/SidebarModuleSwitcher.svelte';
  import SidebarProfileMenu from '$lib/components/sidebar/SidebarProfileMenu.svelte';
  import SidebarHealthBadge from '$lib/components/sidebar/SidebarHealthBadge.svelte';
  import SidebarVersionBadge from '$lib/components/sidebar/SidebarVersionBadge.svelte';
  import DynamicIcon from '$lib/components/ui/dynamic-icon/DynamicIcon.svelte';

  import ChevronRight from '@lucide/svelte/icons/chevron-right';

  let openGroups = $state<Record<string, boolean>>({});

  const sidebar = Sidebar.useSidebar();
  const collapsed = $derived(sidebar.state === 'collapsed');

  const user = $derived(userProfileState.current);

  const navItems = $derived(shellNav.moduleNav?.nav ?? []);
  const moduleNavLoading = $derived(shellNav.moduleNavLoading);
  const moduleNavError = $derived(shellNav.moduleNavError);

  function isLinkActive(href: string): boolean {
    const pathname = page.url.pathname;
    return pathname === href || pathname.startsWith(href + '/');
  }

  $effect(() => {
    const pathname = page.url.pathname;
    const loading = shellNav.loading;
    const moduleCount = shellNav.modules.length;
    if (loading || moduleCount === 0) return;
    void shellNav.syncModuleFromRoute(pathname);
  });

  async function handleLogout() {
    document.cookie = 'access_token=; path=/; max-age=0';
    document.cookie = 'refresh_token=; path=/api/v1/auth/refresh; max-age=0';
    sessionStorage.removeItem('user');
    window.location.href = '/login';
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
      <Sidebar.GroupLabel class="h-7">{$t('app.nav.module')}</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <SidebarModuleSwitcher {collapsed} />
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
    {@const isParentActive = isLinkActive(item.href)}
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
          <a {...props} href={item.href}>
            <DynamicIcon name={item.icon ?? 'circle'} size={16} />
            <span>{$t(item.label_key)}</span>
          </a>
        {/snippet}
      </Sidebar.MenuButton>
    </Sidebar.MenuItem>
  {/if}
{/snippet}
