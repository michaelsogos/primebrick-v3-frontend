<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { Dialog } from '@primebrick/ui';
  import { BorderedDialog } from '@primebrick/ui';
  import EntityConfirmQuestion from './EntityConfirmQuestion.svelte';
  import { getEntitiesNsContext } from '../context';

  interface DeleteDialogProps {
    /**
     * Entity translation key (e.g. 'ai_model', 'customer'). The title is
     * auto-built as `app.common.deleteEntityTitle` + `<entities_ns>.entities.{entity}.singular`
     * — NEVER pass a custom title.
     */
    entity: string;
    /** Entity-label i18n namespace from `meta.entities_ns` — defaults to the table context / `system`. */
    entities_ns?: string;
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
    entities_ns,
    recordName,
    open = $bindable(),
    onOpenChange,
    isDeleting,
    onConfirm,
    onCancel
  }: DeleteDialogProps = $props();

  const ns = $derived(entities_ns ?? getEntitiesNsContext());
  let entityName = $derived($t(`${ns}.entities.${entity}.singular`));
</script>

<BorderedDialog bind:open={open} severity="destructive" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>
      {$t('app.common.deleteEntityTitle', { entity: entityName })}
    </Dialog.Title>
    <Dialog.Description>
      <EntityConfirmQuestion action="delete" {entity} entities_ns={ns} {recordName} />
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
</BorderedDialog>
