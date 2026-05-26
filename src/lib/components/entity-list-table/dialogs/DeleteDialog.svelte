<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Trash2 } from 'lucide-svelte';

  let {
    open,
    count,
    onConfirm,
    onCancel,
    isDeleting
  }: {
    open: boolean;
    count: number;
    onConfirm: () => void;
    onCancel: () => void;
    isDeleting: boolean;
  } = $props();
</script>

<Dialog.Root bind:open={open}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header class="pb-4">
      <Dialog.Title>{$t('entities.list.bulkActions.deleteConfirmTitle')}</Dialog.Title>
      <Dialog.Description>
        {$t('entities.list.bulkActions.deleteConfirm')} {count} {$t('entities.list.bulkActions.items')}?
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer class="gap-2 sm:space-x-0">
      <Button
        variant="secondary-outline"
        class="hover:scale-105 transition-all"
        onclick={onCancel}
        disabled={isDeleting}
      >
        {$t('common.cancel')}
      </Button>
      <Button
        variant="destructive"
        class="hover:scale-105 transition-all"
        onclick={onConfirm}
        disabled={isDeleting}
      >
        {#if isDeleting}
          {$t('common.deleting')}
        {:else}
          <Trash2 class="size-4 mr-2" />
          {$t('common.delete')}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
