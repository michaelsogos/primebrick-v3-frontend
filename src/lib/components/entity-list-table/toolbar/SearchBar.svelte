<script lang="ts">
  import { t } from '$lib/i18n';
  import { SearchInput } from '@primebrick/ui';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import type { MetaColumn } from '$lib/entity-list/types';

  let {
    search,
    onSearchInput,
    searchInKeys,
    searchableColumns,
    onSearchInKeysChange,
    toggleSearchKey,
    data_testid
  }: {
    search: string;
    onSearchInput: (value: string) => void;
    searchInKeys: string[] | null;
    searchableColumns: MetaColumn[];
    onSearchInKeysChange: (keys: string[] | null) => void;
    toggleSearchKey: (key: string) => void;
    data_testid?: string;
  } = $props();

  const searchScopeLabel = $derived(() => {
    if (!searchInKeys || searchInKeys.length === 0) return $t('system.entities.list.search_in_all');
    const keys = searchInKeys;
    if (keys.length === 1) {
      const col = searchableColumns.find((c) => c.key === keys[0]);
      return col ? $t(col.label_key) : keys[0];
    }
    return `${keys.length} ${$t('system.entities.list.search_in_fields')}`;
  });
</script>

<SearchInput
  highlight={true}
  data_testid={data_testid}
  value={search}
  oninput={(e) => onSearchInput((e.currentTarget as HTMLInputElement).value)}
  on_clear={() => onSearchInput('')}
  placeholder={$t('system.entities.list.search_placeholder')}
  trailing_button={{
    label: searchScopeLabel(),
    'data-testid': data_testid ? `${data_testid}-scope` : undefined,
    onclick: () =>
      openSheet('entity.searchIn', {
        searchInKeys,
        searchableColumns,
        onSearchInKeysChange,
        toggleSearchKey
      })
  }}
/>
