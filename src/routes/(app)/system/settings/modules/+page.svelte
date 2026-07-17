<script lang="ts">
  import { t } from '$lib/i18n';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Switch } from '$lib/components/ui/switch';
  import DynamicIcon from '$lib/components/ui/dynamic-icon/DynamicIcon.svelte';
  import Package from '@lucide/svelte/icons/package';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Settings from '@lucide/svelte/icons/settings';
  import Download from '@lucide/svelte/icons/download';
  import Store from '@lucide/svelte/icons/store';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Hourglass from '@lucide/svelte/icons/hourglass';
  import Cloud from '@lucide/svelte/icons/cloud';
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
  import Database from '@lucide/svelte/icons/database';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import Layers from '@lucide/svelte/icons/layers';
  import { pushNotification } from '$lib/errors/app-errors';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { fetchServices, toggleModule, deleteModule } from '$lib/api';
  import type { ServiceInfo } from '$lib/api-types';
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
  let isDeleting = $state(false);

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
        messageKey: 'shell.settings.modules.loadFailed',
        scope: $t('shell.settings.modules.title'),
        detail: error,
      });
    } finally {
      loading = false;
    }
  }

  function handleImportModule() {
    pushNotification({
      impact: 'MEDIUM',
      messageKey: 'shell.settings.modules.notImplemented',
      scope: $t('shell.settings.modules.importModule'),
    });
  }

  function handleOpenMarketplace() {
    pushNotification({
      impact: 'MEDIUM',
      messageKey: 'shell.settings.modules.notImplemented',
      scope: $t('shell.settings.modules.openMarketplace'),
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
          ? 'shell.settings.modules.moduleEnabled'
          : 'shell.settings.modules.moduleDisabled',
        scope: $t('shell.settings.modules.title'),
      });
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'shell.settings.modules.toggleFailed',
        scope: $t('shell.settings.modules.title'),
        detail: e instanceof Error ? e.message : undefined,
      });
    }
  }

  function openDeleteDialog(module: ServiceInfo) {
    deleteTarget = module;
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    isDeleting = true;
    try {
      await deleteModule(deleteTarget.code);
      services = services.filter((s) => s.code !== deleteTarget!.code);
      deleteDialogOpen = false;
      deleteTarget = null;
      pushNotification({
        impact: 'NONE',
        messageKey: 'shell.settings.modules.moduleDeleted',
        scope: $t('shell.settings.modules.title'),
      });
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'shell.settings.modules.deleteFailed',
        scope: $t('shell.settings.modules.title'),
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
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key)
          })
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.modules.title')}</h1>
    </div>
  {/snippet}

  <div class="flex-1 overflow-auto p-4">
    <div class="space-y-6">
          {#if loading}
            <div class="grid min-h-56 place-items-center p-3">
              <div class="relative flex flex-col items-center gap-2 text-center">
                <div class="pb-watermark-empty">
                  <Hourglass class="size-20 text-info" />
                </div>
                <div class="text-sm font-medium text-muted-foreground">
                  {$t('common.loading')}
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
                  {$t('shell.settings.modules.loadFailed')}
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
                  {$t('shell.settings.modules.noModules')}
                </div>
                <div class="text-xs text-muted-foreground">
                  {$t('shell.settings.modules.noModulesHint')}
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
                <div class="flex items-center justify-between rounded-lg border p-3">
                  <div class="flex items-center gap-3 min-w-0">
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
                        <p class="font-medium truncate">{module.name || module.code}</p>
                        {#if module.service_version}
                          <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                            v{module.service_version}
                          </Badge>
                        {/if}
                        {#if isReserved}
                          <Badge variant="outline" class="text-[11px] font-medium">
                            {$t('shell.settings.modules.reserved')}
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
                        {:else if aggStatus === 'unknown'}
                          <CircleQuestionMark class="size-3.5 opacity-90" />
                        {:else}
                          <CloudOff class="size-3.5 opacity-90" />
                        {/if}
                        <span>{$t(`shell.health.${aggStatus}`)}</span>
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
                      <Badge variant="outline" class="gap-1 text-[11px] font-medium" title={$t('shell.settings.modules.behindScaler')}>
                        <Layers class="size-3.5 opacity-90" />
                        <span>{$t('shell.settings.modules.behindScaler')}</span>
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
                        title={$t('shell.settings.modules.configure')}
                      >
                        <Settings class="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onclick={() => openDeleteDialog(module)}
                        title={$t('common.delete')}
                      >
                        <Trash2 class="size-4 text-destructive" />
                      </Button>
                    {/if}
                  </div>
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
            {$t('shell.settings.modules.importModule')}
          </Button>
          <Button variant="outline" onclick={handleOpenMarketplace}>
            <Store class="size-4" />
            {$t('shell.settings.modules.openMarketplace')}
          </Button>
        </div>
      </div>
</AppPageScaffold>

<DeleteDialog
  open={deleteDialogOpen}
  onOpenChange={(open) => { if (!open) { deleteDialogOpen = false; deleteTarget = null; } }}
  isDeleting={isDeleting}
  onConfirm={confirmDelete}
  onCancel={() => { deleteDialogOpen = false; deleteTarget = null; }}
/>
