<script lang="ts">
  /**
   * EntityOpConfirmHost — the ONE confirm channel for `runEntityOp`.
   *
   * Mounted once in `routes/(app)/+layout.svelte`: every gated entity op
   * (delete/purge/restore families, DELETE-method endpoints, `confirm_key`
   * ops) from ANY page funnels through `entityOpState.confirm` — pages
   * can't forget the channel because they never own it.
   *
   * Anatomy per family×scope — the canonical set from
   * `docs/ai/entity-confirm-dialogs.md`: `DeleteDialog` (destructive),
   * `RestoreDialog` (warning), and the bulk twins. Busy state rides
   * `entityOpState.busy` so the dialog shows the in-flight op and refuses
   * mid-request dismiss.
   *
   * The host also owns the single `<MfaStepUpDialog>` for entity ops —
   * `entityOpMfa` is the module-level step-up driver (pages no longer
   * mount per-page instances for entity ops).
   */
  import { DeleteDialog } from '@primebrick/ui';
  import { RestoreDialog, BulkDeleteDialog, BulkRestoreDialog } from '$lib/components/entity-list-table/dialogs';
  import MfaStepUpDialog from '$lib/components/auth/MfaStepUpDialog.svelte';
  import { entityOpMfa, entityOpState, settleEntityOpConfirm } from './use-entity-op.svelte';

  let req = $derived(entityOpState.confirm);

  /** `generic` gated ops (confirm_key-only custom ops) reuse the delete
   *  dialog anatomy — it is fully chrome-driven; the op's own
   *  label/confirm/busy keys fill title, question and buttons. Defaults:
   *  `warning` accent (cautionary, not destructive), "Confirm" title. */
  const genericChrome = $derived.by(() => {
    if (req?.family !== 'generic') return undefined;
    return {
      ...req.chrome,
      label_key: req.chrome?.label_key ?? 'app.common.confirm',
      color: req.chrome?.color ?? ('warning' as const),
    };
  });

  function onOpenChange(open: boolean): void {
    if (!open) settleEntityOpConfirm(false);
  }
  const onConfirm = () => settleEntityOpConfirm(true);
  const onCancel = () => settleEntityOpConfirm(false);
</script>

{#if req}
  {#if req.family === 'delete' && req.scope === 'single'}
    <DeleteDialog
      entity={req.entity}
      entities_ns={req.entities_ns}
      recordName={req.recordName}
      chrome={req.chrome}
      open={true}
      {onOpenChange}
      isDeleting={entityOpState.busy}
      {onConfirm}
      {onCancel}
    />
  {:else if req.family === 'delete' && req.scope === 'bulk'}
    <BulkDeleteDialog
      entity={req.entity}
      entities_ns={req.entities_ns}
      chrome={req.chrome}
      open={true}
      {onOpenChange}
      selectedCount={req.count ?? 0}
      deleteScope={req.scopeChoice?.value}
      onDeleteScopeChange={req.scopeChoice?.onChange}
      totalCount={req.totalCount}
      isDeleting={entityOpState.busy}
      {onConfirm}
      {onCancel}
    />
  {:else if req.family === 'restore' && req.scope === 'single'}
    <RestoreDialog
      entity={req.entity}
      entities_ns={req.entities_ns}
      recordName={req.recordName}
      chrome={req.chrome}
      open={true}
      {onOpenChange}
      isRestoring={entityOpState.busy}
      {onConfirm}
      {onCancel}
    />
  {:else if req.family === 'restore'}
    <BulkRestoreDialog
      entity={req.entity}
      entities_ns={req.entities_ns}
      chrome={req.chrome}
      open={true}
      {onOpenChange}
      selectedCount={req.count ?? 0}
      restoreScope={req.scopeChoice?.value}
      onRestoreScopeChange={req.scopeChoice?.onChange}
      totalCount={req.totalCount}
      isRestoring={entityOpState.busy}
      {onConfirm}
      {onCancel}
    />
  {:else if req.scope === 'single'}
    <DeleteDialog
      entity={req.entity}
      entities_ns={req.entities_ns}
      recordName={req.recordName}
      chrome={genericChrome}
      open={true}
      {onOpenChange}
      isDeleting={entityOpState.busy}
      {onConfirm}
      {onCancel}
    />
  {:else}
    <BulkDeleteDialog
      entity={req.entity}
      entities_ns={req.entities_ns}
      chrome={genericChrome}
      open={true}
      {onOpenChange}
      selectedCount={req.count ?? 0}
      isDeleting={entityOpState.busy}
      {onConfirm}
      {onCancel}
    />
  {/if}
{/if}

<MfaStepUpDialog
  bind:open={entityOpMfa.dialogOpen}
  action={entityOpMfa.pendingAction}
  target_resource={entityOpMfa.pendingTargetResource}
  onauthorized={entityOpMfa.handleAuthorized}
/>
