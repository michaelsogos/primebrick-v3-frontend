<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { Dialog } from '@primebrick/ui';
  import { BorderedDialog } from '@primebrick/ui';
  import { Choicebox } from '@primebrick/ui';
  import BsFiletypeXlsx from '~icons/bi/filetype-xlsx';
  import BsFiletypeCsv from '~icons/bi/filetype-csv';
  import { getEntitiesNsContext } from '../context';

  interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    totalCount: bigint;
    entity: string;
    /** Entity-label i18n namespace from `meta.entities_ns` — defaults to the table context / `system`. */
    entities_ns?: string;
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
    entities_ns,
    exportScope,
    onExportScopeChange,
    fileType,
    isExporting,
    onFileTypeChange,
    onConfirm,
    onCancel
  }: ExportDialogProps = $props();

  const ns = $derived(entities_ns ?? getEntitiesNsContext());
</script>

<BorderedDialog bind:open={open} {onOpenChange} severity="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('app.common.export_confirm_title')}</Dialog.Title>
    <Dialog.Description>
      {#if selectedCount > 0}
        {$t('app.common.export_confirm')} {selectedCount} {$t(`${ns}.entities.${entity}.plural`)}?
      {:else}
        {$t('app.common.export_confirm')} {totalCount} {$t(`${ns}.entities.${entity}.plural`)}?
      {/if}
    </Dialog.Description>
  </Dialog.Header>
  {#if selectedCount > 0}
    <div class="py-4">
      <Choicebox.Root bind:value={exportScope} onValueChange={(v) => onExportScopeChange(v as 'selected' | 'all')}>
        <Choicebox.Item value="selected">
          <Choicebox.Title>Solo i {selectedCount} elementi selezionati</Choicebox.Title>
          <Choicebox.Description>Esporta solo gli elementi selezionati nella tabella</Choicebox.Description>
          <Choicebox.Indicator />
        </Choicebox.Item>
        <Choicebox.Item value="all">
          <Choicebox.Title>Tutti i {totalCount} elementi</Choicebox.Title>
          <Choicebox.Description>Esporta tutti gli elementi della tabella (con filtri correnti)</Choicebox.Description>
          <Choicebox.Indicator />
        </Choicebox.Item>
      </Choicebox.Root>
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
          {$t('app.common.export_excel')}
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
          {$t('app.common.export_csv')}
        {/if}
      </Button>
    </div>
  </Dialog.Footer>
</BorderedDialog>
