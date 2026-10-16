<script lang="ts">
  import { t } from '$lib/i18n';
  import { cn } from '$lib/utils.js';
  import { Button } from '$lib/components/ui/button';
  import { ButtonGroup } from '$lib/components/ui/button-group';
  import ListCheck from '@lucide/svelte/icons/list-check'
  import ListX from '@lucide/svelte/icons/list-x'
  import TextAlignJustify from '@lucide/svelte/icons/text-align-justify';

  let {
    deletionFilterMode,
    onDeletionFilterModeChange
  }: {
    deletionFilterMode: 'non_deleted' | 'deleted' | 'all';
    onDeletionFilterModeChange: (mode: 'non_deleted' | 'deleted' | 'all') => void;
  } = $props();

  const modes = [
    { key: 'non_deleted', icon: ListCheck, titleKey: 'system.entities.list.deletionFilter.nonDeleted' },
    { key: 'deleted', icon: ListX, titleKey: 'system.entities.list.deletionFilter.deleted' },
    { key: 'all', icon: TextAlignJustify, titleKey: 'system.entities.list.deletionFilter.all' },
  ] as const;
</script>

<ButtonGroup segmented aria-label={$t('system.entities.list.deletionFilter.groupAria')}>
  {#each modes as mode (mode.key)}
    {@const active = deletionFilterMode === mode.key}
    <Button
      variant="ghost"
      size="icon-sm"
      type="button"
      class={cn(active && 'bg-foreground/10 text-foreground shadow-xs')}
      aria-pressed={active}
      title={$t(mode.titleKey)}
      onclick={() => onDeletionFilterModeChange(mode.key)}
    >
      <mode.icon class="size-4" />
    </Button>
  {/each}
</ButtonGroup>
