<script lang="ts">
  import { t } from '$lib/i18n';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { Button } from '$lib/components/ui/button';

  let {
    selectedCount,
    onBulkDelete,
  }: {
    selectedCount: number;
    onBulkDelete: () => void;
  } = $props();
</script>

{#if selectedCount > 0}
  <div
    class="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/5 p-3 mb-4"
    data-testid="config-bulk-action-bar"
  >
    <span class="text-sm font-medium">
      {selectedCount} {$t('system.settings.security.selected')}
    </span>
    <Button
      variant="destructive"
      size="sm"
      onclick={onBulkDelete}
      data-testid="config-bulk-delete-button"
    >
      <Trash2 class="size-4 mr-2" />
      {$t('system.settings.security.bulkDelete')}
    </Button>
  </div>
{/if}
