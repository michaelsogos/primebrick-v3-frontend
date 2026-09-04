<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils.js';
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
</script>

<div
  class="inline-flex items-center gap-1 rounded-md border-primary-gradient-soft p-0.5 shadow-xs"
  role="group"
  aria-label={$t('system.entities.list.deletionFilter.groupAria')}
>
  <Button
    variant={deletionFilterMode === 'non_deleted' ? 'default' : 'ghost'}
    size="icon-sm"
    type="button"
    class={cn('rounded-sm', deletionFilterMode !== 'non_deleted' && 'hover-border-primary-gradient-soft hover:brightness-105')}
    aria-pressed={deletionFilterMode === 'non_deleted'}
    title={$t('system.entities.list.deletionFilter.nonDeleted')}
    onclick={() => onDeletionFilterModeChange('non_deleted')}
  >
    <ListCheck class="size-4" />
  </Button>
  <Button
    variant={deletionFilterMode === 'deleted' ? 'default' : 'ghost'}
    size="icon-sm"
    type="button"
    class={cn('rounded-sm', deletionFilterMode !== 'deleted' && 'hover-border-primary-gradient-soft hover:brightness-105')}
    aria-pressed={deletionFilterMode === 'deleted'}
    title={$t('system.entities.list.deletionFilter.deleted')}
    onclick={() => onDeletionFilterModeChange('deleted')}
  >
    <ListX class="size-4" />
  </Button>
  <Button
    variant={deletionFilterMode === 'all' ? 'default' : 'ghost'}
    size="icon-sm"
    type="button"
    class={cn('rounded-sm', deletionFilterMode !== 'all' && 'hover-border-primary-gradient-soft hover:brightness-105')}
    aria-pressed={deletionFilterMode === 'all'}
    title={$t('system.entities.list.deletionFilter.all')}
    onclick={() => onDeletionFilterModeChange('all')}
  >
    <TextAlignJustify class="size-4" />
  </Button>
</div>
