<script lang="ts">
  import { z } from 'zod';
  import { superForm, defaults } from 'sveltekit-superforms';
  import { zod4 } from 'sveltekit-superforms/adapters';
  import { t } from '$lib/i18n';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    CardFooter,
  } from '$lib/components/ui/card';
  import {
    FormField,
    FormControl,
    FormLabel,
    TranslatedFormFieldErrors,
  } from '$lib/components/ui/form';
  import { Button } from '$lib/components/ui/button';
  import * as Password from '$lib/components/ui/password';
  import PasswordChecklist from '$lib/components/forms/PasswordChecklist.svelte';
  import { usePasswordPolicy } from '$lib/composables/usePasswordPolicy.svelte';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import { onMount } from 'svelte';
  import KeyRound from '@lucide/svelte/icons/key-round';

  const passwordPolicy = usePasswordPolicy();

  // Zod schema with async refine on new_password for the dynamic password policy.
  // The refine is async so it reads passwordPolicy.state at validation time
  // (when the user types), not at schema creation time.
  const changePasswordSchema = z
    .object({
      current_password: z.string().min(1, { message: 'validation.required' }),
      new_password: z
        .string()
        .min(1, { message: 'validation.required' })
        .refine(async (val) => {
          if (!passwordPolicy.state.loaded || !val) return true;
          return passwordPolicy.regex.test(val);
        }, passwordPolicy.state.errorLabelKey),
      confirm_password: z.string().min(1, { message: 'validation.required' }),
    })
    .refine((data) => data.new_password === data.confirm_password, {
      path: ['confirm_password'],
      message: 'shell.settings.security.passwordsDoNotMatch',
    });

  const superFormObj = superForm(defaults(zod4(changePasswordSchema)), {
    SPA: true,
    validators: zod4(changePasswordSchema),
    validationMethod: 'oninput',
    invalidateAll: false,
    resetForm: false,
    async onUpdate({ form, cancel }) {
      if (!form.valid) return;

      try {
        const resp = await apiFetch('/api/v1/auth/me/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_password: form.data.current_password,
            newPassword: form.data.new_password,
          }),
        });

        if (resp.ok) {
          pushNotification({
            impact: 'NONE',
            message: $t('shell.settings.security.passwordChangedSuccess'),
            scope: 'auth',
          });
          reset();
        } else {
          const err = await resp.json();
          pushNotification({ ...err, toast: false });
          cancel();
        }
      } catch (error) {
        console.error('Failed to change password:', error);
        pushNotification({
          impact: 'HIGH',
          message: $t('shell.settings.security.passwordChangedError'),
          scope: 'auth',
        });
        cancel();
      }
    },
  });

  const { form, errors, enhance, submitting, reset, validate } = superFormObj;

  // Button is enabled only when all fields have a value AND there are no validation errors.
  const canSubmit = $derived.by(() => {
    if (!$form.current_password || !$form.new_password || !$form.confirm_password) return false;
    const errs = $errors as Record<string, unknown>;
    for (const key in errs) {
      const err = errs[key];
      if (err && (Array.isArray(err) ? err.length > 0 : true)) return false;
    }
    return true;
  });

  onMount(() => {
    void passwordPolicy.load().then(() => {
      // Force re-validation of new_password once the policy is loaded,
      // so the superRefine can now check the regex and show errors if needed.
      if ($form.new_password) {
        void validate('new_password');
      }
    });
  });
</script>

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
  <CardContent>
    <form
      id="change-password-form"
      use:enhance
      class="grid grid-cols-2 gap-6"
      data-testid="credentials-change-password-form"
    >
      <!-- Row 1: current password (col 1) -->
      <div class="col-start-1 row-start-1">
        <FormField form={superFormObj} name="current_password">
          <FormControl>
            {#snippet children({ props })}
              <div class="space-y-2">
                <FormLabel for={props.id}>
                  {$t('shell.settings.security.currentPassword')}
                </FormLabel>
                <Password.PasswordInput
                  {...props}
                  bind:value={$form.current_password}
                  placeholder={$t('shell.settings.security.currentPasswordPlaceholder')}
                  autocomplete="current-password"
                  data-testid="credentials-current-password-input"
                />
                <TranslatedFormFieldErrors />
              </div>
            {/snippet}
          </FormControl>
        </FormField>
      </div>

      <!-- Row 2: new password (col 1) -->
      <div class="col-start-1 row-start-2">
        <FormField form={superFormObj} name="new_password">
          <FormControl>
            {#snippet children({ props })}
              <div class="space-y-2">
                <FormLabel for={props.id}>
                  {$t('shell.settings.security.newPassword')}
                </FormLabel>
                <Password.PasswordInput
                  {...props}
                  bind:value={$form.new_password}
                  placeholder={$t('shell.settings.security.newPasswordPlaceholder')}
                  autocomplete="new-password"
                  data-testid="credentials-new-password-input"
                />
                <TranslatedFormFieldErrors />
              </div>
            {/snippet}
          </FormControl>
        </FormField>
      </div>

      <!-- Checklist: col 2, aligned with new password row, spans rows 2-3 -->
      {#if $form.new_password && passwordPolicy.state.loaded}
        <div class="col-start-2 row-start-2 row-span-2">
          <PasswordChecklist
            password={$form.new_password}
            rules={[...passwordPolicy.state.checklistRules]}
            specialChars={passwordPolicy.state.specialChars}
          />
        </div>
      {/if}

      <!-- Row 3: confirm password (col 1) -->
      <div class="col-start-1 row-start-3">
        <FormField form={superFormObj} name="confirm_password">
          <FormControl>
            {#snippet children({ props })}
              <div class="space-y-2">
                <FormLabel for={props.id}>
                  {$t('shell.settings.security.confirmPassword')}
                </FormLabel>
                <Password.PasswordInput
                  {...props}
                  bind:value={$form.confirm_password}
                  placeholder={$t('shell.settings.security.confirmPasswordPlaceholder')}
                  autocomplete="new-password"
                  data-testid="credentials-confirm-password-input"
                />
                <TranslatedFormFieldErrors />
              </div>
            {/snippet}
          </FormControl>
        </FormField>
      </div>
    </form>
  </CardContent>
  <CardFooter class="bg-muted/50 border-t p-4 -mb-6 justify-end gap-2 rounded-b-xl">
    <Button
      type="submit"
      form="change-password-form"
      disabled={$submitting || !canSubmit}
      data-testid="credentials-change-password-button"
    >
      {$t('shell.settings.credentials.changePassword.button')}
    </Button>
  </CardFooter>
</Card>
