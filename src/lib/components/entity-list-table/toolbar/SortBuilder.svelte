<script lang="ts">
  /**
   * SortBuilder — the canonical two-dropdown sort anatomy of the card
   * sub-toolbars ("Sort by <col>▾" + direction ▾), extracted so the same
   * control can ride the shared FILTER | BULK bar in card/card_list views.
   * Always rendered when a `sort` contract is handed in — even a single
   * sortable column is meaningful (hidden columns stay sortable and every
   * page declares a meta default_sort).
   */
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { ArrowUpNarrowWide, ArrowDownWideNarrow } from '@primebrick/ui/vendor/lucide';
  import type { MetaColumn, SortDir } from '$lib/entity-list/types';

  let {
    allColumns,
    sortableColumns,
    sortKey,
    sortDir,
    onSortChange,
    test_id,
  }: {
    allColumns: MetaColumn[];
    sortableColumns: MetaColumn[];
    sortKey: string | null;
    sortDir: SortDir;
    onSortChange: (key: string | null, dir: SortDir) => void;
    test_id?: string;
  } = $props();

  const currentLabel = $derived(allColumns.find((c) => c.key === sortKey)?.label_key);
</script>

<span class="text-xs font-medium text-muted-foreground">{$t('system.entities.list.sort_by')}</span>
<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button variant="ghost" size="xs" {...props} class="max-w-[220px] truncate" data-testid={test_id}>
        {$t(currentLabel ?? '')}
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start">
    {#each sortableColumns as col (col.key)}
      <DropdownMenu.Item
        class={dropdownMenuSelectedItemClass(sortKey === col.key)}
        onSelect={() => onSortChange(col.key, sortKey === col.key ? sortDir : 'asc')}
      >
        {$t(col.label_key)}
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>

<span class="ml-1 text-xs font-medium text-muted-foreground">{$t('system.entities.list.in_order')}</span>
<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button variant="ghost" size="xs" {...props} disabled={!sortKey} data-testid={test_id ? `${test_id}-dir` : undefined}>
        {#if sortDir === 'asc'}
          <ArrowUpNarrowWide class="size-4" />
        {:else}
          <ArrowDownWideNarrow class="size-4" />
        {/if}
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start">
    <DropdownMenu.Item
      class={dropdownMenuSelectedItemClass(sortDir === 'asc')}
      onSelect={() => sortKey && onSortChange(sortKey, 'asc')}
    >
      <span class="inline-flex items-center gap-2">
        <ArrowUpNarrowWide class="size-4" />
        {$t('system.entities.list.ascending')}
      </span>
    </DropdownMenu.Item>
    <DropdownMenu.Item
      class={dropdownMenuSelectedItemClass(sortDir === 'desc')}
      onSelect={() => sortKey && onSortChange(sortKey, 'desc')}
    >
      <span class="inline-flex items-center gap-2">
        <ArrowDownWideNarrow class="size-4" />
        {$t('system.entities.list.descending')}
      </span>
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
