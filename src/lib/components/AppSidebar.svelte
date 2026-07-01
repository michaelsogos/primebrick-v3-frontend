<script lang="ts">
  import { page } from '$app/state';
  import { Badge } from '$lib/components/ui/badge';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { pushNotification } from '$lib/errors/app-errors';
  import { afterNavigate } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import { userProfileState } from '$lib/user-profile-store.svelte';

  import SidebarOrgSwitcher from '$lib/components/sidebar/SidebarOrgSwitcher.svelte';
  import SidebarProfileMenu from '$lib/components/sidebar/SidebarProfileMenu.svelte';
  import SidebarHealthBadge from '$lib/components/sidebar/SidebarHealthBadge.svelte';
  import SidebarVersionBadge from '$lib/components/sidebar/SidebarVersionBadge.svelte';

  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import LifeBuoy from '@lucide/svelte/icons/life-buoy';
  import Siren from '@lucide/svelte/icons/siren';
  import Package from '@lucide/svelte/icons/package';
  import Receipt from '@lucide/svelte/icons/receipt';
  import Settings from '@lucide/svelte/icons/settings';
  import User from '@lucide/svelte/icons/user';
  import Users from '@lucide/svelte/icons/users';

  let selectedId = $state<string | null>(null);
  let crmOpen = $state(false);

  const sidebar = Sidebar.useSidebar();
  const collapsed = $derived(sidebar.state === 'collapsed');

  async function demoToastProfile() {
    try {
      // Call customer list API to trigger LIST_FAILED error (when PB_CUSTOMERS_FORCE_ERROR=1)
      const res = await apiFetch('/api/v1/entities/customer/list?force_error=1');
      if (!res.ok) {
        const data = await res.json() as { title?: string; internal_code?: string; instance?: string; status?: number; detail?: string };
        const toneForImpact = 'danger'; // HIGH impact uses danger
        pushNotification({
          impact: 'HIGH',
          message: data.title || data.detail,
          messageKey: !data.title && !data.detail ? 'shell.listFailed' : undefined,
          scope: $t('errors.scope.customerListApi'),
          tags: [
            { label: data.internal_code || 'LIST_FAILED', tone: toneForImpact },
            ...(data.status ? [{ label: `HTTP ${data.status}`, tone: toneForImpact } as const] : []),
            ...(data.instance ? [{ label: data.instance, tone: toneForImpact } as const] : []),
          ],
          toast: true,
        });
      }
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'shell.listFailed',
        scope: $t('errors.scope.customerListApi'),
        toast: true
      });
    }
  }

  function demoToastPreferences() {
    pushNotification({
      impact: 'MEDIUM',
      messageKey: 'shell.demoToast.preferencesMessage',
      scopeKey: 'shell.nav.demoItemPreferences'
    });
  }

  function demoToastHelp() {
    pushNotification({
      impact: 'HIGH',
      messageKey: 'shell.demoToast.helpMessage',
      scopeKey: 'shell.nav.demoItemHelp'
    });
  }

  function demoToastCritical() {
    pushNotification({
      impact: 'CRITICAL',
      messageKey: 'shell.demoToast.criticalMessage',
      scopeKey: 'shell.nav.demoItemCriticalToast'
    });
  }

  async function handleLogout() {
    // Clear cookies by setting them with past expiration
    document.cookie = 'access_token=; path=/; max-age=0';
    document.cookie = 'refresh_token=; path=/api/v1/auth/refresh; max-age=0';

    // Clear sessionStorage
    sessionStorage.removeItem('user');

    // Redirect to login page
    window.location.href = '/login';
  }

  const hrefForModule = (_id: string) => {
    return undefined;
  };

  const customersActive = $derived(page.url.pathname === '/customers' || page.url.pathname.startsWith('/customers/'));
  const pipelineActive = $derived(
    page.url.pathname === '/crm/pipeline' || page.url.pathname.startsWith('/crm/pipeline/')
  );

  const navLoadFailed = $derived(shellNav.unreachable || !!shellNav.error);

  const iconFor = (id: string) => {
    const key = id.toLowerCase();
    if (key.includes('crm') || key.includes('customer')) return Users;
    if (key.includes('warehouse') || key.includes('stock')) return Package;
    if (key.includes('account') || key.includes('invoice') || key.includes('billing')) return Receipt;
    return LayoutGrid;
  };

  // Use reactive user profile state — read .current directly so Svelte 5 tracks mutations
  const user = $derived(userProfileState.current);

  $effect(() => {
    if (shellNav.loading) return;
    if (navLoadFailed) return;
    const first = shellNav.modules.find((m) => m.enabled) ?? shellNav.modules[0];
    selectedId = first?.id ?? null;
    crmOpen = customersActive || pipelineActive;
  });

  /**
   * Keep the shell behavior: close the mobile sheet on navigation and collapse on desktop after
   * subsequent navigations so content keeps max width.
   */
  afterNavigate(({ from }) => {
    sidebar.setOpenMobile(false);
    if (from && !sidebar.isMobile) sidebar.setOpen(false);
  });
</script>

