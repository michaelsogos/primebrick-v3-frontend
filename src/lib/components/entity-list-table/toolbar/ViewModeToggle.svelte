<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils.js';
  import type { ViewName } from '$lib/entity-list/types';
  import Table2 from '@lucide/svelte/icons/table-2'
  import LayoutGrid from '@lucide/svelte/icons/layout-grid'
  import LayoutList from '@lucide/svelte/icons/layout-list';

  let {
    viewMode,
    onViewModeChange
  }: {
    viewMode: ViewName;
    onViewModeChange: (mode: ViewName) => void;
  } = $props();
</script>

<div
  class="inline-flex items-center gap-1 rounded-md border-primary-gradient-soft p-0.5 shadow-xs"
  role="group"
  aria-label={$t('system.entities.list.viewMode.groupAria')}
>
  <Button
    variant={viewMode === 'table' ? 'default' : 'ghost'}
    size="icon-sm"
    type="button"
    class={cn('rounded-sm', viewMode !== 'table' && 'hover-border-primary-gradient-soft hover:brightness-105')}
    aria-pressed={viewMode === 'table'}
    title={$t('system.entities.list.viewMode.table')}
    onclick={() => onViewModeChange('table')}
  >
    <Table2 class="size-4" />
  </Button>
  <Button
    variant={viewMode === 'cards' ? 'default' : 'ghost'}
    size="icon-sm"
    type="button"
    class={cn('rounded-sm', viewMode !== 'cards' && 'hover-border-primary-gradient-soft hover:brightness-105')}
    aria-pressed={viewMode === 'cards'}
    title={$t('system.entities.list.viewMode.cards')}
    onclick={() => onViewModeChange('cards')}
  >
    <LayoutGrid class="size-4" />
  </Button>
  <Button
    variant={viewMode === 'cards_list' ? 'default' : 'ghost'}
    size="icon-sm"
    type="button"
    class={cn('rounded-sm', viewMode !== 'cards_list' && 'hover-border-primary-gradient-soft hover:brightness-105')}
    aria-pressed={viewMode === 'cards_list'}
    title={$t('system.entities.list.viewMode.cardsList')}
    onclick={() => onViewModeChange('cards_list')}
  >
    <LayoutList class="size-4" />
  </Button>
</div>
