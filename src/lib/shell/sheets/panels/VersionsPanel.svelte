<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import * as Sheet from '$lib/components/ui/sheet';
  import * as Accordion from '$lib/components/ui/accordion/index.js';
  import DynamicIcon from '$lib/components/ui/dynamic-icon/DynamicIcon.svelte';
  import BrowserClientInfo from '$lib/components/BrowserClientInfo.svelte';
  import { APP_VERSION } from '$lib/version';
  import { backendState } from '$lib/backend-availability';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import { chipLabel, chipClass, type HealthChip } from '$lib/composables/useHealthChip';
  import { cn } from '$lib/utils';
  import { servicesState, aggregateStatus, groupByCode } from '$lib/services-store.svelte';
  import type { ServiceInfo } from '$lib/api-types';
  import XIcon from '@lucide/svelte/icons/x';
  import Cloud from '@lucide/svelte/icons/cloud';
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
  import Database from '@lucide/svelte/icons/database';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import Package from '@lucide/svelte/icons/package';
  import PanelsTopLeft from '@lucide/svelte/icons/panels-top-left';
  import Server from '@lucide/svelte/icons/server';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import DatabaseZap from '@lucide/svelte/icons/database-zap';
  import Radio from '@lucide/svelte/icons/radio';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';

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
  {$t('app.health.versionsTitle')}
{/snippet}

