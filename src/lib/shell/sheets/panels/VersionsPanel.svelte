<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import * as Sheet from '$lib/components/ui/sheet';
  import BrowserClientInfo from '$lib/components/BrowserClientInfo.svelte';
  import { APP_VERSION } from '$lib/version';
  import { backendState } from '$lib/backend-availability';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import { chipLabel, chipClass, type HealthChip } from '$lib/composables/useHealthChip';
  import { cn } from '$lib/utils';
  import { servicesState, aggregateStatus, groupByCode } from '$lib/services-store.svelte';
  import XIcon from '@lucide/svelte/icons/x';
  import Cloud from '@lucide/svelte/icons/cloud';
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
  import Database from '@lucide/svelte/icons/database';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';

  const healthOffline = $derived(backendState.offline);
  const healthChip = $derived(backendState.healthChip as HealthChip);
  const healthChipLabel = $derived(chipLabel(healthChip));
  const healthChipClass = $derived(chipClass(healthChip));

  const groupedServices = $derived(groupByCode(servicesState.services));

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'online':
        return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
      case 'going_live':
        return 'border-yellow-500/25 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300';
      case 'offline':
        return 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300';
      case 'unknown':
        return 'border-border/60 bg-muted/30 text-muted-foreground';
      default:
        return 'border-border/60 bg-muted/30 text-muted-foreground';
    }
  }

  function statusDotClass(status: string): string {
    switch (status) {
      case 'online':
        return 'bg-emerald-500';
      case 'going_live':
        return 'bg-yellow-500';
      case 'offline':
        return 'bg-red-500';
      case 'unknown':
        return 'bg-neutral-400 dark:bg-neutral-500';
      default:
        return 'bg-neutral-400 dark:bg-neutral-500';
    }
  }
</script>

{#snippet headerTitle()}
  {$t('shell.health.versionsTitle')}
{/snippet}

{#snippet headerActions()}
  <div class="flex items-center gap-2">
    <Sheet.Close
      class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
      title={$t('common.done')}
      onclick={() => closeSheet()}
    >
      <XIcon class="size-4" />
    </Sheet.Close>
  </div>
{/snippet}

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <div class="min-h-0 flex-1 overflow-auto pb-4">
    <!-- Primo blocco: Shell, Backend, IDP -->
    <div class="px-4 py-3 space-y-3">
      <div class="flex items-center justify-between gap-3 text-sm">
        <div class="text-muted-foreground">{$t('shell.health.shellVersion')}</div>
        <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
          v{APP_VERSION}
        </Badge>
      </div>

      <div class="flex items-center justify-between gap-3 text-sm">
        <div class="text-muted-foreground">{$t('shell.health.backendVersion')}</div>
        <div class="flex items-center gap-2">
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
          <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
            {backendState.health?.version ? `v${backendState.health.version}` : '—'}
          </Badge>
        </div>
      </div>

      <div class="flex items-center justify-between gap-3 text-sm">
        <div class="text-muted-foreground">{$t('shell.health.identityProvider')}</div>
        <div class="flex items-center gap-2">
          {#if backendState.health?.idp?.ok}
            <Badge variant="outline" class="border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300 font-mono text-[11px] font-medium">
              {backendState.health.idp.type || 'Casdoor™'}
            </Badge>
            <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
              {backendState.health.idp.version || 'unknown'}
            </Badge>
          {:else}
            <Badge variant="outline" class="text-red-600 dark:text-red-400 font-mono text-[11px] font-medium">
              Offline
            </Badge>
          {/if}
        </div>
      </div>

      <div class="flex items-center justify-between gap-3 text-sm">
        <div class="text-muted-foreground">{$t('shell.health.redis')}</div>
        <div class="flex items-center gap-2">
          {#if backendState.health?.redis?.ok}
            <Badge variant="outline" class="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-medium">
              Online
            </Badge>
            <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
              {backendState.health.redis.version || 'unknown'}
            </Badge>
          {:else}
            <Badge variant="outline" class="text-red-600 dark:text-red-400 font-mono text-[11px] font-medium">
              Offline
            </Badge>
          {/if}
        </div>
      </div>
    </div>

    <!-- Microservices section -->
    <div class="px-4 py-3">
      <div class="mb-2 text-xs font-medium text-primary">{$t('shell.health.microservicesTitle')}</div>
      {#if servicesState.loading}
        <div class="text-xs text-muted-foreground">{$t('common.loading')}</div>
      {:else if groupedServices.size === 0}
        <div class="text-xs text-muted-foreground">{$t('shell.health.noMicroservices')}</div>
      {:else}
        <div class="space-y-3">
          {#each groupedServices as [code, instances] (code)}
            {@const isReserved = instances[0].is_reserved === true}
            {@const aggStatus = aggregateStatus(instances)}
            {@const behindScaler = instances[0].is_behind_scaler}
            {@const healthyCount = instances.filter((i) => i.status === 'online').length}
            {@const serviceName = instances[0].name}
            {@const displayName = serviceName || code}
            {@const serviceDescription = instances[0].description}
            {@const showCodeNote = serviceName && serviceName !== code}

            <!-- Group header -->
            <div class="flex items-center justify-between gap-3 text-sm">
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2">
                  <span class="truncate text-muted-foreground">{displayName}</span>
                  {#if showCodeNote}
                    <span class="shrink-0 font-mono text-[10px] text-muted-foreground/70">{code}</span>
                  {/if}
                </div>
                {#if serviceDescription}
                  <div class="truncate text-xs text-muted-foreground/60">{serviceDescription.length > 255 ? serviceDescription.slice(0, 255) + '…' : serviceDescription}</div>
                {/if}
              </div>
              <div class="flex shrink-0 items-center gap-2">
                {#if isReserved}
                  <!-- Reserved services (HOME/SETTINGS) are part of the BE shell — show BE health badge -->
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
                {#if instances[0].service_version}
                  <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                    v{instances[0].service_version}
                  </Badge>
                {/if}
                {#if !isReserved && !behindScaler}
                  <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                    {healthyCount}/{instances.length}
                  </Badge>
                {/if}
              </div>
            </div>

            <!-- Instance rows (only for non-reserved direct mode) -->
            {#if !isReserved && !behindScaler}
              <div class="ml-4 space-y-1">
                {#each instances as inst (inst.base_url)}
                  <div class="flex items-center justify-between gap-3 text-xs">
                    <div class="truncate text-muted-foreground">{inst.base_url}</div>
                    <div class={cn('size-2 rounded-full', statusDotClass(inst.status))}></div>
                  </div>
                {/each}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- Separatore -->
    <div class="py-2">
      <div class="h-px bg-border"></div>
    </div>

    <!-- Browser info -->
    <div class="px-4 py-3">
      <BrowserClientInfo />
    </div>
  </div>
</div>
