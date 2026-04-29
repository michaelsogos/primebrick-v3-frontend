<script lang="ts">


  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as Sheet from '$lib/components/ui/sheet';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import XIcon from '@lucide/svelte/icons/x';
  import { RotateCcw } from 'lucide-svelte';

  interface Column {
    key: string;
    labelKey: string;
    hideable?: boolean;
  }

  interface $$Props {
    content: any;
    stickyColumns: Column[];
    visibleKeys: string[];
    toggleColumnKey: (key: string) => void;
  }

  let { content, stickyColumns, visibleKeys, toggleColumnKey }: $$Props = $props();

  const sheetMenuCheckboxClass = "h-4 w-4";
</script>

{#snippet headerActions()}
  <Button
    variant="ghost"
    size="icon-sm"
    class="text-muted-foreground opacity-70 hover:bg-accent hover:text-accent-foreground hover:opacity-100"
    onclick={() => {}}
    title={$t('common.reset')}
  >
    <RotateCcw class="size-4" />
  </Button>
  <Sheet.Close
    class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    title={$t('common.done')}
    onclick={() => closeSheet()}
  >
    <XIcon class="size-4" />
  </Sheet.Close>
{/snippet}

{#snippet headerTitle()}
    {$t('entities.list.filters')}
{/snippet}

<div class="h-full">
  <div class="flex h-full flex-col">
    <SheetHeader title={headerTitle} actions={headerActions} />
    <div class="flex-1 overflow-y-auto p-4">
      {@render children()}
    </div>
  </div>
</div>

{#snippet children()}
  {#each stickyColumns as col (col.key)}
      <button type="button" disabled={col.hideable === false} class="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed" onclick={() => toggleColumnKey(col.key)}>
        <span class="pointer-events-none shrink-0" aria-hidden="true">
          <Checkbox checked={visibleKeys.includes(col.key)} disabled={col.hideable === false} class={sheetMenuCheckboxClass} />
        </span>
        <span class="min-w-0 flex-1 truncate">{$t(col.labelKey)}</span>
      </button>
  {/each}
{/snippet}

