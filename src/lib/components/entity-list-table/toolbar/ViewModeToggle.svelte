<script lang="ts">
  import { t } from '$lib/i18n';
  import { cn } from '$lib/utils.js';
  import { Button } from '$lib/components/ui/button';
  import { ButtonGroup } from '$lib/components/ui/button-group';
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

  const modes = [
    { key: 'table', icon: Table2, titleKey: 'system.entities.list.viewMode.table' },
    { key: 'cards', icon: LayoutGrid, titleKey: 'system.entities.list.viewMode.cards' },
    { key: 'cards_list', icon: LayoutList, titleKey: 'system.entities.list.viewMode.cardsList' },
  ] as const;
</script>

<ButtonGroup segmented aria-label={$t('system.entities.list.viewMode.groupAria')}>
  {#each modes as mode (mode.key)}
    {@const active = viewMode === mode.key}
    <Button
      variant="ghost"
      size="icon-sm"
      type="button"
      class={cn(active && 'bg-foreground/10 text-foreground shadow-xs')}
      aria-pressed={active}
      title={$t(mode.titleKey)}
      onclick={() => onViewModeChange(mode.key)}
    >
      <mode.icon class="size-4" />
    </Button>
  {/each}
</ButtonGroup>