{#snippet headerActions()}
  <div class="flex items-center gap-2">
    <Sheet.Close
      class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
      title={$t('app.common.done')}
      onclick={() => closeSheet()}
    >
      <XIcon class="size-4" />
    </Sheet.Close>
  </div>
{/snippet}

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <div class="min-h-0 flex-1 overflow-auto px-4 pb-4">
    <Accordion.Root type="multiple" class="w-full" value={['core']}>

      <!-- 1. Core Modules -->
      <Accordion.Item value="core" data-testid="versions-accordion-core">
        <Accordion.Trigger>{$t('app.health.coreModulesTitle')}</Accordion.Trigger>
        <Accordion.Content class="py-3">
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3 text-sm">
              <div class="flex items-center gap-2 text-muted-foreground">
                <PanelsTopLeft class="size-4 shrink-0 text-primary" />
                <span>{$t('app.health.shellVersion')}</span>
              </div>
              <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                v{APP_VERSION}
              </Badge>
            </div>

            <div class="flex items-center justify-between gap-3 text-sm">
              <div class="flex items-center gap-2 text-muted-foreground">
                <Server class="size-4 shrink-0 text-primary" />
                <span>{$t('app.health.backendVersion')}</span>
              </div>
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
              <div class="flex items-center gap-2 text-muted-foreground">
                <KeyRound class="size-4 shrink-0 text-primary" />
                <span>{$t('app.health.identityProvider')}</span>
              </div>
              <div class="flex items-center gap-2">
                {#if backendState.health?.checks?.idp?.ok}
                  <Badge variant="outline" class="border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300 font-mono text-[11px] font-medium">
                    {backendState.health.checks.idp.type || 'Casdoor™'}
                  </Badge>
                  <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                    {backendState.health.checks.idp.version || 'unknown'}
                  </Badge>
                {:else}
                  <Badge variant="outline" class="text-red-600 dark:text-red-400 font-mono text-[11px] font-medium">
                    Offline
                  </Badge>
                {/if}
              </div>
            </div>

            <div class="flex items-center justify-between gap-3 text-sm">
              <div class="flex items-center gap-2 text-muted-foreground">
                <DatabaseZap class="size-4 shrink-0 text-primary" />
                <span>{$t('app.health.redis')}</span>
              </div>
              <div class="flex items-center gap-2">
                {#if backendState.health?.checks?.redis?.ok}
                  <Badge variant="outline" class="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-medium">
                    Online
                  </Badge>
                  <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                    {backendState.health.checks.redis.version || 'unknown'}
                  </Badge>
                {:else}
                  <Badge variant="outline" class="text-red-600 dark:text-red-400 font-mono text-[11px] font-medium">
                    Offline
                  </Badge>
                {/if}
              </div>
            </div>

            <div class="flex items-center justify-between gap-3 text-sm">
              <div class="flex items-center gap-2 text-muted-foreground">
                <Radio class="size-4 shrink-0 text-primary" />
                <span>{$t('app.health.nats')}</span>
              </div>
              <div class="flex items-center gap-2">
                {#if backendState.health?.checks?.nats?.ok}
                  <Badge variant="outline" class="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-medium">
                    Online
                  </Badge>
                  <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                    {backendState.health.checks.nats.version || 'unknown'}
                  </Badge>
                {:else}
                  <Badge variant="outline" class="text-red-600 dark:text-red-400 font-mono text-[11px] font-medium">
                    Offline
                  </Badge>
                {/if}
              </div>
            </div>

            <!-- AI LLM — optional infra, does not affect overall health badge -->
            <div class="flex items-center justify-between gap-3 text-sm">
              <div class="flex items-center gap-2 text-muted-foreground">
                <BrainCircuit class="size-4 shrink-0 text-primary" />
                <span>{$t('app.health.aiLlm')}</span>
              </div>
              <div class="flex items-center gap-2">
                {#if backendState.health?.checks?.llm?.ok}
                  <Badge variant="outline" class="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-medium">
                    Online
                  </Badge>
                  {#if backendState.health.checks.llm.model}
                    <Badge variant="outline" class="font-mono text-[11px] font-medium" title={$t('app.health.aiLlm')}>
                      {backendState.health.checks.llm.model}
                    </Badge>
                  {/if}
                  {#if backendState.health.checks.llm.version}
                    <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                      {backendState.health.checks.llm.version}
                    </Badge>
                  {/if}
                {:else}
                  <Badge variant="outline" class="text-red-600 dark:text-red-400 font-mono text-[11px] font-medium">
                    Offline
                  </Badge>
                {/if}
              </div>
            </div>
          </div>
        </Accordion.Content>
      </Accordion.Item>

      <!-- 2. Installed Modules -->
      <Accordion.Item value="installed" data-testid="versions-accordion-installed">
        <Accordion.Trigger>{$t('app.health.installedModulesTitle')}</Accordion.Trigger>
        <Accordion.Content class="py-3">
          {#if servicesState.loading}
            <div class="text-xs text-muted-foreground">{$t('app.common.loading')}</div>
          {:else if groupedServices.size === 0}
            <div class="text-xs text-muted-foreground">{$t('app.health.noMicroservices')}</div>
          {:else}
            <div class="space-y-2">
              {#each groupedServices as [code, instances] (code)}
                {@const isReserved = instances[0].is_reserved === true}
                {@const aggStatus = aggregateStatus(instances)}
                {@const healthyCount = instances.filter((i) => i.status === 'online').length}
                {@const module = instances[0] as ServiceInfo}
                {@const displayName = module.name || code}
                {@const showCodeNote = module.name && module.name !== code}
                {@const beStatus = backendState.offline ? 'offline' : 'online'}
                <div class="space-y-2 rounded-lg border-primary-gradient p-3">
                  <!-- Line 1: icon + name (left) | status badge + count/reserved badge (right) -->
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex min-w-0 items-center gap-2">
                      {#if module.icon && module.icon_type === 'icon'}
                        <DynamicIcon name={module.icon} size={18} class="shrink-0 text-primary" />
                      {:else if module.icon && module.icon_type === 'url'}
                        <img src={module.icon} alt={displayName} class="size-[18px] shrink-0 rounded" />
                      {:else if module.icon && module.icon_type === 'base64'}
                        <img src="data:image/png;base64,{module.icon}" alt={displayName} class="size-[18px] shrink-0 rounded" />
                      {:else if module.icon && module.icon_type === 'svg'}
                        <div class="size-[18px] shrink-0">{@html module.icon}</div>
                      {:else}
                        <Package class="size-[18px] shrink-0 text-muted-foreground" />
                      {/if}
                      <span class="truncate text-sm font-medium">{displayName}</span>
                      {#if showCodeNote}
                        <span class="shrink-0 font-mono text-[10px] text-muted-foreground/70">{code}</span>
                      {/if}
                    </div>

                    <div class="flex shrink-0 items-center gap-1.5">
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

                      <!-- Second badge: instances count (non-reserved) or Reserved (reserved) -->
                      {#if isReserved}
                        <Badge variant="outline" class="text-[11px] font-medium">
                          {$t('system.settings.modules.reserved')}
                        </Badge>
                      {:else}
                        <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                          {healthyCount}/{instances.length}
                        </Badge>
                      {/if}
                    </div>
                  </div>

                  <!-- Line 2: description (full width) -->
                  {#if module.description}
                    <p class="truncate text-xs text-muted-foreground">
                      {module.description.length > 255 ? module.description.slice(0, 255) + '…' : module.description}
                    </p>
                  {/if}

                  <!-- Line 3: instances list (left) + status dot (right) -->
                  <div class="space-y-1">
                    {#if isReserved}
                      <div class="flex items-center justify-between gap-3 text-xs">
                        <div class="truncate text-muted-foreground">{$t('app.health.backendVersion')}</div>
                        <div class={cn('size-2 rounded-full', statusDotClass(beStatus))}></div>
                      </div>
                    {:else}
                      {#each instances as inst (inst.base_url)}
                        <div class="flex items-center justify-between gap-3 text-xs">
                          <div class="truncate text-muted-foreground">{inst.base_url}</div>
                          <div class={cn('size-2 rounded-full', statusDotClass(inst.status))}></div>
                        </div>
                      {/each}
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </Accordion.Content>
      </Accordion.Item>

      <!-- 3. System Info -->
      <Accordion.Item value="system" data-testid="versions-accordion-system">
        <Accordion.Trigger>{$t('app.health.systemInfoTitle')}</Accordion.Trigger>
        <Accordion.Content class="py-3">
          <BrowserClientInfo />
        </Accordion.Content>
      </Accordion.Item>

    </Accordion.Root>
  </div>
</div>
