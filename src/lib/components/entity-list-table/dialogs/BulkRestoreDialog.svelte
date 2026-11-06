<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { Dialog } from '@primebrick/ui';
  import { BorderedDialog } from '@primebrick/ui';
  import { Choicebox } from '@primebrick/ui';
  import { actionColorButtonVariant } from '@primebrick/ui';
  import { getEntitiesNsContext } from '../context';
  import type { ActionChrome } from '../types';

  interface BulkRestoreDialogProps {
    /**
     * Entity translation key (e.g. 'ai_model', 'customer'). The title is
     * auto-built as `<action label> <entities_ns>.entities.{entity}.plural`
     * — NEVER pass a custom title.
     */
    entity: string;
    /** Entity-label i18n namespace from `meta.entities_ns` — defaults to the table context / `system`. */
    entities_ns?: string;
    /** `meta.actions["restore.bulk"]` chrome — label/confirm/busy keys and
     *  the semantic color driving title, message, button and accent bar.
     *  Absent → standard restore copy (`app.common.restore*`). */
    chrome?: ActionChrome;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    /** Rows matching the current filters (list `total`) — the 'all' scope.
     *  Required only when the caller enables scope selection. */
    totalCount?: bigint;
    isRestoring: boolean;
    /** Bulk scope — 'selected' rows vs every row matching current filters.
     *  Both scope props optional: standalone call sites without a scope
     *  handler get the plain selected-rows dialog (no Choicebox). */
    restoreScope?: 'selected' | 'all';
    onRestoreScopeChange?: (scope: 'selected' | 'all') => void;
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
    isRestoring,
    restoreScope = 'selected',
    onRestoreScopeChange,
    onConfirm,
    onCancel
  }: BulkRestoreDialogProps = $props();

  const ns = $derived(entities_ns ?? getEntitiesNsContext());
  let entityPlural = $derived($t(`${ns}.entities.${entity}.plural`));
  let actionLabel = $derived($t(chrome?.label_key ?? 'app.common.restore'));
  let affectedCount = $derived(restoreScope === 'all' && totalCount != null ? Number(totalCount) : selectedCount);
  let confirmKey = $derived(chrome?.confirm_key ?? 'app.common.restoreEntitiesConfirm');
  let busyKey = $derived(chrome?.busy_key ?? 'app.common.restoring');
  let severity = $derived(chrome?.color ?? 'warning');
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
  {#if selectedCount > 0 && onRestoreScopeChange}
    <div class="py-4">
      <Choicebox.Root bind:value={restoreScope} onValueChange={(v) => onRestoreScopeChange(v as 'selected' | 'all')}>
        <Choicebox.Item value="selected">
          <Choicebox.Title>{$t('app.common.bulkScopeSelectedTitle', { count: selectedCount })}</Choicebox.Title>
          <Choicebox.Description>{$t('app.common.bulkScopeSelectedDesc')}</Choicebox.Description>
          <Choicebox.Indicator />
        </Choicebox.Item>
        <Choicebox.Item value="all">
          <Choicebox.Title>{$t('app.common.bulkScopeAllTitle', { count: Number(totalCount ?? 0n) })}</Choicebox.Title>
          <Choicebox.Description>{$t('app.common.bulkScopeAllDesc')}</Choicebox.Description>
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
      disabled={isRestoring}
    >
      {$t('app.common.cancel')}
    </Button>
    <Button
      variant={actionColorButtonVariant(severity)}
      class="hover:scale-105 transition-all"
      onclick={onConfirm}
      disabled={isRestoring}
    >
      {#if isRestoring}
        {$t(busyKey)}
      {:else}
        {actionLabel}
      {/if}
    </Button>
  </Dialog.Footer>
</BorderedDialog>
