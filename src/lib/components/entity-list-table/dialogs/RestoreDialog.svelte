<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { Dialog } from '@primebrick/ui';
  import { BorderedDialog } from '@primebrick/ui';
  import { EntityConfirmQuestion } from '@primebrick/ui';
  import { actionColorButtonVariant } from '@primebrick/ui';
  import { getEntitiesNsContext } from '../context';
  import type { ActionChrome } from '../types';

  interface RestoreDialogProps {
    /**
     * Entity translation key (e.g. 'ai_model', 'customer'). The title is
     * auto-built as `<action label> <entities_ns>.entities.{entity}.singular`
     * — NEVER pass a custom title.
     */
    entity: string;
    /** Entity-label i18n namespace from `meta.entities_ns` — defaults to the table context / `system`. */
    entities_ns?: string;
    /** Optional record name shown under the description. */
    recordName?: string;
    /** `meta.actions["restore.single"]` chrome — meta-driven copy: label
     *  (title verb + confirm button), `confirm_key` (message template),
     *  `busy_key` (in-flight label), `color` (accent bar + button). */
    chrome?: ActionChrome;
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
    chrome,
    open = $bindable(),
    onOpenChange,
    isRestoring,
    onConfirm,
    onCancel
  }: RestoreDialogProps = $props();

  const ns = $derived(entities_ns ?? getEntitiesNsContext());
  let entityName = $derived($t(`${ns}.entities.${entity}.singular`));
  let actionLabel = $derived($t(chrome?.label_key ?? 'app.common.restore'));
  let severity = $derived(chrome?.color ?? 'warning');
</script>

<BorderedDialog bind:open={open} {onOpenChange} {severity} class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>
      {actionLabel} {entityName}
    </Dialog.Title>
    <Dialog.Description>
      <EntityConfirmQuestion action="restore" {entity} entities_ns={ns} {recordName} confirm_key={chrome?.confirm_key} />
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
      variant={actionColorButtonVariant(severity)}
      class="hover:scale-105 transition-all"
      onclick={onConfirm}
      disabled={isRestoring}
    >
      {#if isRestoring}
        {$t(chrome?.busy_key ?? 'app.common.restoring')}
      {:else}
        {actionLabel}
      {/if}
    </Button>
  </Dialog.Footer>
</BorderedDialog>
