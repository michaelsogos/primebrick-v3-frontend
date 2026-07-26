<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';

  interface BulkRestoreDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    isRestoring: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open = $bindable(),
    onOpenChange,
    selectedCount,
    isRestoring,
    onConfirm,
    onCancel
  }: BulkRestoreDialogProps = $props();
</script>

<DialogBordered bind:open={open} severity="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('entities.list.bulkActions.restoreConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      Sei sicuro di voler ripristinare {selectedCount} elementi?
    </Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={onCancel}
      disabled={isRestoring}
    >
      {$t('common.cancel')}
    </Button>
    <Button
      variant="warning"
      class="hover:scale-105 transition-all"
      onclick={onConfirm}
      disabled={isRestoring}
    >
      {#if isRestoring}
        {$t('common.restoring')}
      {:else}
        {$t('common.restore')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>
