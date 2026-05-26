<script lang="ts">
  import { page } from '$app/state';
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import {
    FormField,
    FormLabel,
    FormControl,
    FormFieldErrors,
    TranslatedFormFieldErrors,
  } from '$lib/components/ui/form';
  import { superForm, defaults } from 'sveltekit-superforms';
  import { zod4 } from 'sveltekit-superforms/adapters';
  import { z } from 'zod';
  import { onMount } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { settingsTabMenuSegment } from '$lib/shell/crm-breadcrumb';
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import AsyncValidatedInput from '$lib/components/ui/input/async-validated-input.svelte';
  import { ValidationResult } from '$lib/types/validation.js';
  import type { ValidationStatus } from '$lib/types/validation.js';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { CopyButton } from '$lib/components/ui/copy-button';

  const SYNC_CHANNEL_NAME = 'primebrick_users_sync';
  let syncChannel: BroadcastChannel | null = null;

  // Custom refinement to ensure strings start and end with alphanumeric characters
  function startsAndEndsWithAlphanumeric(value: string): boolean {
    if (!value || value.length === 0) return true; // Skip empty strings (handled by required)
    const firstChar = value[0];
    const lastChar = value[value.length - 1];
    const alphanumericRegex = /^[a-z0-9]$/i;
    return alphanumericRegex.test(firstChar) && alphanumericRegex.test(lastChar);
  }

  onMount(() => {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);

    return () => {
      syncChannel?.close();
      syncChannel = null;
    };
  });

  function notifyParentRefresh() {
    if (!syncChannel) return;
    try {
      syncChannel.postMessage('refresh');
    } catch (e) {
      console.warn(`[${SYNC_CHANNEL_NAME}] Channel not ready, skipping refresh notification:`, e);
    }
  }

  // Zod schema for user create form
  const createSchema = z.object({
    username: z.string()
      .min(3, { message: 'validation.tooShort' })
      .max(255, { message: 'validation.tooLong' })
      .refine(startsAndEndsWithAlphanumeric, { message: 'validation.invalidFormat' }),
    password: z.string()
      .min(8, { message: 'validation.tooShort' })
      .max(255, { message: 'validation.tooLong' }),
    display_name: z.string()
      .min(2, { message: 'validation.tooShort' })
      .max(255, { message: 'validation.tooLong' })
      .optional()
      .or(z.literal('')),
    email: z.string()
      .email({ message: 'validation.invalidUrl' })
      .max(320, { message: 'validation.tooLong' })
      .optional()
      .or(z.literal('')),
    roles: z.string().default(''),
    avatar_initials: z.string()
      .max(4, { message: 'validation.tooLong' })
      .optional()
      .or(z.literal('')),
  });

  type CreateForm = z.infer<typeof createSchema>;

  // Superforms in SPA mode
  const superFormObj = superForm(defaults(zod4(createSchema)), {
    SPA: true,
    validators: zod4(createSchema),
    validationMethod: 'oninput',
    invalidateAll: false,
    resetForm: false,
    async onUpdate({ form: updateForm, cancel }) {
      if (!updateForm.valid) return;

      try {
        const body = {
          username: updateForm.data.username,
          password: updateForm.data.password,
          display_name: updateForm.data.display_name || undefined,
          email: updateForm.data.email || undefined,
          roles: updateForm.data.roles ? updateForm.data.roles.split(',').map(r => r.trim()) : [],
          avatar_initials: updateForm.data.avatar_initials || undefined,
        };

        const response = await apiFetch('/api/v1/auth/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Failed to create user:', errorData);
          cancel();
          return;
        }

        const data = await response.json();
        console.log('User created successfully');
        notifyParentRefresh();
        reset({ data: $form });
        await goto(`/system/settings/users/${data.uuid}`);
      } catch (error) {
        console.error('Failed to create user:', error);
        cancel();
      }
    },
  });

  const { form, errors, enhance, tainted, reset, isTainted } = superFormObj;

  const hasChanges = $derived(isTainted($tainted));

  function handleCancel() {
    if (hasChanges) {
      const ok = confirm($t('shell.settings.users.create.unsavedChanges'));
      if (!ok) return;
    }
    if (window.opener) {
      window.close();
    } else {
      history.back();
    }
  }

  beforeNavigate((navigation) => {
    if (hasChanges) {
      const confirmLeave = confirm($t('shell.settings.users.create.unsavedChanges'));
      if (!confirmLeave) {
        navigation.cancel();
      }
    }
  });
</script>

<svelte:window onbeforeunload={(e) => {
  if (hasChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
}} />

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
            t: (key) => $t(key)
          })
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.users.create.title')}</h1>
    </div>
  {/snippet}

  <div class="max-w-2xl">
    <form method="POST" use:enhance>
      <div class="space-y-6">
        <!-- Username -->
        <FormField form={superFormObj} name="username">
          <FormLabel>{$t('shell.settings.users.create.username')}</FormLabel>
          <FormControl>
            <Input
              type="text"
              placeholder={$t('shell.settings.users.create.usernamePlaceholder')}
              required
            />
          </FormControl>
          <FormFieldErrors />
        </FormField>

        <!-- Password -->
        <FormField form={superFormObj} name="password">
          <FormLabel>{$t('shell.settings.users.create.password')}</FormLabel>
          <FormControl>
            <Input
              type="password"
              placeholder={$t('shell.settings.users.create.passwordPlaceholder')}
              required
            />
          </FormControl>
          <FormFieldErrors />
        </FormField>

        <!-- Display Name -->
        <FormField form={superFormObj} name="display_name">
          <FormLabel>{$t('shell.settings.users.create.displayName')}</FormLabel>
          <FormControl>
            <Input
              type="text"
              placeholder={$t('shell.settings.users.create.displayNamePlaceholder')}
            />
          </FormControl>
          <FormFieldErrors />
        </FormField>

        <!-- Email -->
        <FormField form={superFormObj} name="email">
          <FormLabel>{$t('shell.settings.users.create.email')}</FormLabel>
          <FormControl>
            <Input
              type="email"
              placeholder={$t('shell.settings.users.create.emailPlaceholder')}
            />
          </FormControl>
          <FormFieldErrors />
        </FormField>

        <!-- Avatar Initials -->
        <FormField form={superFormObj} name="avatar_initials">
          <FormLabel>{$t('shell.settings.users.create.avatarInitials')}</FormLabel>
          <FormControl>
            <Input
              type="text"
              placeholder={$t('shell.settings.users.create.avatarInitialsPlaceholder')}
              maxlength={4}
            />
          </FormControl>
          <FormFieldErrors />
        </FormField>

        <!-- Roles -->
        <FormField form={superFormObj} name="roles">
          <FormLabel>{$t('shell.settings.users.create.roles')}</FormLabel>
          <FormControl>
            <Input
              type="text"
              placeholder="admin, collaborator, guest"
            />
          </FormControl>
          <p class="text-sm text-muted-foreground mt-1">
            Comma-separated list of roles
          </p>
          <FormFieldErrors />
        </FormField>

        <!-- Actions -->
        <div class="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onclick={handleCancel}>
            {$t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!hasChanges}>
            {$t('common.create')}
          </Button>
        </div>
      </div>
    </form>
  </div>
</AppPageScaffold>
