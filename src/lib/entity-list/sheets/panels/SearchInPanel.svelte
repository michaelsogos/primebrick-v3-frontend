<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as Sheet from '$lib/components/ui/sheet';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import XIcon from '@lucide/svelte/icons/x';
  import { RotateCcw } from 'lucide-svelte';

  type ColumnLike = { key: string; labelKey: string };

  interface $$Props {
    searchInKeys: string[] | null | undefined;
    searchableColumns: ColumnLike[];
    onSearchInKeysChange: (keys: string[] | null) => void;
    toggleSearchKey: (key: string) => void;
    sheetMenuCheckboxClass: string;
  }

  let { searchInKeys, searchableColumns, onSearchInKeysChange, toggleSearchKey, sheetMenuCheckboxClass }: $$Props =
    $props();
</script>

{#snippet headerTitle()}
  {$t('entities.list.searchIn')}
{/snippet}

{#snippet headerActions()}
  <Button
    variant="ghost"
    size="icon-sm"
    class="text-muted-foreground opacity-70 hover:bg-accent hover:text-accent-foreground hover:opacity-100"
    onclick={() => onSearchInKeysChange(null)}
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

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <div class="min-h-0 flex-1 overflow-auto px-2 py-2">
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
      onclick={() => onSearchInKeysChange(null)}
    >
      <span class="pointer-events-none shrink-0" aria-hidden="true">
        <Checkbox checked={!searchInKeys || searchInKeys.length === 0} class={sheetMenuCheckboxClass} />
      </span>
      <span class="min-w-0 flex-1 truncate">{$t('entities.list.searchInAll')}</span>
    </button>

    <div class="my-2 px-2">
      <div class="h-px bg-border"></div>
    </div>

    {#each searchableColumns as col (col.key)}
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
        onclick={() => toggleSearchKey(col.key)}
      >
        <span class="pointer-events-none shrink-0" aria-hidden="true">
          <Checkbox checked={!!searchInKeys?.includes(col.key)} class={sheetMenuCheckboxClass} />
        </span>
        <span class="min-w-0 flex-1 truncate">{$t(col.labelKey)}</span>
      </button>
    {/each}
  </div>
</div>

