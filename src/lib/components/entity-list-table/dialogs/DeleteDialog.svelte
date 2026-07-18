<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';

  interface DeleteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isDeleting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open = $bindable(),
    onOpenChange,
    isDeleting,
    onConfirm,
    onCancel
  }: DeleteDialogProps = $props();
</script>

<DialogBordered bind:open={open} color="destructive" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('common.deleteConfirmTitle')}</Dialog.Title>
    <Dialog.Description>{$t('common.deleteConfirm')}</Dialog.Description>
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
        {$t('common.delete')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>
