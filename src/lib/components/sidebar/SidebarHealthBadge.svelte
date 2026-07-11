<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { useHealthChip, chipLabel, chipClass, type HealthChip } from '$lib/composables/useHealthChip';
  import { t } from '$lib/i18n';
  import Cloud from '@lucide/svelte/icons/cloud';
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import Database from '@lucide/svelte/icons/database';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';

  let { collapsed }: { collapsed: boolean } = $props();

  const { backendState, APP_VERSION } = useHealthChip();

  // Component-level $derived — reactive because declared in component, not in composable
  const healthChip = $derived(backendState.healthChip as HealthChip);
  const healthChipLabel = $derived(chipLabel(healthChip));
  const healthChipClass = $derived(chipClass(healthChip));
</script>

<button
  type="button"
  class="inline-flex h-auto cursor-pointer rounded-full border-0 bg-transparent p-0 shadow-none ring-offset-background hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  aria-label={$t('shell.health.versionsTitle')}
  onclick={(e) => { e.preventDefault(); e.stopPropagation(); openSheet('shell.versions', {}, { contentClass: 'w-[420px] p-0' }); }}
>
  <Badge
    variant="outline"
    class={cn(
      'w-fit gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
      'group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:min-h-8! group-data-[collapsible=icon]:min-w-8! group-data-[collapsible=icon]:shrink-0 group-data-[collapsible=icon]:rounded-md! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 [&>svg]:group-data-[collapsible=icon]:size-4!',
      healthChipClass
    )}
  >
    {#if healthChip === 'backend_offline'}
      <CloudOff class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
    {:else if healthChip === 'db_offline'}
      <Database class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
    {:else if healthChip === 'idp_offline'}
      <ShieldAlert class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
    {:else}
      <Cloud class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
    {/if}
    {#if !collapsed}
      <span>{healthChipLabel}</span>
    {/if}
  </Badge>
</button>
