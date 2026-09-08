<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import XIcon from '@lucide/svelte/icons/x';
  import Check from '@lucide/svelte/icons/check';

  interface $$Props {
    currentProtocol: string;
    allowedProtocols: string[];
    onProtocolChange: (protocol: string) => void;
  }

  let { currentProtocol, allowedProtocols, onProtocolChange }: $$Props = $props();

  function selectProtocol(protocol: string) {
    onProtocolChange(protocol);
    closeSheet();
  }
</script>

{#snippet headerTitle()}
  {$t('system.settings.config.protocolSelect.title')}
{/snippet}

{#snippet headerActions()}
  <Sheet.Close
    class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    title={$t('app.common.done')}
    onclick={() => closeSheet()}
  >
    <XIcon class="size-4" />
  </Sheet.Close>
{/snippet}

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <div class="min-h-0 flex-1 overflow-auto">
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
  </div>
</div>
