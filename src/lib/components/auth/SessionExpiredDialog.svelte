<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import BorderedDialog from '$lib/components/ui/dialog-bordered.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { t } from '$lib/i18n';
  import { apiFetch } from '$lib/api';
  import { saveRedirectUrl } from '$lib/auth/redirect-cache';
  import { sessionExpiredStore } from '$lib/auth/session-expired-store.svelte';
  import LoginForm from './LoginForm.svelte';
  import ShieldUser from '@lucide/svelte/icons/shield-user';

  function handleLoginSuccess() {
    // Close dialog, drain pending requests, retry each with _sessionRetry flag
    sessionExpiredStore.close();
    const pending = sessionExpiredStore.drainPending();
    for (const req of pending) {
      apiFetch(req.input, { ...req.init, _sessionRetry: true } as RequestInit)
        .then(req.resolve)
        .catch(req.reject);
    }
  }

  function handleLoginError() {
    sessionExpiredStore.setFailed();
  }

  function handleGoToLogin() {
    saveRedirectUrl(window.location.pathname + window.location.search);
    window.location.href = '/login';
  }

  // Persistent dialog: bump animation when user tries to dismiss via outside click.
  let bump = $state(false);
  function handleInteractOutside(event: PointerEvent) {
    event.preventDefault();
    bump = true;
    setTimeout(() => (bump = false), 400);
  }
</script>

<BorderedDialog
  bind:open={sessionExpiredStore.isOpen}
  severity="destructive"
  tone="soft"
  showCloseButton={false}
  escapeKeydownBehavior="ignore"
  onInteractOutside={handleInteractOutside}
  class="max-w-md {bump ? 'dialog-bump' : ''}"
>
  <Dialog.Header>
    <Dialog.Title class="flex items-center gap-2 text-destructive">
      <ShieldUser class="size-5" />
      {$t('app.auth.sessionExpired.title')}
    </Dialog.Title>
    <Dialog.Description>
      {$t('app.auth.sessionExpired.description')}
    </Dialog.Description>
  </Dialog.Header>

  <div class="space-y-4 py-2">
    {#if sessionExpiredStore.hasFailedAttempt}
      <Alert variant="destructive">
        <AlertDescription>
          {$t('app.auth.sessionExpired.failedAttempt')}
        </AlertDescription>
      </Alert>
    {/if}

    <LoginForm onsuccess={handleLoginSuccess} onerror={handleLoginError} />
  </div>

  {#if sessionExpiredStore.hasFailedAttempt}
    <Dialog.Footer class="flex justify-between gap-2">
      <Button variant="outline" onclick={handleGoToLogin}>
        {$t('app.auth.sessionExpired.goToLogin')}
      </Button>
    </Dialog.Footer>
  {/if}
</BorderedDialog>
