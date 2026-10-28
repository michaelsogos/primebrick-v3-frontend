<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { Dialog } from '@primebrick/ui';
  import { BorderedDialog } from '@primebrick/ui';
  import { getEntitiesNsContext } from '../context';

  interface BulkDeleteDialogProps {
    /**
     * Entity translation key (e.g. 'ai_model', 'customer'). The title is
     * auto-built as `app.common.deleteEntitiesTitle` + `<entities_ns>.entities.{entity}.plural`
     * — NEVER pass a custom title.
     */
    entity: string;
    /** Entity-label i18n namespace from `meta.entities_ns` — defaults to the table context / `system`. */
    entities_ns?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    isDeleting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    entity,
    entities_ns,
    open = $bindable(),
    onOpenChange,
    selectedCount,
    isDeleting,
    onConfirm,
    onCancel
  }: BulkDeleteDialogProps = $props();

  const ns = $derived(entities_ns ?? getEntitiesNsContext());
  let entityPlural = $derived($t(`${ns}.entities.${entity}.plural`));
</script>

<BorderedDialog bind:open={open} {onOpenChange} severity="destructive" class="sm:max-w-md" showCloseButton={false}>
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
</BorderedDialog>
