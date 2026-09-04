<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';

  interface RestoreDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isRestoring: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open = $bindable(),
    onOpenChange,
    isRestoring,
    onConfirm,
    onCancel
  }: RestoreDialogProps = $props();
</script>

<DialogBordered bind:open={open} severity="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('app.common.restoreConfirmTitle')}</Dialog.Title>
    <Dialog.Description>{$t('app.common.restoreConfirm')}</Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={onCancel}
      disabled={isRestoring}
    >
      {$t('app.common.cancel')}
    </Button>
    <Button
      variant="warning"
      class="hover:scale-105 transition-all"
      onclick={onConfirm}
      disabled={isRestoring}
    >
      {#if isRestoring}
        {$t('app.common.restoring')}
      {:else}
        {$t('app.common.restore')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>
