<script lang="ts">
  import { page } from '$app/state';
  import { Badge } from '$lib/components/ui/badge';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Sheet from '$lib/components/ui/sheet';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { cn } from '$lib/utils';
  import BrowserClientInfo from '$lib/components/BrowserClientInfo.svelte';
  import { backendState } from '$lib/backend-availability';
  import { t } from '$lib/i18n';
  import { avatarFallbackChromeClasses } from '$lib/avatar-chrome-palette';
  import { APP_VERSION } from '$lib/version';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { afterNavigate } from '$app/navigation';
  import {
    BadgeCheck,
    Bell,
    Building2,
    Check,
    ChevronRight,
    ChevronsUpDown,
    Cloud,
    CloudOff,
    CreditCard,
    Database,
    LayoutGrid,
    LifeBuoy,
    LogOut,
    Package,
    Receipt,
    Settings,
    Sparkles,
    User,
    Users
  } from 'lucide-svelte';

  let selectedId = $state<string | null>(null);
  let crmOpen = $state(false);

  let versionsOpen = $state(false);

  /** Demo-only org switcher (static); replace with API-backed org when available. */
  type DemoOrgId = 'acme' | 'johnDoe';
  let selectedOrgId = $state<DemoOrgId>('acme');
  const selectedOrgLabel = $derived(
    selectedOrgId === 'acme' ? $t('shell.org.acme') : $t('shell.org.johnDoe')
  );

  const sidebar = Sidebar.useSidebar();
  const collapsed = $derived(sidebar.state === 'collapsed');

  const health = $derived(backendState.health);
  const healthOffline = $derived(backendState.offline);
  const healthChip = $derived(backendState.healthChip);

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

  const healthChipLabel = $derived(
    healthChip === 'backend_offline'
      ? $t('shell.health.beOffline')
      : healthChip === 'db_offline'
        ? $t('shell.health.dbOffline')
        : healthChip === 'ok'
          ? $t('shell.health.beOnline')
          : $t('common.loading')
  );

  const healthChipClass = $derived(
    healthChip === 'backend_offline'
      ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
      : healthChip === 'db_offline'
        ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
        : healthChip === 'ok'
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-border/60 bg-muted/30 text-muted-foreground'
  );

  const userAvatarSeed = 'PB';
  const userName = 'Prime Brick';
  const avatarChromeFallbackClass = $derived(avatarFallbackChromeClasses(userAvatarSeed));

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
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Sidebar.MenuButton
                {...props}
                size="lg"
                class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                title={selectedOrgLabel}
                aria-label={$t('shell.org.switcherAria')}
              >
                <div
                  class="flex size-8 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground"
                >
                  <Building2 class="size-4 opacity-90" aria-hidden="true" />
                </div>
                {#if !collapsed}
                  <div class="grid min-w-0 flex-1 text-left leading-tight">
                    <span class="truncate text-sm font-semibold">{selectedOrgLabel}</span>
                    <span class="truncate text-xs text-muted-foreground">{$t('shell.org.subtitle')}</span>
                  </div>
                  <ChevronsUpDown class="ms-auto size-4 shrink-0 opacity-70" aria-hidden="true" />
                {/if}
              </Sidebar.MenuButton>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            class="w-[var(--bits-dropdown-menu-anchor-width)] min-w-56"
            side="right"
            align="end"
          >
            <DropdownMenu.Label class="px-2 text-xs font-medium text-muted-foreground">
              {$t('shell.org.subtitle')}
            </DropdownMenu.Label>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              class="gap-2"
              closeOnSelect={true}
              onSelect={() => {
                selectedOrgId = 'acme';
              }}
            >
              <span class="flex size-4 shrink-0 items-center justify-center">
                {#if selectedOrgId === 'acme'}
                  <Check class="size-4" aria-hidden="true" />
                {/if}
              </span>
              <span class="min-w-0 flex-1 truncate">{$t('shell.org.acme')}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              class="gap-2"
              closeOnSelect={true}
              onSelect={() => {
                selectedOrgId = 'johnDoe';
              }}
            >
              <span class="flex size-4 shrink-0 items-center justify-center">
                {#if selectedOrgId === 'johnDoe'}
                  <Check class="size-4" aria-hidden="true" />
                {/if}
              </span>
              <span class="min-w-0 flex-1 truncate">{$t('shell.org.johnDoe')}</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
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
            <Sidebar.MenuButton disabled title={$t('shell.nav.demoItemProfile')}>
              <User aria-hidden="true" />
              <span>{$t('shell.nav.demoItemProfile')}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton disabled title={$t('shell.nav.demoItemPreferences')}>
              <Settings aria-hidden="true" />
              <span>{$t('shell.nav.demoItemPreferences')}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton disabled title={$t('shell.nav.demoItemHelp')}>
              <LifeBuoy aria-hidden="true" />
              <span>{$t('shell.nav.demoItemHelp')}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer class="gap-1.5 p-1.5">
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Sidebar.MenuButton
                {...props}
                size="lg"
                title={userName}
                class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar class="size-8 rounded-none avatar-hex">
                  <AvatarFallback class={cn('rounded-none text-xs font-semibold', avatarChromeFallbackClass)}>
                    {userAvatarSeed}
                  </AvatarFallback>
                </Avatar>

                {#if !collapsed}
                  <div class="grid min-w-0 flex-1 text-left leading-tight">
                    <span class="truncate text-sm font-medium">{userName}</span>
                    <span class="truncate text-xs text-muted-foreground">{$t('shell.userMenu.title')}</span>
                  </div>
                {/if}

                <ChevronsUpDown class="ms-auto size-4 shrink-0 opacity-70 group-data-[collapsible=icon]:hidden" />
              </Sidebar.MenuButton>
            {/snippet}
          </DropdownMenu.Trigger>

          <DropdownMenu.Content
            side="right"
            align="end"
            class="w-[var(--bits-dropdown-menu-anchor-width)] min-w-56"
          >
            <DropdownMenu.Label class="p-0 font-normal">
              <div class="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
                <Avatar class="size-8 rounded-none avatar-hex">
                  <AvatarFallback class={cn('rounded-none text-xs font-semibold', avatarChromeFallbackClass)}>
                    {userAvatarSeed}
                  </AvatarFallback>
                </Avatar>
                <div class="grid flex-1 text-left leading-tight">
                  <span class="truncate font-medium">{userName}</span>
                  <span class="truncate text-xs text-muted-foreground">m@example.com</span>
                </div>
              </div>
            </DropdownMenu.Label>

            <DropdownMenu.Separator />

            <DropdownMenu.Group>
              <DropdownMenu.Item disabled>
                <Sparkles />
                <span>{$t('shell.userMenu.itemUpgrade')}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item disabled>
                <BadgeCheck />
                <span>{$t('shell.userMenu.itemAccount')}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item disabled>
                <CreditCard />
                <span>{$t('shell.userMenu.itemBilling')}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item disabled>
                <Bell />
                <span>{$t('shell.userMenu.itemNotifications')}</span>
              </DropdownMenu.Item>
            </DropdownMenu.Group>

            <DropdownMenu.Separator />

            <DropdownMenu.Item variant="destructive" disabled>
              <LogOut />
              <span>{$t('shell.userMenu.itemSignOut')}</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Sidebar.MenuItem>
    </Sidebar.Menu>

    <Sidebar.Separator />
    <div class="w-full px-2 pb-1.5 pt-1 group-data-[collapsible=icon]:px-1.5">
      <!-- Footer chips: health/status first; version control always last (shell convention). -->
      <div
        class="flex w-full flex-wrap items-center gap-2 group-data-[collapsible=icon]:flex-nowrap group-data-[collapsible=icon]:justify-center"
      >
        <Badge
          variant="outline"
          class={cn(
            'pointer-events-none w-fit gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
            'group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!min-h-8 group-data-[collapsible=icon]:!min-w-8 group-data-[collapsible=icon]:shrink-0 group-data-[collapsible=icon]:!rounded-md group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:[&>svg]:!size-4',
            healthChipClass
          )}
          title={healthChipLabel}
        >
          {#if healthChip === 'backend_offline'}
            <CloudOff class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
          {:else if healthChip === 'db_offline'}
            <Database class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
          {:else}
            <Cloud class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
          {/if}
          {#if !collapsed}
            <span>{healthChipLabel}</span>
          {/if}
        </Badge>

        {#if !collapsed || sidebar.isMobile}
          <Sheet.Root bind:open={versionsOpen}>
            <Sheet.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  class="inline-flex h-auto cursor-pointer rounded-md border-0 bg-transparent p-0 shadow-none ring-offset-background hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={$t('shell.health.versionsTitle')}
                  title={$t('shell.health.versionsTitle')}
                >
                  <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                    v{APP_VERSION}
                  </Badge>
                </button>
              {/snippet}
            </Sheet.Trigger>
            <Sheet.Content side="right" class="w-[420px] p-0">
              <div class="flex h-full flex-col">
                <div class="border-b px-4 py-3">
                  <div class="text-sm font-medium">{$t('shell.health.versionsTitle')}</div>
                </div>

                <div class="min-h-0 flex-1 overflow-auto p-4">
                  <div class="space-y-3">
                    <div class="flex items-center justify-between gap-3 text-sm">
                      <div class="text-muted-foreground">{$t('shell.health.shellVersion')}</div>
                      <div class="font-mono">{APP_VERSION}</div>
                    </div>

                    <div class="flex items-center justify-between gap-3 text-sm">
                      <div class="text-muted-foreground">{$t('shell.health.backendVersion')}</div>
                      <div class="font-mono">{health?.version ?? '—'}</div>
                    </div>

                    <div class="pt-1">
                      <div class="mb-2 text-xs font-medium text-muted-foreground">{$t('shell.health.modulesTitle')}</div>
                      {#if health?.modules?.length}
                        <div class="space-y-1">
                          {#each health.modules as m (m.id)}
                            <div class="flex items-center justify-between gap-3 text-sm">
                              <div class="truncate">{m.id}</div>
                              <div class="shrink-0 font-mono text-muted-foreground">{m.version}</div>
                            </div>
                          {/each}
                        </div>
                      {:else if healthOffline}
                        <div class="text-xs text-muted-foreground">{$t('shell.serverUnreachable')}</div>
                      {:else}
                        <div class="text-xs text-muted-foreground">{$t('common.loading')}</div>
                      {/if}
                    </div>

                    <BrowserClientInfo />
                  </div>
                </div>
              </div>
            </Sheet.Content>
          </Sheet.Root>
        {/if}
      </div>
    </div>
  </Sidebar.Footer>
</Sidebar.Root>
