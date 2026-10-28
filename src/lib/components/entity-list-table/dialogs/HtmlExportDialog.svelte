<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { Dialog } from '@primebrick/ui';
  import { BorderedDialog } from '@primebrick/ui';
  import { getEntitiesNsContext } from '../context';

  interface HtmlExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    totalCount: bigint;
    entity: string;
    /** Entity-label i18n namespace from `meta.entities_ns` — defaults to the table context / `system`. */
    entities_ns?: string;
    isExporting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open = $bindable(),
    onOpenChange,
    selectedCount,
    totalCount,
    entity,
    entities_ns,
    isExporting,
    onConfirm,
    onCancel
  }: HtmlExportDialogProps = $props();

  const ns = $derived(entities_ns ?? getEntitiesNsContext());
</script>

<BorderedDialog bind:open={open} {onOpenChange} severity="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('app.common.exportHtmlConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      {#if selectedCount > 0}
        {$t('app.common.exportHtmlConfirm')} {selectedCount} {$t(`${ns}.entities.${entity}.plural`)}?
      {:else}
        {$t('app.common.exportHtmlConfirm')} {totalCount} {$t(`${ns}.entities.${entity}.plural`)}?
      {/if}
    </Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0 flex-col sm:flex-row">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={onCancel}
      disabled={isExporting}
    >
      {$t('app.common.cancel')}
    </Button>
    <Button
      variant="warning"
      class="hover:scale-105 transition-all flex-1 sm:flex-none"
      onclick={onConfirm}
      disabled={isExporting}
    >
      {#if isExporting}
        {$t('app.common.exporting')}
      {:else}
        {$t('app.common.confirm')}
      {/if}
    </Button>
  </Dialog.Footer>
</BorderedDialog>