<Sidebar.Root side="left" variant="sidebar" collapsible="icon" aria-label={$t('shell.nav.aria')}>
  <Sidebar.Header>
    <SidebarOrgSwitcher {collapsed} />
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>{$t('shell.nav.modulesGroup')}</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          {#if shellNav.loading}
            <div class="px-2 py-1.5 text-xs text-muted-foreground">{$t('common.loading')}</div>
          {:else}
            {#each shellNav.modules as m (m.id)}
              {@const Icon = iconFor(m.id)}
              {@const href = hrefForModule(m.id)}
              {@const isActive = href
                ? page.url.pathname === href || page.url.pathname.startsWith(`${href}/`)
                : selectedId === m.id}

              <Sidebar.MenuItem>
                {#if m.id === 'crm'}
                  {@const crmParentActive = selectedId === m.id && !customersActive}
                  <div
                    class="group/collapsible"
                    data-state={crmOpen ? 'open' : 'closed'}
                  >
                    <Sidebar.MenuButton
                      isActive={crmParentActive || (collapsed && (customersActive || pipelineActive))}
                      aria-disabled={!m.enabled}
                      aria-expanded={crmOpen}
                      title={m.name}
                      onclick={() => {
                        if (!m.enabled) return;
                        if (collapsed) {
                          sidebar.setOpen(true);
                          crmOpen = true;
                          return;
                        }
                        selectedId = m.id;
                        crmOpen = !crmOpen;
                      }}
                    >
                      <Icon />
                      <span>{m.name}</span>
                      {#if !m.enabled}
                        <Badge
                          variant="outline"
                          class="ml-auto h-5 px-2 text-[10px] group-data-[collapsible=icon]:hidden"
                        >
                          {$t('common.soon')}
                        </Badge>
                      {:else}
                        <ChevronRight
                          class="ms-auto size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden"
                          aria-hidden="true"
                        />
                      {/if}
                    </Sidebar.MenuButton>

                    {#if crmOpen}
                      <Sidebar.MenuSub>
                        <Sidebar.MenuSubItem>
                          <Sidebar.MenuSubButton href="/customers" isActive={customersActive}>
                            <span>{$t('entities.customer.title')}</span>
                          </Sidebar.MenuSubButton>
                        </Sidebar.MenuSubItem>
                        <Sidebar.MenuSubItem>
                          <Sidebar.MenuSubButton href="/crm/pipeline" isActive={pipelineActive}>
                            <span>{$t('entities.crm.pipeline.nav')}</span>
                          </Sidebar.MenuSubButton>
                        </Sidebar.MenuSubItem>
                      </Sidebar.MenuSub>
                    {/if}
                  </div>
                {:else}
                  <Sidebar.MenuButton
                    isActive={isActive}
                    aria-disabled={!m.enabled}
                    title={m.name}
                  >
                    {#snippet child({ props })}
                      <a
                        {...props}
                        href={m.enabled ? href : undefined}
                        aria-disabled={!m.enabled}
                        onclick={(e) => {
                          if (!m.enabled) e.preventDefault();
                          if (!href && m.enabled) selectedId = m.id;
                        }}
                      >
                        <Icon />
                        <span>{m.name}</span>
                        {#if !m.enabled}
                          <Badge
                            variant="outline"
                            class="ml-auto h-5 px-2 text-[10px] group-data-[collapsible=icon]:hidden"
                          >
                            {$t('common.soon')}
                          </Badge>
                        {/if}
                      </a>
                    {/snippet}
                  </Sidebar.MenuButton>
                {/if}
              </Sidebar.MenuItem>
            {/each}
          {/if}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    <Sidebar.Group>
      <Sidebar.GroupLabel>{$t('shell.nav.demoSettingsGroup')}</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              type="button"
              title={$t('shell.nav.demoItemProfile')}
              aria-label={$t('shell.demoToast.profileAria')}
              onclick={demoToastProfile}
            >
              <User aria-hidden="true" />
              <span>{$t('shell.nav.demoItemProfile')}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              type="button"
              title={$t('shell.nav.demoItemPreferences')}
              aria-label={$t('shell.demoToast.preferencesAria')}
              onclick={demoToastPreferences}
            >
              <Settings aria-hidden="true" />
              <span>{$t('shell.nav.demoItemPreferences')}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              type="button"
              title={$t('shell.nav.demoItemHelp')}
              aria-label={$t('shell.demoToast.helpAria')}
              onclick={demoToastHelp}
            >
              <LifeBuoy aria-hidden="true" />
              <span>{$t('shell.nav.demoItemHelp')}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              type="button"
              title={$t('shell.nav.demoItemCriticalToast')}
              aria-label={$t('shell.demoToast.criticalAria')}
              onclick={demoToastCritical}
            >
              <Siren aria-hidden="true" />
              <span>{$t('shell.nav.demoItemCriticalToast')}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer class="gap-1.5 p-1.5">
    <SidebarProfileMenu {user} {collapsed} onLogout={handleLogout} />

    <Sidebar.Separator />
    <div class="w-full px-2 pb-1.5 pt-1 group-data-[collapsible=icon]:px-1.5">
      <!-- Footer chips: health/status first; version control always last (shell convention). -->
      <div
        class="flex w-full flex-wrap items-center gap-2 group-data-[collapsible=icon]:flex-nowrap group-data-[collapsible=icon]:justify-center"
      >
        <SidebarHealthBadge {collapsed} />
        <SidebarVersionBadge {collapsed} isMobile={sidebar.isMobile} />
      </div>
    </div>
  </Sidebar.Footer>
</Sidebar.Root>
