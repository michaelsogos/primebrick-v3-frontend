<script lang="ts">
  import { page } from '$app/state';
  import { browser } from '$app/environment';
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import FormPageLayout from '$lib/components/FormPageLayout.svelte';
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
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { cn } from '$lib/utils';
  import { avatarFallbackChromeClasses, getContrastTextColor } from '$lib/avatar-chrome-palette';
  import * as ColorPicker from '$lib/components/ui/color-picker';
  import * as Popover from '$lib/components/ui/popover';
  import Select from '$lib/components/ui/select/select.svelte';
  import MultiSelect from '$lib/components/ui/multi-select/multi-select.svelte';
  import type { AuditField } from '$lib/composables/useAuditBox';

  const SYNC_CHANNEL_NAME = 'primebrick_users_sync';
  let syncChannel: BroadcastChannel | null = null;

  // Generate random hex color
  function generateRandomColor(): string {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  // Get or generate initial avatar color (persisted in sessionStorage for refresh)
  function getInitialAvatarColor(): string {
    if (!browser) return '#4f46e5'; // Fallback for SSR
    const storageKey = 'pb:user-create:avatar-color';
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      return stored;
    }
    const randomColor = generateRandomColor();
    sessionStorage.setItem(storageKey, randomColor);
    return randomColor;
  }

  // Clear persisted color on successful creation
  function clearPersistedAvatarColor() {
    if (!browser) return;
    sessionStorage.removeItem('pb:user-create:avatar-color');
  }

  // Custom refinement to ensure strings start and end with alphanumeric characters
  function startsAndEndsWithAlphanumeric(value: string): boolean {
    if (!value || value.length === 0) return true;
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
    idpUsername: z.string()
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
    roles: z.array(z.string()).default([]),
    avatar_color: z.string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional()
      .or(z.literal(''))
      .default(getInitialAvatarColor()),
    idp_org: z.string()
      .optional()
      .or(z.literal('')),
    is_active: z.boolean().default(false),
    is_admin: z.boolean().default(false),
    is_verified: z.boolean().default(false),
    email_verified: z.boolean().default(false),
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
          username: updateForm.data.idpUsername,
          password: updateForm.data.password,
          display_name: updateForm.data.display_name || undefined,
          email: updateForm.data.email || undefined,
          roles: updateForm.data.roles || [],
          avatar_color: updateForm.data.avatar_color || undefined,
          idp_org: updateForm.data.idp_org || undefined,
          is_active: updateForm.data.is_active,
          is_admin: updateForm.data.is_admin,
          is_verified: updateForm.data.is_verified,
          email_verified: updateForm.data.email_verified,
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

        // Clear persisted avatar color after successful creation
        clearPersistedAvatarColor();

        notifyParentRefresh();
        reset({ data: $form });
        await goto(`/system/settings/users/${data.profile?.uuid}`);
      } catch (error) {
        console.error('Failed to create user:', error);
        cancel();
      }
    },
  });

  const { form, errors, enhance, tainted, reset, isTainted } = superFormObj;

  const hasChanges = $derived(isTainted($tainted));

  // Derived values for avatar preview
  const userAvatarSeed = $derived.by(() => {
    if (!$form.display_name) return "??";
    const words = $form.display_name
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    if (words.length === 0) return "??";
    const firstLetter = words[0][0].toUpperCase();
    if (words.length > 1) {
      const lastLetter = words[words.length - 1][0].toUpperCase();
      return firstLetter + lastLetter;
    } else {
      return words[0].slice(0, 2).toUpperCase() || firstLetter;
    }
  });

  const avatarChromeFallbackClass = $derived(
    avatarFallbackChromeClasses(userAvatarSeed),
  );

  // Derived values for IDP fields
  const idpCode = $derived(''); // Not used anymore - removed from form

  // Audit data state
  let meta = $state<{ auditingColumns?: AuditField[] } | null>(null);
  let isCreatePage = $state(true);

  const auditData = $derived({
    uuid: '',
    version: 0,
    created_at: '',
    created_by: '',
    created_by_name: '',
    updated_at: '',
    updated_by: '',
    updated_by_name: '',
    deleted_at: '',
    deleted_by: '',
    deleted_by_name: '',
    last_synced_at: ''
  });

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

<FormPageLayout
  entity="user_profiles"
  rowUuid=""
  meta={meta || undefined}
  auditData={auditData}
  auditingColumns={meta?.auditingColumns || []}
  isCreatePage={isCreatePage}
