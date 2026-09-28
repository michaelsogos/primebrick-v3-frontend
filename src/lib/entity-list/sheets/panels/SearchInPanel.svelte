<script lang="ts">
  import { Checkbox, checkboxVisualOnlyClass } from '$lib/components/ui/checkbox';
  import * as Sheet from '$lib/components/ui/sheet';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';
  import SheetHeaderAction from '$lib/shell/sheets/SheetHeaderAction.svelte';
  import Search from '@lucide/svelte/icons/search';
  import XIcon from '@lucide/svelte/icons/x';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

  type ColumnLike = { key: string; label_key: string };

  interface Props {
    searchInKeys: string[] | null | undefined;
    searchableColumns: ColumnLike[];
    onSearchInKeysChange: (keys: string[] | null) => void;
    toggleSearchKey: (key: string) => void;
  }

  let { searchInKeys, searchableColumns, onSearchInKeysChange, toggleSearchKey }: Props =
    $props();
</script>

<SheetPanelLayout contentClass="p-0">
  {#snippet icon()}
    <Search class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('system.entities.list.searchIn')}
  {/snippet}
  {#snippet actions()}
    <SheetHeaderAction title={$t('app.common.reset')} onclick={() => onSearchInKeysChange(null)}>
      <RotateCcw class="size-4" />
    </SheetHeaderAction>
    <Sheet.Close
      class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
      title={$t('app.common.done')}
      onclick={() => closeSheet()}
    >
      <XIcon class="size-4" />
    </Sheet.Close>
  {/snippet}

  <button
    type="button"
    class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
    onclick={() => onSearchInKeysChange(null)}
  >
    <span class="pointer-events-none shrink-0" aria-hidden="true">
      <Checkbox checked={!searchInKeys || searchInKeys.length === 0} class={checkboxVisualOnlyClass} />
    </span>
    <span class="min-w-0 flex-1 truncate">{$t('system.entities.list.searchInAll')}</span>
  </button>

  <div class="my-2">
    <div class="h-px bg-border"></div>
  </div>

  {#each searchableColumns as col (col.key)}
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
      onclick={() => toggleSearchKey(col.key)}
    >
      <span class="pointer-events-none shrink-0" aria-hidden="true">
        <Checkbox checked={!!searchInKeys?.includes(col.key)} class={checkboxVisualOnlyClass} />
      </span>
      <span class="min-w-0 flex-1 truncate">{$t(col.label_key)}</span>
    </button>
  {/each}
</SheetPanelLayout>
