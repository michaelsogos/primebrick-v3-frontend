<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils.js';
  import type { ViewName } from '$lib/entity-list/types';
  import { Table2, LayoutGrid, LayoutList } from 'lucide-svelte';

  let {
    viewMode,
    onViewModeChange
  }: {
    viewMode: ViewName;
    onViewModeChange: (mode: ViewName) => void;
  } = $props();
</script>

<div
  class="inline-flex rounded-md border border-input bg-sky-100/50 p-0.5 shadow-xs dark:border-input dark:bg-muted/20"
  role="group"
  aria-label={$t('entities.list.viewMode.groupAria')}
>
  <Button
    variant={viewMode === 'table' ? 'default' : 'ghost'}
    size="icon-sm"
    type="button"
    class={cn(
      'rounded-sm border border-transparent transition-colors hover:border-ring/50 dark:border-transparent dark:hover:border-ring/45',
      viewMode !== 'table' && 'hover:bg-sky-100 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
    )}
    aria-pressed={viewMode === 'table'}
    title={$t('entities.list.viewMode.table')}
    onclick={() => onViewModeChange('table')}
  >
    <Table2 class="size-4" />
  </Button>
  <Button
    variant={viewMode === 'cards' ? 'default' : 'ghost'}
    size="icon-sm"
    type="button"
    class={cn(
      'rounded-sm border border-transparent transition-colors hover:border-ring/50 dark:border-transparent dark:hover:border-ring/45',
      viewMode !== 'cards' && 'hover:bg-sky-100 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
    )}
    aria-pressed={viewMode === 'cards'}
    title={$t('entities.list.viewMode.cards')}
    onclick={() => onViewModeChange('cards')}
  >
    <LayoutGrid class="size-4" />
  </Button>
  <Button
    variant={viewMode === 'cards_list' ? 'default' : 'ghost'}
    size="icon-sm"
    type="button"
    class={cn(
      'rounded-sm border border-transparent transition-colors hover:border-ring/50 dark:border-transparent dark:hover:border-ring/45',
      viewMode !== 'cards_list' && 'hover:bg-sky-100 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
    )}
    aria-pressed={viewMode === 'cards_list'}
    title={$t('entities.list.viewMode.cardsList')}
    onclick={() => onViewModeChange('cards_list')}
  >
    <LayoutList class="size-4" />
  </Button>
</div>
