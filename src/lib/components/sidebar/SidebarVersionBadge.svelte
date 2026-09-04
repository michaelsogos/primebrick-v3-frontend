<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { t } from '$lib/i18n';
  import { APP_VERSION } from '$lib/version';

  let { collapsed, isMobile }: { collapsed: boolean; isMobile: boolean } = $props();
</script>

{#if !collapsed || isMobile}
  <button
    type="button"
    class="inline-flex h-auto cursor-pointer rounded-md border-0 bg-transparent p-0 shadow-none ring-offset-background hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    aria-label={$t('app.health.versionsTitle')}
    title={$t('app.health.versionsTitle')}
    onclick={() => openSheet('shell.versions', {}, { contentClass: 'w-[420px] p-0' })}
  >
    <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
      v{APP_VERSION}
    </Badge>
  </button>
{/if}
