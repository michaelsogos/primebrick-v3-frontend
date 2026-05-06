<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import * as Sheet from '$lib/components/ui/sheet';
  import BrowserClientInfo from '$lib/components/BrowserClientInfo.svelte';
  import { APP_VERSION } from '$lib/version';
  import { backendState } from '$lib/backend-availability';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import XIcon from '@lucide/svelte/icons/x';

  const health = $derived(backendState.health);
  const healthOffline = $derived(backendState.offline);
</script>

{#snippet headerTitle()}
  {$t('shell.health.versionsTitle')}
{/snippet}

{#snippet headerActions()}
  <Sheet.Close
    class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    title={$t('common.done')}
    onclick={() => closeSheet()}
  >
    <XIcon class="size-4" />
  </Sheet.Close>
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
          {health?.version ? `v${health.version}` : '—'}
        </Badge>
      </div>

      <div>
        <div class="mb-2 text-xs font-medium text-primary">{$t('shell.health.modulesTitle')}</div>
        {#if health?.modules?.length}
          <div>
            {#each health.modules as m (m.id)}
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

