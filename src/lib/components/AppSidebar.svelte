<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Sheet from '$lib/components/ui/sheet';
  import type { HealthPayload } from '$lib/api-types';
  import { backendAvailability, probeHealth } from '$lib/backend-availability';
  import { t } from '$lib/i18n';
  import { APP_VERSION } from '$lib/version';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import {
    ChevronDown,
    ChevronRight,
    Cloud,
    CloudOff,
    Database,
    Kanban,
    LayoutGrid,
    Package,
    Receipt,
    Users
  } from 'lucide-svelte';

  let { collapsed = false, onRequestExpand }: { collapsed?: boolean; onRequestExpand?: () => void } = $props();

  let selectedId = $state<string | null>(null);
  let crmOpen = $state(false);

  let versionsOpen = $state(false);
  let health = $state<HealthPayload | null>(null);
  let healthOffline = $state(false);

  $effect(() => {
    return backendAvailability.subscribe((s) => {
      health = s.health;
      healthOffline = s.offline;
    });
  });

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

  const healthState = $derived(
    healthOffline ? 'backend_offline' : !health ? 'loading' : !health.db.ok ? 'db_offline' : 'ok'
  );

  const healthChipLabel = $derived(
    healthState === 'backend_offline'
      ? $t('shell.health.beOffline')
      : healthState === 'db_offline'
        ? $t('shell.health.dbOffline')
        : healthState === 'ok'
          ? $t('shell.health.beOnline')
          : $t('common.loading')
  );

  const healthChipClass = $derived(
    healthState === 'backend_offline'
      ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
      : healthState === 'db_offline'
        ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
        : healthState === 'ok'
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-border/60 bg-muted/30 text-muted-foreground'
  );

  const healthIcon = $derived(
    healthState === 'backend_offline' ? CloudOff : healthState === 'db_offline' ? Database : Cloud
  );

  $effect(() => {
    if (shellNav.loading) return;
    if (navLoadFailed) return;
    const first = shellNav.modules.find((m) => m.enabled) ?? shellNav.modules[0];
    selectedId = first?.id ?? null;
    crmOpen = customersActive || pipelineActive;
  });

  /** Initial health snapshot (uses plain fetch inside probeHealth — works even when apiFetch is gated). */
  $effect(() => {
    void probeHealth({ force: true });
  });

  /** While BE is marked offline, poll every 5s for recovery (no polling spam while online). */
  $effect(() => {
    if (!healthOffline) return;
    const id = setInterval(() => void probeHealth({ force: true }), 5000);
    return () => clearInterval(id);
  });
</script>

<aside
  class="relative h-full bg-[hsl(var(--sidebar-chrome))] text-[hsl(var(--sidebar-chrome-foreground))] shadow-sm transition-[width] duration-200 ease-out after:pointer-events-none after:absolute after:right-0 after:top-[calc(3.5rem+1px)] after:bottom-0 after:w-px after:bg-border/40"
  aria-label={$t('shell.nav.aria')}
  style={`width: ${collapsed ? '72px' : '280px'}`}
