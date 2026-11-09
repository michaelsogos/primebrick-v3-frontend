<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { Dialog } from '@primebrick/ui';
  import { BorderedDialog } from '@primebrick/ui';
  import { Choicebox } from '@primebrick/ui';
  import { actionColorButtonVariant } from '@primebrick/ui';
  import { getEntitiesNsContext } from '../context';
  import type { ActionChrome } from '../types';

  interface BulkDeleteDialogProps {
    /**
     * Entity translation key (e.g. 'ai_model', 'customer'). The title is
     * auto-built as `<action label> <entities_ns>.entities.{entity}.plural`
     * — NEVER pass a custom title.
     */
    entity: string;
    /** Entity-label i18n namespace from `meta.entities_ns` — defaults to the table context / `system`. */
    entities_ns?: string;
    /** `meta.actions["delete.bulk"]` chrome — label/confirm/busy keys and
     *  the semantic color driving title, message, button and accent bar.
     *  Absent → standard delete copy (`app.common.delete*`). */
    chrome?: ActionChrome;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    /** Rows matching the current filters (list `total`) — the 'all' scope.
     *  Required only when the caller enables scope selection. */
    totalCount?: bigint;
    isDeleting: boolean;
    /** Bulk scope — 'selected' rows vs every row matching current filters.
     *  Both scope props optional: standalone call sites without a scope
     *  handler get the plain selected-rows dialog (no Choicebox). */
    deleteScope?: 'selected' | 'all';
    onDeleteScopeChange?: (scope: 'selected' | 'all') => void;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    entity,
    entities_ns,
    chrome,
    open = $bindable(),
    onOpenChange,
    selectedCount,
    totalCount,
    isDeleting,
    deleteScope = 'selected',
    onDeleteScopeChange,
    onConfirm,
    onCancel
  }: BulkDeleteDialogProps = $props();

  const ns = $derived(entities_ns ?? getEntitiesNsContext());
  let entityPlural = $derived($t(`${ns}.entities.${entity}.plural`));
  // The op label doubles as the dialog title verb: "Disattiva job
  // triggers" / "Elimina clienti" — one construction for every override.
  let actionLabel = $derived($t(chrome?.label_key ?? 'app.common.delete'));
  let affectedCount = $derived(deleteScope === 'all' && totalCount != null ? Number(totalCount) : selectedCount);
  let confirmKey = $derived(chrome?.confirm_key ?? 'app.common.delete_entities_confirm');
  let busyKey = $derived(chrome?.busy_key ?? 'app.common.deleting');
  let severity = $derived(chrome?.color ?? 'destructive');
</script>

<BorderedDialog bind:open={open} {onOpenChange} {severity} class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>
      {actionLabel} {entityPlural}
    </Dialog.Title>
    <Dialog.Description>
      {$t(confirmKey, { count: affectedCount, entity: entityPlural })}
    </Dialog.Description>
  </Dialog.Header>
  {#if selectedCount > 0 && onDeleteScopeChange}
    <div class="py-4">
      <Choicebox.Root bind:value={deleteScope} onValueChange={(v) => onDeleteScopeChange(v as 'selected' | 'all')}>
        <Choicebox.Item value="selected">
          <Choicebox.Title>{$t('app.common.bulk_scope_selected_title', { count: selectedCount })}</Choicebox.Title>
          <Choicebox.Description>{$t('app.common.bulk_scope_selected_desc')}</Choicebox.Description>
          <Choicebox.Indicator />
        </Choicebox.Item>
        <Choicebox.Item value="all">
          <Choicebox.Title>{$t('app.common.bulk_scope_all_title', { count: Number(totalCount ?? 0n) })}</Choicebox.Title>
          <Choicebox.Description>{$t('app.common.bulk_scope_all_desc')}</Choicebox.Description>
          <Choicebox.Indicator />
        </Choicebox.Item>
      </Choicebox.Root>
    </div>
  {/if}
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
      variant={actionColorButtonVariant(severity)}
      class="hover:scale-105 transition-all"
      onclick={onConfirm}
      disabled={isDeleting}
    >
      {#if isDeleting}
        {$t(busyKey)}
      {:else}
        {actionLabel}
      {/if}
    </Button>
  </Dialog.Footer>
</BorderedDialog>
