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
    totalCount: number;
    entity: string;
    exportScope: 'selected' | 'all';
    onExportScopeChange: (scope: 'selected' | 'all') => void;
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
    exportScope,
    onExportScopeChange,
    isExporting,
    onConfirm,
    onCancel
  }: HtmlExportDialogProps = $props();
</script>

<DialogBordered bind:open={open} color="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('common.exportHtmlConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      {#if selectedCount > 0}
        {$t('common.exportHtmlConfirm')} {selectedCount} {$t(`entities.${entity}.plural`)}?
      {:else}
        {$t('common.exportHtmlConfirm')} {totalCount} {$t(`entities.${entity}.plural`)}?
      {/if}
    </Dialog.Description>
  </Dialog.Header>
  {#if selectedCount > 0}
    <div class="py-4">
      <Choicebox bind:value={exportScope}>
        <ChoiceboxItem value="selected">
          <ChoiceboxTitle>Solo i {selectedCount} elementi selezionati</ChoiceboxTitle>
          <ChoiceboxDescription>Esporta solo gli elementi selezionati nella tabella</ChoiceboxDescription>
          <ChoiceboxIndicator />
        </ChoiceboxItem>
        <ChoiceboxItem value="all">
          <ChoiceboxTitle>Tutti i {totalCount} elementi</ChoiceboxTitle>
          <ChoiceboxDescription>Esporta tutti gli elementi della tabella (con filtri correnti)</ChoiceboxDescription>
          <ChoiceboxIndicator />
        </ChoiceboxItem>
      </Choicebox>
    </div>
  {/if}
  <Dialog.Footer class="gap-2 sm:space-x-0 flex-col sm:flex-row">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={onCancel}
      disabled={isExporting}
    >
      {$t('common.cancel')}
    </Button>
    <Button
      class="bg-warning text-warning-foreground hover:bg-warning/80 hover:scale-105 transition-all flex-1 sm:flex-none"
      onclick={onConfirm}
      disabled={isExporting}
    >
      {#if isExporting}
        {$t('common.exporting')}
      {:else}
        {$t('common.confirm')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>
