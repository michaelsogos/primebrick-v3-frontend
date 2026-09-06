<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';

  interface DuplicateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    duplicateScope: 'single' | 'selected';
    selectedCount: number;
    entity: string;
    isDuplicating: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open = $bindable(),
    onOpenChange,
    duplicateScope,
    selectedCount,
    entity,
    isDuplicating,
    onConfirm,
    onCancel
  }: DuplicateDialogProps = $props();
</script>

<DialogBordered bind:open={open} severity="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('app.common.duplicateConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      {#if duplicateScope === 'single'}
        {$t('app.common.duplicateConfirmSingle')}?
      {:else}
        {$t('app.common.duplicateConfirm')} {selectedCount} {$t(`system.entities.${entity}.plural`)}?
      {/if}
    </Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0 flex-col sm:flex-row">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={onCancel}
      disabled={isDuplicating}
    >
      {$t('app.common.cancel')}
    </Button>
    <Button
      variant="warning"
      class="hover:scale-105 transition-all flex-1 sm:flex-none"
      onclick={onConfirm}
      disabled={isDuplicating}
    >
      {#if isDuplicating}
        {$t('app.common.duplicating')}
      {:else}
        {$t('app.common.confirm')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>
