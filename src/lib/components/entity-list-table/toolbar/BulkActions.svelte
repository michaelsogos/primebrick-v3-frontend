<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import Download from '@lucide/svelte/icons/download'
  import Copy from '@lucide/svelte/icons/copy';

  let {
    selectedCount,
    onBulkDelete,
    onBulkRestore,
    onBulkExport,
    onBulkDuplicate,
    rowActions
  }: {
    selectedCount: number;
    onBulkDelete: () => void;
    onBulkRestore: () => void;
    onBulkExport: () => void;
    onBulkDuplicate: () => void;
    rowActions: { duplicate?: boolean; delete?: boolean; export?: boolean };
  } = $props();
</script>

{#if selectedCount > 0}
  <div class="flex items-center gap-2">
    <span class="text-sm text-muted-foreground">
      {selectedCount} {selectedCount === 1 ? $t('entities.list.selectedSingular') : $t('entities.list.selectedPlural')}
    </span>

    {#if rowActions.delete}
      <Button
        variant="soft"
        size="sm"
        onclick={onBulkDelete}
      >
        <Trash2 class="size-4 mr-2" />
        {$t('entities.list.bulkDelete')}
      </Button>
    {/if}

    {#if rowActions.duplicate}
      <Button
        variant="soft"
        size="sm"
        onclick={onBulkDuplicate}
      >
        <Copy class="size-4 mr-2" />
        {$t('entities.list.bulkDuplicate')}
      </Button>
    {/if}

    {#if rowActions.export}
      <Button
        variant="soft"
        size="sm"
        onclick={onBulkExport}
      >
        <Download class="size-4 mr-2" />
        {$t('entities.list.bulkExport')}
      </Button>
    {/if}

    <Button
      variant="soft"
      size="sm"
      onclick={onBulkRestore}
    >
      <RotateCcw class="size-4 mr-2" />
      {$t('entities.list.bulkRestore')}
    </Button>
  </div>
{/if}
