<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import EntityConfirmQuestion from './EntityConfirmQuestion.svelte';

  interface DeleteDialogProps {
    /**
     * Entity translation key (e.g. 'ai_model', 'customer'). The title is
     * auto-built as `app.common.deleteEntityTitle` + `system.entities.{entity}.singular`
     * — NEVER pass a custom title.
     */
    entity: string;
    /** Optional record name shown under the description (e.g. model.name). */
    recordName?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isDeleting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    entity,
    recordName,
    open = $bindable(),
    onOpenChange,
    isDeleting,
    onConfirm,
    onCancel
  }: DeleteDialogProps = $props();

  let entityName = $derived($t(`system.entities.${entity}.singular`));
</script>

<DialogBordered bind:open={open} severity="destructive" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>
      {$t('app.common.deleteEntityTitle', { entity: entityName })}
    </Dialog.Title>
    <Dialog.Description>
      <EntityConfirmQuestion action="delete" {entity} {recordName} />
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
