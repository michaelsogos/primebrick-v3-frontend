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
  import XIcon from '@lucide/svelte/icons/x';
  import Cloud from '@lucide/svelte/icons/cloud';
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import Database from '@lucide/svelte/icons/database';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';

  const healthOffline = $derived(backendState.offline);
  const healthChip = $derived(backendState.healthChip as HealthChip);
  const healthChipLabel = $derived(chipLabel(healthChip));
  const healthChipClass = $derived(chipClass(healthChip));
</script>

{#snippet headerTitle()}
  {$t('shell.health.versionsTitle')}
{/snippet}

{#snippet headerActions()}
  <div class="flex items-center gap-2">
    <Badge
      variant="outline"
      class={cn(
        'gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        healthChipClass
      )}
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

  <div class="min-h-0 flex-1 overflow-auto">
    <!-- Primo blocco: Shell, Backend, moduli -->
    <div class="px-2 space-y-3">
      <div class="flex items-center justify-between gap-3 text-sm">
        <div class="text-muted-foreground">{$t('shell.health.shellVersion')}</div>
        <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
          v{APP_VERSION}
        </Badge>
      </div>

      <div class="flex items-center justify-between gap-3 text-sm">
        <div class="text-muted-foreground">{$t('shell.health.backendVersion')}</div>
        <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
          {backendState.health?.version ? `v${backendState.health.version}` : '—'}
        </Badge>
      </div>

      <div class="flex items-center justify-between gap-3 text-sm">
        <div class="text-muted-foreground">{$t('shell.health.identityProvider')}</div>
        <div class="flex items-center gap-2">
          {#if backendState.health?.idp?.ok}
            <Badge variant="outline" class="font-mono text-[11px] font-medium">
              {backendState.health.idp.type || 'Casdoor'}
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

      <div>
        <div class="mb-2 text-xs font-medium text-primary">{$t('shell.health.modulesTitle')}</div>
        {#if backendState.health?.modules?.length}
          <div>
            {#each backendState.health.modules as m (m.id)}
              <div class="flex items-center justify-between gap-3 text-sm">
                <div class="truncate text-muted-foreground">{m.id}</div>
                <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                  v{m.version}
                </Badge>
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

    <!-- Secondo blocco: separatore -->
    <div class="py-2">
      <div class="h-px bg-border"></div>
    </div>

    <!-- Terzo blocco: Browser info -->
    <div class="px-2">
      <BrowserClientInfo />
    </div>
  </div>
</div>

