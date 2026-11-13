<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { Dialog } from '@primebrick/ui';
  import { BorderedDialog } from '@primebrick/ui';
  import { getEntitiesNsContext } from '../context';
  import { actionColorButtonVariant } from '@primebrick/ui';
  import type { ActionChrome } from '../types';

  interface DuplicateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    duplicateScope: 'single' | 'selected';
    selectedCount: number;
    entity: string;
    /** Entity-label i18n namespace from `meta.entities_ns` — defaults to the table context / `system`. */
    entities_ns?: string;
    /** `meta.actions["duplicate.bulk"]` chrome — label/confirm/busy copy +
     *  accent severity. Violet is the clone semantic default. */
    chrome?: ActionChrome;
    isDuplicating: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    open = $bindable(),
    onOpenChange,
    duplicateScope,
    selectedCount,
    entity,
    entities_ns,
    chrome,
    isDuplicating,
    onConfirm,
    onCancel
  }: DuplicateDialogProps = $props();

  const ns = $derived(entities_ns ?? getEntitiesNsContext());
  let severity = $derived(chrome?.color ?? 'violet');
</script>

<BorderedDialog bind:open={open} {onOpenChange} {severity} class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t(chrome?.label_key ?? 'app.common.duplicate_confirm_title')}</Dialog.Title>
    <Dialog.Description>
      {#if duplicateScope === 'single'}
        {$t(chrome?.confirm_key ?? 'app.common.duplicate_confirm_single')}?
      {:else}
        {$t(chrome?.confirm_key ?? 'app.common.duplicate_confirm')} {selectedCount} {$t(`${ns}.entities.${entity}.plural`)}?
      {/if}
    </Dialog.Description>
  </Dialog.Header>
  <Dialog.Footer class="gap-2 sm:space-x-0 flex-col sm:flex-row">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={onCancel}
      disabled={isDuplicating}
    >
      {$t('app.common.cancel')}
    </Button>
    <Button
      variant={actionColorButtonVariant(severity)}
      class="hover:scale-105 transition-all flex-1 sm:flex-none"
      onclick={onConfirm}
      disabled={isDuplicating}
    >
      {#if isDuplicating}
        {$t(chrome?.busy_key ?? 'app.common.duplicating')}
      {:else}
        {$t('app.common.confirm')}
      {/if}
    </Button>
  </Dialog.Footer>
</BorderedDialog>
