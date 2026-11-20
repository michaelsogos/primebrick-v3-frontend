<script lang="ts">
  /**
   * UnsavedChangesGuardHost — renders the ONE governed unsaved-changes
   * confirm for every page using `useUnsavedChangesGuard`. Mounted once in
   * `(app)/+layout.svelte` next to `EntityOpConfirmHost` — same
   * channel-by-construction pattern.
   */
  import { t } from '$lib/i18n';
  import { Button, Dialog, BorderedDialog } from '@primebrick/ui';
  import { unsavedGuardState, settleUnsavedGuardConfirm } from './useUnsavedChangesGuard.svelte';

  const req = $derived(unsavedGuardState.confirm);
  const onConfirm = () => settleUnsavedGuardConfirm(true);
  const onCancel = () => settleUnsavedGuardConfirm(false);
</script>

{#if req}
  <BorderedDialog open={true} severity="warning" class="sm:max-w-md" showCloseButton={false} onOpenChange={(o) => { if (!o) onCancel(); }}>
    <Dialog.Header class="pb-4">
      <Dialog.Title>
        {$t('app.common.unsaved_changes_title')}
      </Dialog.Title>
      <Dialog.Description>
        {$t(req.confirmKey)}
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer class="gap-2 sm:space-x-0">
      <Button variant="secondary-outline" class="hover:scale-105 transition-all" onclick={onCancel}>
        {$t('app.common.cancel')}
      </Button>
      <Button variant="warning" class="hover:scale-105 transition-all" onclick={onConfirm}>
        {$t('app.common.leave')}
      </Button>
    </Dialog.Footer>
  </BorderedDialog>
{/if}
