<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import EntityConfirmQuestion from './EntityConfirmQuestion.svelte';
  import { getEntitiesNsContext } from '../context';

  interface RestoreDialogProps {
    /**
     * Entity translation key (e.g. 'ai_model', 'customer'). The title is
     * auto-built as `app.common.restoreEntityTitle` + `<entities_ns>.entities.{entity}.singular`
     * — NEVER pass a custom title.
     */
    entity: string;
    /** Entity-label i18n namespace from `meta.entities_ns` — defaults to the table context / `system`. */
    entities_ns?: string;
    /** Optional record name shown under the description. */
    recordName?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isRestoring: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    entity,
    entities_ns,
    recordName,
    open = $bindable(),
    onOpenChange,
    isRestoring,
    onConfirm,
    onCancel
  }: RestoreDialogProps = $props();

  const ns = $derived(entities_ns ?? getEntitiesNsContext());
  let entityName = $derived($t(`${ns}.entities.${entity}.singular`));
</script>

<DialogBordered bind:open={open} severity="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>
      {$t('app.common.restoreEntityTitle', { entity: entityName })}
    </Dialog.Title>
    <Dialog.Description>
      <EntityConfirmQuestion action="restore" {entity} entities_ns={ns} {recordName} />
    </Dialog.Description>
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
