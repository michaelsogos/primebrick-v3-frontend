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
  import BsFiletypeXlsx from '~icons/bi/filetype-xlsx';
  import BsFiletypeCsv from '~icons/bi/filetype-csv';

  interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    totalCount: bigint;
    entity: string;
    exportScope: 'selected' | 'all';
    onExportScopeChange: (scope: 'selected' | 'all') => void;
    fileType: string | null;
    isExporting: boolean;
    onFileTypeChange: (type: string) => void;
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
    fileType,
    isExporting,
    onFileTypeChange,
    onConfirm,
    onCancel
  }: ExportDialogProps = $props();
</script>

<DialogBordered bind:open={open} severity="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('app.common.exportConfirmTitle')}</Dialog.Title>
    <Dialog.Description>
      {#if selectedCount > 0}
        {$t('app.common.exportConfirm')} {selectedCount} {$t(`system.entities.${entity}.plural`)}?
      {:else}
        {$t('app.common.exportConfirm')} {totalCount} {$t(`system.entities.${entity}.plural`)}?
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
      {$t('app.common.cancel')}
    </Button>
    <div class="flex gap-2 w-full sm:w-auto">
      <Button
        variant="warning"
        class="hover:scale-105 transition-all flex-1 sm:flex-none"
        onclick={() => { onFileTypeChange('xlsx'); onConfirm(); }}
        disabled={isExporting}
      >
        {#if isExporting && fileType === 'xlsx'}
          {$t('app.common.exporting')}
        {:else}
          <BsFiletypeXlsx class="size-5" />
          {$t('app.common.exportExcel')}
        {/if}
      </Button>
      <Button
        variant="warning"
        class="hover:scale-105 transition-all flex-1 sm:flex-none"
        onclick={() => { onFileTypeChange('csv'); onConfirm(); }}
        disabled={isExporting}
      >
        {#if isExporting && fileType === 'csv'}
          {$t('app.common.exporting')}
        {:else}
          <BsFiletypeCsv class="size-5" />
          {$t('app.common.exportCsv')}
        {/if}
      </Button>
    </div>
  </Dialog.Footer>
</DialogBordered>
