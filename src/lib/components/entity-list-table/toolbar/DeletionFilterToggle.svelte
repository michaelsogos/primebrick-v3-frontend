<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils.js';
  import { ListCheck, ListX, TextAlignJustify } from 'lucide-svelte';

  let {
    deletionFilterMode,
    onDeletionFilterModeChange
  }: {
    deletionFilterMode: 'non_deleted' | 'deleted' | 'all';
    onDeletionFilterModeChange: (mode: 'non_deleted' | 'deleted' | 'all') => void;
  } = $props();
</script>

<div
  class="inline-flex rounded-md border border-input bg-sky-100/50 p-0.5 shadow-xs dark:border-input dark:bg-muted/20"
  role="group"
  aria-label={$t('entities.list.deletionFilter.groupAria')}
>
  <Button
    variant={deletionFilterMode === 'non_deleted' ? 'default' : 'ghost'}
    size="icon-sm"
    type="button"
    class={cn(
      'rounded-sm border border-transparent transition-colors hover:border-ring/50 dark:border-transparent dark:hover:border-ring/45',
      deletionFilterMode !== 'non_deleted' && 'hover:bg-sky-100 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
    )}
    aria-pressed={deletionFilterMode === 'non_deleted'}
    title={$t('entities.list.deletionFilter.nonDeleted')}
    onclick={() => onDeletionFilterModeChange('non_deleted')}
  >
    <ListCheck class="size-4" />
  </Button>
  <Button
    variant={deletionFilterMode === 'deleted' ? 'default' : 'ghost'}
    size="icon-sm"
    type="button"
    class={cn(
      'rounded-sm border border-transparent transition-colors hover:border-ring/50 dark:border-transparent dark:hover:border-ring/45',
      deletionFilterMode !== 'deleted' && 'hover:bg-sky-100 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
    )}
    aria-pressed={deletionFilterMode === 'deleted'}
    title={$t('entities.list.deletionFilter.deleted')}
    onclick={() => onDeletionFilterModeChange('deleted')}
  >
    <ListX class="size-4" />
  </Button>
  <Button
    variant={deletionFilterMode === 'all' ? 'default' : 'ghost'}
    size="icon-sm"
    type="button"
    class={cn(
      'rounded-sm border border-transparent transition-colors hover:border-ring/50 dark:border-transparent dark:hover:border-ring/45',
      deletionFilterMode !== 'all' && 'hover:bg-sky-100 dark:hover:bg-accent/50 dark:hover:text-accent-foreground'
    )}
    aria-pressed={deletionFilterMode === 'all'}
    title={$t('entities.list.deletionFilter.all')}
    onclick={() => onDeletionFilterModeChange('all')}
  >
    <TextAlignJustify class="size-4" />
  </Button>
</div>
