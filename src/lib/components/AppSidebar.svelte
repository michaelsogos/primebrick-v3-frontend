<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { t } from '$lib/i18n';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { ChevronDown, ChevronRight, Kanban, LayoutGrid, Package, Receipt, Users } from 'lucide-svelte';

  let { collapsed = false, onRequestExpand }: { collapsed?: boolean; onRequestExpand?: () => void } = $props();

  let selectedId = $state<string | null>(null);
  let crmOpen = $state(false);

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

  $effect(() => {
    if (shellNav.loading) return;
    if (navLoadFailed) return;
    const first = shellNav.modules.find((m) => m.enabled) ?? shellNav.modules[0];
    selectedId = first?.id ?? null;
    crmOpen = customersActive || pipelineActive;
  });
</script>

<aside
  class="relative h-full bg-[hsl(var(--sidebar-chrome))] text-[hsl(var(--sidebar-chrome-foreground))] shadow-sm transition-[width] duration-200 ease-out after:pointer-events-none after:absolute after:right-0 after:top-[calc(3.5rem+1px)] after:bottom-0 after:w-px after:bg-border/40"
  aria-label={$t('shell.nav.aria')}
  style={`width: ${collapsed ? '72px' : '280px'}`}
>
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

  <nav class="p-2">
    {#if shellNav.loading}
      <div class="px-2 py-1 text-xs text-muted-foreground">{$t('common.loading')}</div>
    {:else if navLoadFailed}
      <div
        class="rounded-md border border-destructive/25 bg-destructive/10 px-2 py-3 text-xs text-destructive"
        role="alert"
      >
        <div class="font-medium leading-snug">{$t('shell.modulesLoadFailed')}</div>
      </div>
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
</aside>
