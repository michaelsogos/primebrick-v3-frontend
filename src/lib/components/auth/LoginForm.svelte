<script lang="ts">
  import { z } from 'zod';
  import { superForm, defaults, setError, setMessage } from 'sveltekit-superforms';
  import { zod4 } from 'sveltekit-superforms/adapters';
  import { apiFetch } from '$lib/api';
  import { mapRFC7807ToMessageKey } from '$lib/errors/rfc7807-mapper';
  import { pushNotification } from '$lib/errors/app-errors';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { FormField, FormLabel, FormControl, FormFieldErrors } from '$lib/components/ui/form';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { Spinner } from '$lib/components/ui/spinner';
  import * as Password from '$lib/components/ui/password';
  import { t } from '$lib/i18n';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import PasskeyButton from './PasskeyButton.svelte';
  import { isWebauthnSupported } from '$lib/webauthn/codec';
  import { authConfigState, loadAuthConfig } from '$lib/auth-config-store.svelte';

  // Trigger the auth config fetch during component initialization.
  void loadAuthConfig();

  // Read $state directly — same pattern as userProfileState in the profile page.
  const enableFormauth = $derived(authConfigState.config?.enable_formauth ?? false);
  const enableWebauthn = $derived(authConfigState.config?.enable_webauthn ?? false);

  const loginSchema = z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
  });

  // onsuccess: called after successful login. Login page redirects; dialog closes + retries.
  // onerror: called when login fails (bad credentials, network error, etc.).
  let {
    onsuccess,
    onerror,
  }: {
    onsuccess?: (data: { success: boolean; user: any }) => void;
    onerror?: () => void;
  } = $props();

  const superFormObj = superForm(
    defaults(zod4(loginSchema)),
    {
      SPA: true,
      validators: zod4(loginSchema),
      invalidateAll: false,
      async onUpdate({ form: updateForm, cancel }) {
        if (!updateForm.valid) return;
        try {
          const response = await apiFetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateForm.data),
          });

          if (!response.ok) {
            const errorData = await response.json();
            pushNotification({ ...errorData, toast: false });

            if (response.status === 401) {
              const mappedError = mapRFC7807ToMessageKey({
                status: response.status,
                internal_code: errorData.internal_code,
                detail: errorData.detail
              });
              let errorMsg = errorData.detail || 'Invalid credentials';
              if (mappedError) {
                let translatedMsg = $t(mappedError.key);
                if (mappedError.minutes !== undefined) {
                  translatedMsg = translatedMsg.replace('{minutes}', mappedError.minutes.toString());
                }
                errorMsg = translatedMsg;
              }
              message.set(errorMsg);
            } else if (response.status === 400 && errorData.issues) {
              for (const issue of errorData.issues) {
                const fieldName = issue.path[0];
                setError(updateForm, fieldName, issue.message);
              }
              message.set(errorData.detail || 'Validation error');
            } else {
              message.set(errorData.detail || 'Login failed');
            }
            onerror?.();
            cancel();
            return;
          }

          const data = await response.json();
          if (data.success && data.user) {
            userProfileStore.set(data.user);
          }
          onsuccess?.(data);
        } catch (error) {
          console.error('[Login Error]', error);
          message.set('Errore di connessione o login fallito.');
          onerror?.();
          cancel();
        }
      }
    }
  );

  const { form, message, enhance, submitting } = superFormObj;
</script>

<form use:enhance>
  <div class="space-y-4">
    {#if enableFormauth}
    <FormField form={superFormObj} name="username">
      <FormControl>
        {#snippet children({ props })}
          <div class="space-y-2">
            <FormLabel for={props.id}>{$t('login.username')}</FormLabel>
            <Input
              type="text"
              placeholder={$t('login.usernamePlaceholder')}
              bind:value={$form.username}
              {...props}
            />
            <FormFieldErrors />
          </div>
        {/snippet}
      </FormControl>
    </FormField>

    <FormField form={superFormObj} name="password">
      <FormControl>
        {#snippet children({ props })}
          <div class="space-y-2">
            <FormLabel for={props.id}>{$t('login.password')}</FormLabel>
            <Password.PasswordInput
              placeholder={$t('login.passwordPlaceholder')}
              bind:value={$form.password}
              {...props}
            />
            <FormFieldErrors />
          </div>
        {/snippet}
      </FormControl>
    </FormField>

    <Button type="submit" class="w-full" disabled={$submitting}>
      {#if $submitting}
        <Spinner class="mr-2" />
      {/if}
      {$submitting ? $t('login.buttonLoading') : $t('login.button')}
    </Button>
    {/if}

    {#if enableWebauthn && isWebauthnSupported()}
      {#if enableFormauth}
      <div class="relative my-2">
        <div class="absolute inset-0 flex items-center">
          <span class="w-full border-t border-border"></span>
        </div>
        <div class="relative flex justify-center text-xs uppercase">
          <span class="bg-card px-2 text-muted-foreground">{$t('login.or')}</span>
        </div>
      </div>
      {/if}
      <PasskeyButton {onsuccess} {onerror} />
    {/if}

    {#if $message}
      <Alert variant="destructive" class="mt-4">
        <ShieldAlert class="size-4" />
        <AlertDescription>{$message}</AlertDescription>
      </Alert>
    {/if}
  </div>
</form>
