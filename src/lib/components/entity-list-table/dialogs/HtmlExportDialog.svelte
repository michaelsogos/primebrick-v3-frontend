<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import Choicebox from '$lib/components/ui/choicebox/choicebox.svelte';
  import ChoiceboxItem from '$lib/components/ui/choicebox/choicebox-item.svelte';
  import ChoiceboxTitle from '$lib/components/ui/choicebox/choicebox-title.svelte';
  import ChoiceboxDescription from '$lib/components/ui/choicebox/choicebox-description.svelte';
  import ChoiceboxIndicator from '$lib/components/ui/choicebox/choicebox-indicator.svelte';

  interface HtmlExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    totalCount: bigint;
    entity: string;
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
    isExporting,
    onConfirm,
    onCancel
  }: HtmlExportDialogProps = $props();
</script>

<DialogBordered bind:open={open} severity="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('app.common.exportHtmlConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      {#if selectedCount > 0}
        {$t('app.common.exportHtmlConfirm')} {selectedCount} {$t(`entities.${entity}.plural`)}?
      {:else}
        {$t('app.common.exportHtmlConfirm')} {totalCount} {$t(`entities.${entity}.plural`)}?
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
</DialogBordered>
