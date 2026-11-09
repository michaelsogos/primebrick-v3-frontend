<script lang="ts">
  import { Checkbox, checkboxVisualOnlyClass, DynamicIcon } from '@primebrick/ui';
  import { t } from '$lib/i18n';
  import { SheetPanelLayout } from '@primebrick/ui';
  import SheetHeaderAction from '$lib/shell/sheets/SheetHeaderAction.svelte';
  import { Search } from '@primebrick/ui/vendor/lucide';
  import { Eraser } from '@primebrick/ui/vendor/lucide';

  type ColumnLike = { key: string; label_key: string; icon?: string };

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
    {$t('system.entities.list.search_in')}
  {/snippet}
  {#snippet actions()}
    <SheetHeaderAction title={$t('app.common.reset')} onclick={() => onSearchInKeysChange(null)}>
      <Eraser class="size-4" />
    </SheetHeaderAction>
  {/snippet}

  <button
    type="button"
    class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
    onclick={() => onSearchInKeysChange(null)}
    data-testid="search-in-all"
  >
    <span class="pointer-events-none shrink-0" aria-hidden="true">
      <Checkbox checked={!searchInKeys || searchInKeys.length === 0} class={checkboxVisualOnlyClass} />
    </span>
    <span class="inline-flex size-3.5 shrink-0 items-center justify-center" aria-hidden="true"></span>
    <span class="min-w-0 flex-1 truncate">{$t('system.entities.list.search_in_all')}</span>
  </button>

  <div class="my-2">
    <div class="h-px bg-border"></div>
  </div>

  {#each searchableColumns as col (col.key)}
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
      onclick={() => toggleSearchKey(col.key)}
      data-testid="search-in-{col.key}"
    >
      <span class="pointer-events-none shrink-0" aria-hidden="true">
        <Checkbox checked={!!searchInKeys?.includes(col.key)} class={checkboxVisualOnlyClass} />
      </span>
      <span class="inline-flex size-3.5 shrink-0 items-center justify-center" aria-hidden="true">
        {#if col.icon}<DynamicIcon name={col.icon} size={14} class="opacity-70" />{/if}
      </span>
      <span class="min-w-0 flex-1 truncate">{$t(col.label_key)}</span>
    </button>
  {/each}
</SheetPanelLayout>