>
  <div class="flex h-full flex-col">
    <div class="flex h-14 items-center gap-2 px-3">
      <div class="flex size-9 items-center justify-center rounded-md border bg-background/30 font-semibold">
        P
      </div>
      {#if !collapsed}
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold">{$t('app.title')}</div>
          <div class="truncate text-xs text-muted-foreground">{$t('shell.subtitle')}</div>
        </div>
      {/if}
    </div>

    <nav class="flex-1 min-h-0 overflow-y-auto p-2">
      {#if shellNav.loading}
        <div class="px-2 py-1 text-xs text-muted-foreground">{$t('common.loading')}</div>
      {:else}
        <ul class="space-y-1">
          {#each shellNav.modules as m (m.id)}
            {@const Icon = iconFor(m.id)}
            {@const href = hrefForModule(m.id)}
            {@const isActive = href
              ? page.url.pathname === href || page.url.pathname.startsWith(`${href}/`)
              : selectedId === m.id}
            <li>
              {#if m.id === 'crm'}
                {@const crmParentActive = selectedId === m.id && !customersActive}
                {@const crmCollapsedChildActive = collapsed && (customersActive || pipelineActive)}
                <Button
                  type="button"
                  variant={crmParentActive ? 'secondary' : 'ghost'}
                  class={
                    collapsed
                      ? crmCollapsedChildActive
                        ? 'h-10 w-full justify-center px-0 bg-sky-100 hover:bg-sky-200/70 dark:bg-sky-950/45 dark:hover:bg-sky-950/55'
                        : 'h-10 w-full justify-center px-0'
                      : crmParentActive
                        ? 'h-10 w-full justify-between px-3 bg-sky-100 hover:bg-sky-200/70 dark:bg-sky-950/45 dark:hover:bg-sky-950/55'
                        : 'h-10 w-full justify-between px-3'
                  }
                  disabled={!m.enabled}
                  title={m.name}
                  onclick={() => {
                    if (!m.enabled) return;
                    if (collapsed) {
                      onRequestExpand?.();
                      crmOpen = true;
                      return;
                    }
                    selectedId = m.id;
                    crmOpen = !crmOpen;
                  }}
                >
                  <span class={collapsed ? '' : 'flex items-center gap-2'}>
                    <Icon class="size-4 opacity-80" />
                    {#if !collapsed}
                      <span class="truncate">{m.name}</span>
                    {/if}
                  </span>
                  {#if !collapsed}
                    {#if crmOpen}
                      <ChevronDown class="size-4 opacity-70" />
                    {:else}
                      <ChevronRight class="size-4 opacity-70" />
                    {/if}
                  {/if}
                  {#if !collapsed && !m.enabled}
                    <Badge variant="outline" class="h-5 px-2 text-[10px]">{$t('common.soon')}</Badge>
                  {/if}
                </Button>

                {#if !collapsed && crmOpen}
                  <div class="mt-1 rounded-md bg-background/85 p-1 shadow-sm ring-1 ring-border/40">
                    <Button
                      href="/customers"
                      variant={customersActive ? 'secondary' : 'ghost'}
                      class={customersActive
                        ? 'h-9 w-full justify-start px-3 text-sm bg-sky-100 hover:bg-sky-200/70 dark:bg-sky-950/45 dark:hover:bg-sky-950/55'
                        : 'h-9 w-full justify-start px-3 text-sm'}
                      title={$t('entities.customer.title')}
                    >
                      <span class="flex min-w-0 items-center gap-2">
                        <Users class="size-3.5 opacity-80" />
                        <span class="truncate">{$t('entities.customer.title')}</span>
                      </span>
                    </Button>

                    <Button
                      href="/crm/pipeline"
                      variant={pipelineActive ? 'secondary' : 'ghost'}
                      class={pipelineActive
                        ? 'h-9 w-full justify-start px-3 text-sm bg-sky-100 hover:bg-sky-200/70 dark:bg-sky-950/45 dark:hover:bg-sky-950/55'
                        : 'h-9 w-full justify-start px-3 text-sm'}
                      title={$t('entities.crm.pipeline.nav')}
                    >
                      <span class="flex min-w-0 items-center gap-2">
                        <Kanban class="size-3.5 opacity-80" />
                        <span class="truncate">{$t('entities.crm.pipeline.nav')}</span>
                      </span>
                    </Button>
                  </div>
                {/if}
              {:else if href}
                <Button
                  variant={isActive ? 'secondary' : 'ghost'}
                  class={collapsed
                    ? 'h-10 w-full justify-center px-0'
                    : 'h-10 w-full justify-between px-3'}
                  disabled={!m.enabled}
                  title={m.name}
                  href={m.enabled ? href : undefined}
                >
                  <span class={collapsed ? '' : 'flex items-center gap-2'}>
                    <Icon class="size-4 opacity-80" />
                    {#if !collapsed}
                      <span class="truncate">{m.name}</span>
                    {/if}
                  </span>
                  {#if !collapsed && !m.enabled}
                    <Badge variant="outline" class="h-5 px-2 text-[10px]">{$t('common.soon')}</Badge>
                  {/if}
                </Button>
              {:else}
                <Button
                  type="button"
                  variant={isActive ? 'secondary' : 'ghost'}
                  class={collapsed
                    ? 'h-10 w-full justify-center px-0'
                    : 'h-10 w-full justify-between px-3'}
                  disabled={!m.enabled}
                  title={m.name}
                  onclick={() => {
                    if (m.enabled) selectedId = m.id;
                  }}
                >
                  <span class={collapsed ? '' : 'flex items-center gap-2'}>
                    <Icon class="size-4 opacity-80" />
                    {#if !collapsed}
                      <span class="truncate">{m.name}</span>
                    {/if}
                  </span>
                  {#if !collapsed && !m.enabled}
                    <Badge variant="outline" class="h-5 px-2 text-[10px]">{$t('common.soon')}</Badge>
                  {/if}
                </Button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </nav>

    <div class="px-3 pb-3 pt-2">
      <div class="flex flex-wrap items-center gap-2">
        <Sheet.Root bind:open={versionsOpen}>
          <Sheet.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class="inline-flex w-fit items-center justify-center rounded-full border border-muted-foreground/40 bg-background/45 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/90 hover:bg-background/65 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
                aria-label={$t('shell.health.versionsTitle')}
                title={$t('shell.health.versionsTitle')}
              >
                v{APP_VERSION}
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
                </div>
              </div>
            </div>
          </Sheet.Content>
        </Sheet.Root>

        <span
          class={`inline-flex w-fit items-center justify-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${healthChipClass}`}
          title={healthChipLabel}
        >
          {#if healthState === 'backend_offline'}
            <CloudOff class="size-3.5 opacity-90" />
          {:else if healthState === 'db_offline'}
            <Database class="size-3.5 opacity-90" />
          {:else}
            <Cloud class="size-3.5 opacity-90" />
          {/if}
          {#if !collapsed}
            <span>{healthChipLabel}</span>
          {/if}
        </span>
      </div>
    </div>
  </div>
</aside>
