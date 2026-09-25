<script lang="ts">
  import { t } from '$lib/i18n';
  import { InputGroup, InputGroupAddon, InputGroupButton, HighlightedInput } from '$lib/components/ui/input-group';
  import { Checkbox, checkboxVisualOnlyClass } from '$lib/components/ui/checkbox';
  import { cn } from '$lib/utils.js';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import type { MetaColumn } from '$lib/entity-list/types';
  import Search from '@lucide/svelte/icons/search'
  import X from '@lucide/svelte/icons/x';

  let {
    search,
    onSearchInput,
    searchInKeys,
    searchableColumns,
    onSearchInKeysChange,
    toggleSearchKey
  }: {
    search: string;
    onSearchInput: (value: string) => void;
    searchInKeys: string[] | null;
    searchableColumns: MetaColumn[];
    onSearchInKeysChange: (keys: string[] | null) => void;
    toggleSearchKey: (key: string) => void;
  } = $props();

  const searchScopeLabel = $derived(() => {
    if (!searchInKeys || searchInKeys.length === 0) return $t('system.entities.list.searchInAll');
    const keys = searchInKeys;
    if (keys.length === 1) {
      const col = searchableColumns.find((c) => c.key === keys[0]);
      return col ? $t(col.label_key) : keys[0];
    }
    return `${keys.length} ${$t('system.entities.list.searchInFields')}`;
  });
</script>

<InputGroup
  class="
    group/input
    w-full
    border-foreground/25
    hover:border-foreground/40
    focus-within:border-foreground/50 focus-within:ring-2 focus-within:ring-foreground/20
    rounded-md transition-all duration-200
  "
>
  <InputGroupAddon
    align="inline-start"
    class="bg-transparent border-none pr-0"
  >
    <Search class="size-4 text-muted-foreground group-hover/input:text-sky-600 transition-colors" />
  </InputGroupAddon>

  <HighlightedInput
    class="text-sm placeholder:text-muted-foreground/70"
    value={search}
    oninput={(e: Event) => onSearchInput((e.currentTarget as HTMLInputElement).value)}
    placeholder={$t('system.entities.list.searchPlaceholder')}
  />

  {#if search.trim().length > 0}
    <InputGroupButton
      variant="ghost"
      size="icon-xs"
      class="hover:bg-sky-100/50 dark:hover:bg-white/10"
      onclick={() => onSearchInput('')}
      aria-label={$t('app.common.reset')}
      title={$t('app.common.reset')}
    >
      <X class="size-4" />
    </InputGroupButton>
  {/if}

  <InputGroupButton
    variant="ghost"
    size="xs"
    class="h-full rounded-l-none rounded-r-md border-l border-foreground/25 transition-colors"
    onclick={() =>
      openSheet(
        'entity.searchIn',
        {
          searchInKeys,
          searchableColumns,
          onSearchInKeysChange,
          toggleSearchKey,
          sheetMenuCheckboxClass: checkboxVisualOnlyClass
        } as any
      )}
  >
    {searchScopeLabel()}
  </InputGroupButton>
</InputGroup>
