<script lang="ts">
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';
  import Link from '@lucide/svelte/icons/link';
  import Check from '@lucide/svelte/icons/check';

  interface Props {
    currentProtocol: string;
    allowedProtocols: string[];
    onProtocolChange: (protocol: string) => void;
  }

  let { currentProtocol, allowedProtocols, onProtocolChange }: Props = $props();

  function selectProtocol(protocol: string) {
    onProtocolChange(protocol);
    closeSheet();
  }
</script>

<SheetPanelLayout contentClass="p-0">
  {#snippet icon()}
    <Link class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('system.settings.config.protocolSelect.title')}
  {/snippet}

  {#each allowedProtocols as protocol (protocol)}
    <button
      type="button"
      class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
      onclick={() => selectProtocol(protocol)}
      data-testid={`protocol-select-item-${protocol}`}
    >
      <span class="min-w-0 flex-1 font-medium font-mono">{protocol}://</span>
      {#if protocol === currentProtocol}
        <Check class="size-4 text-primary shrink-0" />
      {/if}
    </button>
  {:else}
    <div class="px-3 py-8 text-center text-sm text-muted-foreground">
      {$t('system.settings.config.protocolSelect.noResults')}
    </div>
  {/each}
</SheetPanelLayout>
