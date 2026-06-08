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
    searchPlaceholderKey,
    searchInKeys,
    searchableColumns,
    onSearchInKeysChange,
    toggleSearchKey
  }: {
    search: string;
    onSearchInput: (value: string) => void;
    searchPlaceholderKey?: string;
    searchInKeys: string[] | null;
    searchableColumns: MetaColumn[];
    onSearchInKeysChange: (keys: string[] | null) => void;
    toggleSearchKey: (key: string) => void;
  } = $props();

  const searchScopeLabel = $derived(() => {
    if (!searchInKeys || searchInKeys.length === 0) return $t('entities.list.searchInAll');
    const keys = searchInKeys;
    if (keys.length === 1) {
      const col = searchableColumns.find((c) => c.key === keys[0]);
      return col ? $t(col.labelKey) : keys[0];
    }
    return `${keys.length} ${$t('entities.list.searchInFields')}`;
  });
</script>

<InputGroup
  class="
    group/input
    w-full
    bg-sky-50/20 border border-input
    hover:bg-sky-50/45 hover:border-ring/40
    focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring
    dark:bg-input/40 dark:hover:bg-input/55
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
    placeholder={$t(searchPlaceholderKey ?? 'entities.list.searchPlaceholder')}
  />

  {#if search.trim().length > 0}
    <InputGroupButton
      variant="ghost"
      size="icon-xs"
      class="hover:bg-sky-100/50 dark:hover:bg-white/10"
      onclick={() => onSearchInput('')}
      aria-label={$t('common.reset')}
      title={$t('common.reset')}
    >
      <X class="size-4" />
    </InputGroupButton>
  {/if}

  <InputGroupButton
    variant="soft"
    size="xs"
    class="mr-1 bg-sky-100/50 hover:bg-sky-200/50 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
    onclick={() =>
      openSheet(
        'entity.searchIn',
        {
          searchInKeys,
          searchableColumns,
          onSearchInKeysChange,
          toggleSearchKey,
          sheetMenuCheckboxClass: checkboxVisualOnlyClass
        } as any,
        { contentClass: 'w-[360px] p-0' }
      )}
  >
    {searchScopeLabel()}
  </InputGroupButton>
</InputGroup>
