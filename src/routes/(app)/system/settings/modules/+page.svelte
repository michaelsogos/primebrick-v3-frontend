<script lang="ts">
  import { t } from '$lib/i18n';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { Button } from '@primebrick/ui';
  import { Badge } from '@primebrick/ui';
  import { Switch } from '@primebrick/ui';
  import { DynamicIcon } from '@primebrick/ui';
  import { Package } from '@primebrick/ui/vendor/lucide';
  import { Trash2 } from '@primebrick/ui/vendor/lucide';
  import { Settings } from '@primebrick/ui/vendor/lucide';
  import { Download } from '@primebrick/ui/vendor/lucide';
  import { Store } from '@primebrick/ui/vendor/lucide';
  import { TriangleAlert } from '@primebrick/ui/vendor/lucide';
  import { Hourglass } from '@primebrick/ui/vendor/lucide';
  import { Clock } from '@primebrick/ui/vendor/lucide';
  import { ChevronDown } from '@primebrick/ui/vendor/lucide';
  import { ChevronRight } from '@primebrick/ui/vendor/lucide';
  import { Cloud } from '@primebrick/ui/vendor/lucide';
  import { CloudOff } from '@primebrick/ui/vendor/lucide';
  import { AlertCircle } from '@primebrick/ui/vendor/lucide';
  import { CircleQuestionMark } from '@primebrick/ui/vendor/lucide';
  import { Database } from '@primebrick/ui/vendor/lucide';
  import { ShieldAlert } from '@primebrick/ui/vendor/lucide';
  import { Layers } from '@primebrick/ui/vendor/lucide';
  import { pushNotification } from '$lib/errors/app-errors';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { moduleBreadcrumbSegments } from '$lib/breadcrumb/module-breadcrumb';
  import { fetchServices, toggleModule, deleteModule, deleteServiceInstance } from '$lib/api';
  import type { ServiceInfo } from '$lib/api-types';
  import { resolveModuleLabel } from '$lib/shell/module-label';
  import DeleteDialog from '$lib/components/entity-list-table/dialogs/DeleteDialog.svelte';
  import { groupByCode, aggregateStatus } from '$lib/services-store.svelte';
  import { backendState } from '$lib/backend-availability';
  import { chipLabel, chipClass, type HealthChip } from '$lib/composables/useHealthChip';
  import { cn } from '$lib/utils';

  let services = $state<ServiceInfo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let deleteDialogOpen = $state(false);
  let deleteTarget = $state<ServiceInfo | null>(null);
  let deleteIsInstance = $state(false);
  let isDeleting = $state(false);
  let expanded = $state<Record<string, boolean>>({});

  const groupedServices = $derived(groupByCode(services));
  const healthChip = $derived(backendState.healthChip as HealthChip);
  const healthChipLabel = $derived(chipLabel(healthChip));
  const healthChipClass = $derived(chipClass(healthChip));

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'online':
        return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
      case 'going_live':
        return 'border-yellow-500/25 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300';
      case 'stale':
        return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300';
      case 'offline':
        return 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300';
      default:
        return 'border-border/60 bg-muted/30 text-muted-foreground';
    }
  }

  onMount(async () => {
    await loadServices();
  });

  async function loadServices() {
    loading = true;
    error = null;
    try {
      services = await fetchServices();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load modules';
      pushNotification({
        impact: 'HIGH',
        messageKey: 'system.settings.modules.loadFailed',
        scope: $t('system.settings.modules.title'),
        detail: error,
      });
    } finally {
      loading = false;
    }
  }

  function handleImportModule() {
    pushNotification({
      impact: 'MEDIUM',
      messageKey: 'system.settings.modules.notImplemented',
      scope: $t('system.settings.modules.importModule'),
    });
  }

  function handleOpenMarketplace() {
    pushNotification({
      impact: 'MEDIUM',
      messageKey: 'system.settings.modules.notImplemented',
      scope: $t('system.settings.modules.openMarketplace'),
    });
  }

  async function handleToggle(module: ServiceInfo) {
    try {
      const result = await toggleModule(module.code);
      services = services.map((s) =>
        s.code === module.code ? { ...s, is_enabled: result.is_enabled } : s,
      );
      pushNotification({
        impact: 'NONE',
        messageKey: result.is_enabled
          ? 'system.settings.modules.moduleEnabled'
          : 'system.settings.modules.moduleDisabled',
        scope: $t('system.settings.modules.title'),
      });
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'system.settings.modules.toggleFailed',
        scope: $t('system.settings.modules.title'),
        detail: e instanceof Error ? e.message : undefined,
      });
    }
  }

  function openDeleteDialog(module: ServiceInfo) {
    deleteTarget = module;
    deleteIsInstance = false;
    deleteDialogOpen = true;
  }

  function openInstanceDeleteDialog(instance: ServiceInfo) {
    deleteTarget = instance;
    deleteIsInstance = true;
    deleteDialogOpen = true;
  }

  function formatLastSeen(iso?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    isDeleting = true;
    try {
      if (deleteIsInstance) {
        await deleteServiceInstance(deleteTarget.uuid!);
        services = services.filter((s) => s.uuid !== deleteTarget!.uuid);
      } else {
        await deleteModule(deleteTarget.code);
        services = services.filter((s) => s.code !== deleteTarget!.code);
      }
      deleteDialogOpen = false;
      deleteTarget = null;
      pushNotification({
        impact: 'NONE',
        messageKey: 'system.settings.modules.moduleDeleted',
        scope: $t('system.settings.modules.title'),
      });
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'system.settings.modules.deleteFailed',
        scope: $t('system.settings.modules.title'),
        detail: e instanceof Error ? e.message : undefined,
      });
    } finally {
      isDeleting = false;
    }
  }

  function openConfigPage(module: ServiceInfo) {
    const url = `/system/settings/modules/${encodeURIComponent(module.code)}`;
    const childWindow = window.open(url, '_blank');
    if (childWindow) {
      childWindow.focus();
    }
  }
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          ...moduleBreadcrumbSegments({ pathname: page.url.pathname, t: (key) => $t(key) })
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('system.settings.modules.title')}</h1>
    </div>
  {/snippet}

  <div class="flex-1 overflow-auto p-4">
    <div class="space-y-6">
          {#if loading}
            <div class="grid min-h-56 place-items-center p-3">
              <div class="relative flex flex-col items-center gap-2 text-center">
                <div class="pb-watermark-loading">
                  <Hourglass class="size-20 text-info" />
                </div>
                <div class="text-sm font-medium text-muted-foreground">
                  {$t('app.common.loading')}
                </div>
              </div>
            </div>
          {:else if error}
            <div class="grid min-h-56 place-items-center p-3">
              <div class="relative flex flex-col items-center gap-2 text-center">
                <div class="pb-watermark-empty">
                  <TriangleAlert class="size-20 text-warning" />
                </div>
                <div class="text-sm font-medium text-muted-foreground">
                  {$t('system.settings.modules.loadFailed')}
                </div>
              </div>
            </div>
          {:else if services.length === 0}
            <div class="grid min-h-56 place-items-center p-3">
              <div class="relative flex flex-col items-center gap-2 text-center">
                <div class="pb-watermark-empty">
                  <TriangleAlert class="size-20 text-warning" />
                </div>
                <div class="text-sm font-medium text-muted-foreground">
                  {$t('system.settings.modules.noModules')}
                </div>
                <div class="text-xs text-muted-foreground">
                  {$t('system.settings.modules.noModulesHint')}
                </div>
              </div>
            </div>
          {:else}
            <div class="space-y-2">
              {#each groupedServices as [code, instances] (code)}
                {@const isReserved = instances[0].is_reserved === true}
                {@const aggStatus = aggregateStatus(instances)}
                {@const behindScaler = instances[0].is_behind_scaler}
                {@const healthyCount = instances.filter((i) => i.status === 'online').length}
                {@const module = instances[0]}
                <div class="rounded-lg border">
                <div class="flex items-center justify-between p-3">
                  <div class="flex items-center gap-3 min-w-0">
                    {#if !isReserved}
                      <Button
                        variant="ghost"
                        size="icon"
                        class="size-7 shrink-0"
                        onclick={() => { expanded[code] = !expanded[code]; }}
                        title={$t('system.settings.modules.instances')}
                      >
                        {#if expanded[code]}
                          <ChevronDown class="size-4" />
                        {:else}
                          <ChevronRight class="size-4" />
                        {/if}
                      </Button>
                    {/if}
                    {#if module.icon && module.icon_type === 'icon'}
                      <DynamicIcon name={module.icon} size={20} class="text-primary shrink-0" />
                    {:else if module.icon && module.icon_type === 'url'}
                      <img src={module.icon} alt={module.name || module.code} class="size-5 rounded shrink-0" />
                    {:else if module.icon && module.icon_type === 'base64'}
                      <img src="data:image/png;base64,{module.icon}" alt={module.name || module.code} class="size-5 rounded shrink-0" />
                    {:else if module.icon && module.icon_type === 'svg'}
                      <div class="size-5 shrink-0">{@html module.icon}</div>
                    {:else}
                      <Package class="size-5 text-muted-foreground shrink-0" />
                    {/if}

                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="font-medium truncate">{resolveModuleLabel(module, $t) || module.code}</p>
                        {#if module.service_version}
                          <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                            v{module.service_version}
                          </Badge>
                        {/if}
                        {#if isReserved}
                          <Badge variant="outline" class="text-[11px] font-medium">
                            {$t('system.settings.modules.reserved')}
                          </Badge>
                        {/if}
                      </div>
                      {#if module.description}
                        <p class="text-sm text-muted-foreground truncate">{module.description}</p>
                      {/if}
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <!-- Status badge -->
                    {#if isReserved}
                      <Badge
                        variant="outline"
                        class={cn('gap-1 font-mono text-[11px] font-medium', healthChipClass)}
                      >
                        {#if healthChip === 'backend_offline'}
                          <CloudOff class="size-3.5 opacity-90" />
                        {:else if healthChip === 'db_offline'}
                          <Database class="size-3.5 opacity-90" />
                        {:else if healthChip === 'idp_offline'}
                          <ShieldAlert class="size-3.5 opacity-90" />
                        {:else}
                          <Cloud class="size-3.5 opacity-90" />
                        {/if}
                        <span>{healthChipLabel}</span>
                      </Badge>
                    {:else}
                      <Badge
                        variant="outline"
                        class={cn('gap-1 font-mono text-[11px] font-medium', statusBadgeClass(aggStatus))}
                      >
                        {#if aggStatus === 'online'}
                          <Cloud class="size-3.5 opacity-90" />
                        {:else if aggStatus === 'going_live'}
                          <AlertCircle class="size-3.5 opacity-90" />
                        {:else if aggStatus === 'stale'}
                          <Clock class="size-3.5 opacity-90" />
                        {:else if aggStatus === 'unknown'}
                          <CircleQuestionMark class="size-3.5 opacity-90" />
                        {:else}
                          <CloudOff class="size-3.5 opacity-90" />
                        {/if}
                        <span>{$t(`app.health.${aggStatus}`)}</span>
                      </Badge>
                    {/if}

                    <!-- Instance count (non-reserved, non-scaler only) -->
                    {#if !isReserved && !behindScaler}
                      <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                        {healthyCount}/{instances.length}
                      </Badge>
                    {/if}

                    <!-- Scaler indicator -->
                    {#if !isReserved && behindScaler}
                      <Badge variant="outline" class="gap-1 text-[11px] font-medium" title={$t('system.settings.modules.behindScaler')}>
                        <Layers class="size-3.5 opacity-90" />
                        <span>{$t('system.settings.modules.behindScaler')}</span>
                      </Badge>
                    {/if}

                    {#if !isReserved}
                      <Switch
                        checked={module.is_enabled}
                        onCheckedChange={() => handleToggle(module)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onclick={() => openConfigPage(module)}
                        title={$t('system.settings.modules.configure')}
                      >
                        <Settings class="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onclick={() => openDeleteDialog(module)}
                        title={$t('app.common.delete')}
                      >
                        <Trash2 class="size-4 text-destructive" />
                      </Button>
                    {/if}
                  </div>
                </div>
                {#if expanded[code] && !isReserved}
                  <div class="border-t px-3 py-2">
                    {#each instances as instance (instance.uuid ?? instance.base_url)}
                      <div class="flex items-center justify-between gap-3 py-1.5">
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="font-mono text-xs text-muted-foreground truncate">
                            {instance.base_url}
                          </span>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          <span class="text-[11px] text-muted-foreground tabular-nums"
                            title={$t('system.settings.modules.lastSeen')}>
                            {formatLastSeen(instance.last_health_check_at)}
                          </span>
                          <Badge
                            variant="outline"
                            class={cn('font-mono text-[11px] font-medium', statusBadgeClass(instance.status))}
                          >
                            {$t(`app.health.${instance.status}`)}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            class="size-7"
                            onclick={() => openInstanceDeleteDialog(instance)}
                            title={$t('app.common.delete')}
                            disabled={!instance.uuid}
                          >
                            <Trash2 class="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Footer: action buttons (right-aligned, matching FormPageLayout pattern) -->
      <div class="bg-muted/50 shrink-0 border-t p-4">
        <div class="flex items-center justify-end gap-2">
          <Button variant="default" onclick={handleImportModule}>
            <Download class="size-4" />
            {$t('system.settings.modules.importModule')}
          </Button>
          <Button variant="outline" onclick={handleOpenMarketplace}>
            <Store class="size-4" />
            {$t('system.settings.modules.openMarketplace')}
          </Button>
        </div>
      </div>
</AppPageScaffold>

<DeleteDialog
  entity="service_registry"
  recordName={deleteIsInstance ? deleteTarget?.base_url : deleteTarget?.code}
  open={deleteDialogOpen}
  onOpenChange={(open) => { if (!open) { deleteDialogOpen = false; deleteTarget = null; } }}
  isDeleting={isDeleting}
  onConfirm={confirmDelete}
  onCancel={() => { deleteDialogOpen = false; deleteTarget = null; }}
/>