>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings/profile' },
          { label: $t('shell.settings.users.create.title') }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.users.create.title')}</h1>
    </div>
  {/snippet}

  {#snippet children()}
    <div class="flex-1 overflow-auto">
      <form id="user-create-form" use:enhance>
        <!-- Avatar Section -->
        <div class="p-4 border-b">
          <div class="space-y-4">
            <!-- Avatar with displayname and email -->
            <div class="flex items-center gap-4">
              <Avatar class="size-14 rounded-none avatar-hex">
                <AvatarFallback
                  class={cn(
                    "rounded-none text-2xl font-semibold",
                    $form.avatar_color ? "" : avatarChromeFallbackClass,
                  )}
                  style={$form.avatar_color
                    ? `background-color: ${$form.avatar_color}; color: ${getContrastTextColor($form.avatar_color)};`
                    : ""}
                >
                  {userAvatarSeed}
                </AvatarFallback>
              </Avatar>
              <div class="flex-1">
                <p class="font-medium">
                  {$form.display_name || $t('shell.settings.users.create.displayNamePlaceholder')}
                </p>
                <p class="text-sm text-muted-foreground">
                  {$form.email || $t('shell.settings.users.create.emailPlaceholder')}
                </p>
              </div>
            </div>

            <!-- Color Picker -->
            <div>
              <label
                for="avatar-color-trigger"
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {$t('shell.settings.users.create.avatarColor')}
              </label>
              <div class="mt-2">
                <Popover.Root>
                  <Popover.Trigger>
                    {#snippet child({ props })}
                      <Button {...props} variant="outline" id="avatar-color-trigger">
                        <div class="flex items-center gap-4">
                          <div
                            class="w-5 h-5 rounded-full border shadow-sm"
                            style="background-color: {$form.avatar_color};"
                          ></div>
                          {$form.avatar_color}
                        </div>
                      </Button>
                    {/snippet}
                  </Popover.Trigger>
                  <Popover.Content class="w-auto p-0">
                    <div class="p-3">
                      <ColorPicker.Root bind:value={$form.avatar_color} />
                    </div>
                  </Popover.Content>
                </Popover.Root>
              </div>
            </div>
          </div>
        </div>

        <!-- Two-column form -->
        <div class="grid grid-cols-2 gap-6 p-4">
          <!-- Column 1: Primebrick fields -->
          <div class="space-y-4">
            <FormField form={superFormObj} name="display_name">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.users.create.displayName')}</FormLabel>
                    <Input
                      {...props}
                      bind:value={$form.display_name}
                      placeholder={$t('shell.settings.users.create.displayNamePlaceholder')}
                    />
                    <FormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="email">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.users.create.email')}</FormLabel>
                    <Input
                      {...props}
                      type="email"
                      bind:value={$form.email}
                      placeholder={$t('shell.settings.users.create.emailPlaceholder')}
                    />
                    <FormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="roles">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.users.create.roles')}</FormLabel>
                    <MultiSelect
                      bind:value={$form.roles}
                      options={['Administrators', 'Sales', 'CustomerService', 'HR', 'Ops']}
                      placeholder="Select roles..."
                    />
                    <FormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>
          </div>

          <!-- Column 2: IDP / Casdoor fields -->
          <div class="space-y-4">
            <FormField form={superFormObj} name="idp_org">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.users.create.idpOrg')}</FormLabel>
                    <Select
                      bind:value={$form.idp_org}
                      options={[{ value: 'acme', label: 'Acme', idp_name: 'acme' }]}
                      placeholder="Select organization..."
                    />
                    <FormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="idpUsername">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.users.create.idpUsername')}</FormLabel>
                    <Input
                      {...props}
                      bind:value={$form.idpUsername}
                      placeholder={$t('shell.settings.users.create.usernamePlaceholder')}
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
                    <FormLabel for={props.id}>{$t('shell.settings.users.create.idpPassword')}</FormLabel>
                    <Input
                      {...props}
                      type="password"
                      bind:value={$form.password}
                      placeholder={$t('shell.settings.users.create.passwordPlaceholder')}
                    />
                    <FormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="is_active">
              <FormControl>
                {#snippet children({ props })}
                  <div class="flex items-center space-x-2">
                    <Checkbox {...props} bind:checked={$form.is_active} id="is_active" />
                    <label for="is_active" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {$t('shell.settings.users.create.idpActive')}
                    </label>
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="is_admin">
              <FormControl>
                {#snippet children({ props })}
                  <div class="flex items-center space-x-2">
                    <Checkbox {...props} bind:checked={$form.is_admin} id="is_admin" />
                    <label for="is_admin" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {$t('shell.settings.users.create.idpAdmin')}
                    </label>
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="is_verified">
              <FormControl>
                {#snippet children({ props })}
                  <div class="flex items-center space-x-2">
                    <Checkbox {...props} bind:checked={$form.is_verified} id="is_verified" />
                    <label for="is_verified" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {$t('shell.settings.users.create.idpVerified')}
                    </label>
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="email_verified">
              <FormControl>
                {#snippet children({ props })}
                  <div class="flex items-center space-x-2">
                    <Checkbox {...props} bind:checked={$form.email_verified} id="email_verified" />
                    <label for="email_verified" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {$t('shell.settings.users.create.idpEmailVerified')}
                    </label>
                  </div>
                {/snippet}
              </FormControl>
            </FormField>
          </div>
        </div>
      </form>
    </div>
  {/snippet}

  {#snippet footerActions()}
    <div class="flex gap-2">
      <Button variant="outline" onclick={handleCancel}>
        {$t('common.cancel')}
      </Button>
      <Button type="submit" form="user-create-form" disabled={!hasChanges}>
        {$t('common.create')}
      </Button>
    </div>
  {/snippet}
</FormPageLayout>
