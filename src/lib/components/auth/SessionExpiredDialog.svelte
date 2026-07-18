<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
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
</script>

<Dialog.Root bind:open={sessionExpiredStore.isOpen}>
  <Dialog.Content class="max-w-md border-primary-gradient-popover">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2 text-destructive">
        <ShieldUser class="size-5" />
        {$t('auth.sessionExpired.title')}
      </Dialog.Title>
      <Dialog.Description>
        {$t('auth.sessionExpired.description')}
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      {#if sessionExpiredStore.hasFailedAttempt}
        <Alert variant="destructive">
          <AlertDescription>
            {$t('auth.sessionExpired.failedAttempt')}
          </AlertDescription>
        </Alert>
      {/if}

      <LoginForm onsuccess={handleLoginSuccess} onerror={handleLoginError} />
    </div>

    {#if sessionExpiredStore.hasFailedAttempt}
      <Dialog.Footer class="flex justify-between gap-2">
        <Button variant="outline" onclick={handleGoToLogin}>
          {$t('auth.sessionExpired.goToLogin')}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
