<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';

  interface BulkDeleteDialogProps {
    /**
     * Entity translation key (e.g. 'ai_model', 'customer'). The title is
     * auto-built as `app.common.deleteEntitiesTitle` + `system.entities.{entity}.plural`
     * — NEVER pass a custom title.
     */
    entity: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    isDeleting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    entity,
    open = $bindable(),
    onOpenChange,
    selectedCount,
    isDeleting,
    onConfirm,
    onCancel
  }: BulkDeleteDialogProps = $props();

  let entityPlural = $derived($t(`system.entities.${entity}.plural`));
</script>

<DialogBordered bind:open={open} severity="destructive" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>
      {$t('app.common.deleteEntitiesTitle', { entity: entityPlural })}
    </Dialog.Title>
    <Dialog.Description>
      {$t('app.common.deleteEntitiesConfirm', { count: selectedCount, entity: entityPlural })}
    </Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={onCancel}
      disabled={isDeleting}
    >
      {$t('app.common.cancel')}
    </Button>
    <Button
      variant="destructive"
      class="hover:scale-105 transition-all"
      onclick={onConfirm}
      disabled={isDeleting}
    >
      {#if isDeleting}
        {$t('app.common.deleting')}
      {:else}
        {$t('app.common.delete')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>
