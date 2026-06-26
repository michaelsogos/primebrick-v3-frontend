<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { FormLabel } from '$lib/components/ui/form';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import { pushRFC7807Error, pushImpactError } from '$lib/errors/app-errors';
  import { apiFetch } from '$lib/api';
  import type { RFC7807Error } from '$lib/errors/rfc7807';

  interface ChangePasswordDialogProps<TRow extends Record<string, unknown>> {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    row: TRow | null;
    uid: string;
  }

  let {
    open = $bindable(),
    onOpenChange,
    row,
    uid,
  }: ChangePasswordDialogProps<TRow> = $props();

  let newPassword = $state('');
  let confirmPassword = $state('');
  let isSubmitting = $state(false);
  let localError = $state<string | null>(null);

  const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/;

  $effect(() => {
    // Reset state when dialog opens
    if (open) {
      newPassword = '';
      confirmPassword = '';
      localError = null;
    }
  });

  let validationError = $derived.by<string | null>(() => {
    if (!newPassword) return null;
    if (!PASSWORD_REGEX.test(newPassword)) {
      return $t('validation.passwordWeak');
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      return $t('shell.settings.users.changePasswordMismatch');
    }
    return null;
  });

  let canSubmit = $derived(
    !!newPassword &&
    !!confirmPassword &&
    newPassword === confirmPassword &&
    PASSWORD_REGEX.test(newPassword) &&
    !isSubmitting
  );

  async function handleSubmit() {
    if (!row || !canSubmit) return;
    const uuid = String((row as Record<string, unknown>)[uid]);
    if (!uuid) return;

    isSubmitting = true;
    localError = null;
    try {
      const res = await apiFetch(`/api/v1/entities/user_profiles/${uuid}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });

      if (!res.ok) {
        const errData = await res.json() as RFC7807Error & Record<string, any>;
        pushRFC7807Error(errData, { showToast: true });
        return;
      }

      pushImpactError({
        impact: 'LOW',
        messageKey: 'shell.settings.users.changePasswordSuccess',
        scope: $t('shell.settings.users.changePassword'),
        toast: true,
      });
      onOpenChange?.(false);
    } catch (e) {
      pushImpactError({
        impact: 'HIGH',
        messageKey: 'shell.settings.users.changePasswordFailed',
        scope: $t('shell.settings.users.changePassword'),
        detail: e instanceof Error ? e.message : String(e),
        toast: true,
      });
    } finally {
      isSubmitting = false;
    }
  }

  function handleCancel() {
    onOpenChange?.(false);
  }
</script>

<DialogBordered bind:open={open} color="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('shell.settings.users.changePasswordTitle')}</Dialog.Title>
    <Dialog.Description>{$t('shell.settings.users.changePasswordDescription')}</Dialog.Description>
  </Dialog.Header>
  <div class="space-y-4 py-2">
    <div class="space-y-2">
      <FormLabel for="change-password-new" required>{$t('shell.settings.users.changePasswordNew')}</FormLabel>
      <Input
        id="change-password-new"
        type="password"
        bind:value={newPassword}
        placeholder={$t('shell.settings.users.changePasswordNewPlaceholder')}
        disabled={isSubmitting}
        autocomplete="new-password"
      />
    </div>
    <div class="space-y-2">
      <FormLabel for="change-password-confirm" required>{$t('shell.settings.users.changePasswordConfirm')}</FormLabel>
      <Input
        id="change-password-confirm"
        type="password"
        bind:value={confirmPassword}
        placeholder={$t('shell.settings.users.changePasswordConfirmPlaceholder')}
        disabled={isSubmitting}
        autocomplete="new-password"
      />
    </div>
    {#if validationError}
      <p class="text-sm text-destructive">{validationError}</p>
    {/if}
  </div>
  <Dialog.Footer class="gap-2 sm:space-x-0">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={handleCancel}
      disabled={isSubmitting}
    >
      {$t('common.cancel')}
    </Button>
    <Button
      class="hover:scale-105 transition-all"
      onclick={handleSubmit}
      disabled={!canSubmit}
    >
      {#if isSubmitting}
        {$t('common.saving')}
      {:else}
        {$t('shell.settings.users.changePassword')}
      {/if}
    </Button>
  </Dialog.Footer>
</DialogBordered>
