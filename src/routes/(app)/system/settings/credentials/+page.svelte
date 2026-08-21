<script lang="ts">
  import { t } from '$lib/i18n';
  import { page } from '$app/state';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { Button } from '$lib/components/ui/button';
  import * as Password from '$lib/components/ui/password';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import { usePasswordPolicy } from '$lib/composables/usePasswordPolicy.svelte';
  import PasswordChecklist from '$lib/components/forms/PasswordChecklist.svelte';
  import { onMount } from 'svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
  } from '$lib/components/ui/card';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import PasskeyEnrollment from '$lib/components/auth/PasskeyEnrollment.svelte';
  import MfaManagement from '$lib/components/auth/MfaManagement.svelte';

  // ─── Change-password state ────────────────────────────────────────────────
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let changingPassword = $state(false);

  const passwordPolicy = usePasswordPolicy();

  const passwordValid = $derived(
    passwordPolicy.state.loaded && passwordPolicy.regex.test(newPassword),
  );

  const canChangePassword = $derived(
    currentPassword.length > 0 &&
      newPassword.length > 0 &&
      passwordValid &&
      newPassword === confirmPassword &&
      !changingPassword,
  );

  const handleChangePassword: SubmitFunction = ({ cancel }) => {
    cancel();

    if (!canChangePassword) return;

    changingPassword = true;
    (async () => {
      try {
        const resp = await apiFetch('/api/v1/auth/me/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_password: currentPassword,
            newPassword,
          }),
        });

        if (resp.ok) {
          pushNotification({
            impact: 'NONE',
            message: $t('shell.settings.security.passwordChangedSuccess'),
            scope: 'auth',
          });
          currentPassword = '';
          newPassword = '';
          confirmPassword = '';
        } else {
          const err = await resp.json();
          pushNotification({ ...err, toast: false });
        }
      } catch (error) {
        console.error('Failed to change password:', error);
        pushNotification({
          impact: 'HIGH',
          message: $t('shell.settings.security.passwordChangedError'),
          scope: 'auth',
        });
      } finally {
        changingPassword = false;
      }
    })();
  };

  onMount(() => {
    void passwordPolicy.load();
  });
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key),
          }),
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">
        {$t('shell.settings.credentials.title')}
      </h1>
    </div>
  {/snippet}

  {#snippet children()}
    <div class="flex-1 overflow-auto p-4">
      <div class="space-y-6">
        <!-- Card 1: Change password.
             Mixed-page layout (form + other cards) → form is wrapped in a Card
             and the primary CTA lives inside the card, not in a footer.
             The form keeps the 2-column grid + validation per the form standard. -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <KeyRound class="size-5" />
              {$t('shell.settings.credentials.changePassword.title')}
            </CardTitle>
            <CardDescription>
              {$t('shell.settings.credentials.changePassword.description')}
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <form
              id="change-password-form"
              method="POST"
              use:enhance={handleChangePassword}
              class="grid grid-cols-2 gap-6"
              data-testid="credentials-change-password-form"
            >
              <!-- Column 1: current + new password -->
              <div class="space-y-4">
                <div class="space-y-2">
                  <label
                    for="credentials-current-password"
                    class="text-sm font-medium leading-none"
                  >
                    {$t('shell.settings.security.currentPassword')}
                  </label>
                  <Password.PasswordInput
                    id="credentials-current-password"
                    bind:value={currentPassword}
                    placeholder={$t('shell.settings.security.currentPasswordPlaceholder')}
                    autocomplete="current-password"
                    data-testid="credentials-current-password-input"
                  />
                </div>
                <div class="space-y-2">
                  <label
                    for="credentials-new-password"
                    class="text-sm font-medium leading-none"
                  >
                    {$t('shell.settings.security.newPassword')}
                  </label>
                  <Password.PasswordInput
                    id="credentials-new-password"
                    bind:value={newPassword}
                    placeholder={$t('shell.settings.security.newPasswordPlaceholder')}
                    autocomplete="new-password"
                    data-testid="credentials-new-password-input"
                  />
                  {#if newPassword && passwordPolicy.state.loaded}
                    <PasswordChecklist
                      password={newPassword}
                      rules={[...passwordPolicy.state.checklistRules]}
                      specialChars={passwordPolicy.state.specialChars}
                    />
                  {/if}
                </div>
              </div>

              <!-- Column 2: confirm + CTA -->
              <div class="space-y-4">
                <div class="space-y-2">
                  <label
                    for="credentials-confirm-password"
                    class="text-sm font-medium leading-none"
                  >
                    {$t('shell.settings.security.confirmPassword')}
                  </label>
                  <Password.PasswordInput
                    id="credentials-confirm-password"
                    bind:value={confirmPassword}
                    placeholder={$t('shell.settings.security.confirmPasswordPlaceholder')}
                    autocomplete="new-password"
                    data-testid="credentials-confirm-password-input"
                  />
                  {#if confirmPassword.length > 0 && newPassword !== confirmPassword}
                    <p class="text-sm text-destructive mt-1">
                      {$t('shell.settings.security.passwordsDoNotMatch')}
                    </p>
                  {/if}
                </div>
                <!-- DEFAULT primary CTA inside the card (no footer primary on this page) -->
                <div class="flex justify-end">
                  <Button
                    type="submit"
                    form="change-password-form"
                    disabled={!canChangePassword}
                    data-testid="credentials-change-password-button"
                  >
                    {changingPassword
                      ? $t('shell.settings.security.changingPassword')
                      : $t('shell.settings.credentials.changePassword.button')}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <!-- Card 2: Passkeys (moved from the profile page) -->
        <PasskeyEnrollment />

        <!-- Card 3: MFA (moved from the profile page) -->
        <MfaManagement />
      </div>
    </div>
  {/snippet}
</AppPageScaffold>
