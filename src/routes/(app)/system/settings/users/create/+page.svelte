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
  import ImageOff from '@lucide/svelte/icons/image-off';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import FormLabelWithPriorityHelp from '$lib/components/forms/FormLabelWithPriorityHelp.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { cn } from '$lib/utils';
  import { avatarFallbackChromeClasses, getContrastTextColor } from '$lib/avatar-chrome-palette';
  import * as ColorPicker from '$lib/components/ui/color-picker';
  import * as Popover from '$lib/components/ui/popover';
  import { ComboSelect } from '$lib/components/ui/combo-select';
  import AsyncValidatedInput from '$lib/components/ui/input/async-validated-input.svelte';
  import { ValidationResult, type ValidationStatus } from '$lib/types/validation';
  import { minMsg, maxMsg } from '$lib/validation/zod-messages';
  import * as Password from '$lib/components/ui/password';
  import PasswordChecklist from '$lib/components/forms/PasswordChecklist.svelte';
  import type { EntityMetadata } from '$lib/composables/useEntityMetadata.svelte';
  import { useEntityMetadata } from '$lib/composables/useEntityMetadata.svelte';

  const SYNC_CHANNEL_NAME = 'primebrick_users_sync';
  let syncChannel: BroadcastChannel | null = null;

  let availableRoles: { idp_role: string; label_key?: string; permissions?: string[] }[] = $state([]);

  // Organization dropdown — fetched from API (Section 10)
  let availableOrgs = $state<Array<{ uuid: string; idp_code: string; idp_name: string; display_name: string; avatar: string | null }>>([]);
  let orgsLoading = $state(true);

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
    void entityMetadata.loadMetadata();

    void (async () => {
      try {
        const res = await apiFetch('/api/v1/system/roles/active');
        if (res.ok) {
          const data = await res.json();
          availableRoles = (data.roles ?? []) as { idp_role: string; label_key?: string; permissions?: string[] }[];
        }
      } catch (e) {
        console.error('Failed to load roles', e);
      }
    })();

    void (async () => {
      try {
        const res = await apiFetch('/api/v1/system/organizations/active');
        if (res.ok) {
          const data = await res.json();
          availableOrgs = data.organizations ?? [];
        }
      } catch (e) {
        console.error('Failed to load active organizations:', e);
      } finally {
        orgsLoading = false;
      }
    })();

    // Clear tainting and errors caused by component initialization (ComboSelect setting initial value).
    // Without this, roles is pre-tainted and shows errors when other fields are blurred with validationMethod: 'onblur'.
    tainted.set(undefined);
    errors.set({});

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
      .min(3, { message: minMsg(3) })
      .max(255, { message: maxMsg(255) })
      .refine(startsAndEndsWithAlphanumeric, { message: 'validation.invalidFormat' }),
    password: z.string()
      .min(8, { message: minMsg(8) })
      .max(255, { message: maxMsg(255) }),
    display_name: z.string()
      .min(3, { message: minMsg(3) })
      .max(255, { message: maxMsg(255) }),
    email: z.string()
      .email({ message: 'validation.invalidEmail' })
      .max(320, { message: maxMsg(320) })
      .optional()
      .or(z.literal('')),
    roles: z.array(z.string()).min(1, { message: 'validation.rolesRequired' }).default([]),
    avatar_color: z.string()
      .regex(/^#[0-9A-Fa-f]{6}$/, { message: 'validation.invalidFormat' })
      .optional()
      .or(z.literal(''))
      .default(getInitialAvatarColor()),
    idp_org: z.string()
      .min(1, { message: 'validation.orgRequired' }),
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
    validationMethod: 'onblur',
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

  // canSave: form must have changes AND no validation errors
  const canSave = $derived.by(() => {
    if (!hasChanges) return false;
    // Check all errors are empty
    for (const key in $errors) {
      const err = ($errors as Record<string, string | string[] | undefined>)[key];
      if (err && (Array.isArray(err) ? err.length > 0 : true)) return false;
    }
    return true;
  });

  // Username async validation (Section 11)
  // The username field is disabled until an org is selected — the availability check is org-scoped.
  const isUsernameEnabled = $derived(!!$form.idp_org);

  let usernameValidationStatus = $state<ValidationStatus>('idle');
  let hasAsyncError = $derived(usernameValidationStatus === 'not-valid');

  function handleUsernameStatusChange(status: ValidationStatus) {
    usernameValidationStatus = status;
  }

  // Reset username when org changes — the old username may be available/taken in a different org scope
  function onOrgChange(newOrg: string | string[]) {
    $form.idp_org = Array.isArray(newOrg) ? newOrg[0] ?? '' : newOrg;
    $form.idpUsername = '';
    usernameValidationStatus = 'idle';
  }

  async function checkUsernameAvailability(username: string): Promise<ValidationResult> {
    const idpOrg = $form.idp_org;
    if (!idpOrg) return ValidationResult.ERROR_API;

    try {
      const params = new URLSearchParams({ username, idp_org: idpOrg });
      const response = await apiFetch(`/api/v1/auth/users/check-username?${params.toString()}`);
      if (!response.ok) return ValidationResult.ERROR_API;
      const data = await response.json();
      return data.available === true ? ValidationResult.VALID : ValidationResult.NOT_VALID;
    } catch (error) {
      console.error('Error checking username availability:', error);
      return ValidationResult.ERROR_API;
    }
  }

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
  let meta = $state<EntityMetadata | null>(null);
  let isCreatePage = $state(true);

  const entityMetadata = useEntityMetadata({
    endpoint: '/api/v1/entities/user_profiles/meta',
    entityName: 'user_profiles'
  });

  // Sync composable meta into local meta state for FormPageLayout
  $effect(() => {
    if (entityMetadata.state.meta) {
      meta = entityMetadata.state.meta as EntityMetadata;
    }
  });

  function getColMeta(key: string) {
    return meta?.list?.columns?.find((c) => c.key === key);
  }

  const auditData = $derived({
    uuid: '',
    version: 0,
    created_at: undefined,
    created_by: undefined,
    created_by_name: undefined,
    updated_at: undefined,
    updated_by: undefined,
    updated_by_name: undefined,
    deleted_at: undefined,
    deleted_by: undefined,
    deleted_by_name: undefined,
    last_synced_at: undefined
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
  auditingColumns={meta?.list?.auditingColumns || []}
  isCreatePage={isCreatePage}
>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings' },
          settingsTabMenuSegment({ pathname: page.url.pathname, searchParams: page.url.searchParams, t: $t }),
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
                    <FormLabel for={props.id} required>{$t('shell.settings.users.create.displayName')}</FormLabel>
                    <Input
                      {...props}
                      bind:value={$form.display_name}
                      placeholder={$t('shell.settings.users.create.displayNamePlaceholder')}
                    />
                    <TranslatedFormFieldErrors />
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
                    <TranslatedFormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="roles">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id} required>{$t('shell.settings.users.create.roles')}</FormLabel>
                    <ComboSelect
                      {...props}
                      mode="multi"
                      bind:value={$form.roles}
                      options={availableRoles.length > 0 ? availableRoles : [
                        { idp_role: 'administrators' },
                        { idp_role: 'sales' },
                        { idp_role: 'customer_service' },
                        { idp_role: 'hr' },
                        { idp_role: 'ops' },
                      ]}
                      valueField="idp_role"
                      labelField="label_key"
                      isLabelTranslated={true}
                      placeholder={$t('shell.settings.users.create.rolesPlaceholder')}
                    >
                      {#snippet itemSnippet({ option, resolvedLabel }: { option: string | Record<string, any>; selected: boolean; resolvedLabel: string; resolvedValue: string })}
                        {@const role = option as Record<string, any>}
                        <div class="flex flex-col min-w-0 flex-1">
                          <span class="font-medium truncate">{resolvedLabel}</span>
                          {#if role.permissions && Array.isArray(role.permissions) && role.permissions.length > 0}
                            <span class="italic text-muted-foreground text-xs truncate">{role.permissions.join(', ')}</span>
                          {/if}
                        </div>
                      {/snippet}
                    </ComboSelect>
                    <TranslatedFormFieldErrors />
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
                    <FormLabel for={props.id} required>{$t('shell.settings.users.create.idpOrg')}</FormLabel>
                    <ComboSelect
                      mode="single"
                      bind:value={$form.idp_org}
                      options={availableOrgs}
                      valueField="idp_name"
                      labelField="display_name"
                      loading={orgsLoading}
                      placeholder={$t('shell.settings.users.create.idpOrgPlaceholder')}
                      onChange={onOrgChange}
                      searchPlaceholder={$t('shell.settings.users.create.idpOrgSearch')}
                    >
                      {#snippet itemSnippet({ option, resolvedLabel }: { option: string | Record<string, any>; selected: boolean; resolvedLabel: string; resolvedValue: string })}
                        {@const org = option as Record<string, any>}
                        <Avatar class="size-10 rounded-none shrink-0">
                          {#if org.avatar}
                            <img src={org.avatar} alt={org.display_name} class="size-10 rounded-none object-cover" />
                          {:else}
                            <AvatarFallback class="rounded-none flex items-center justify-center">
                              <ImageOff class="size-4 text-muted-foreground" />
                            </AvatarFallback>
                          {/if}
                        </Avatar>
                        <div class="flex flex-col min-w-0 flex-1">
                          <span class="font-medium truncate">{resolvedLabel}</span>
                          <span class="text-xs text-muted-foreground truncate">{org.idp_name}</span>
                        </div>
                      {/snippet}
                    </ComboSelect>
                    <TranslatedFormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="idpUsername">
              <FormControl>
                {#snippet children({ props })}
                  {@const hasZodError = props['aria-invalid'] === 'true' || props['aria-invalid'] === true}
                  <div class="space-y-2">
                    <FormLabel for={props.id} required>{$t('shell.settings.users.create.idpUsername')}</FormLabel>
                    <AsyncValidatedInput
                      {...props}
                      bind:value={$form.idpUsername}
                      validateFn={checkUsernameAvailability}
                      placeholder={isUsernameEnabled
                        ? $t('shell.settings.users.create.usernamePlaceholder')
                        : $t('shell.settings.users.create.usernameDisabledPlaceholder')}
                      onStatusChange={handleUsernameStatusChange}
                      externalInvalid={hasZodError}
                      disabled={!isUsernameEnabled}
                      aria-invalid={hasAsyncError ? true : props['aria-invalid']}
                      data-fs-error={hasAsyncError ? 'true' : props['data-fs-error']}
                    />
                    {#if !isUsernameEnabled}
                      <p class="text-info text-xs">{$t('shell.settings.users.create.usernameSelectOrgFirst')}</p>
                    {/if}
                    <TranslatedFormFieldErrors />
                    {#if hasAsyncError && !hasZodError}
                      <div class="text-destructive text-xs font-medium">
                        {$t('validation.nameTaken')}
                      </div>
                    {/if}
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="password">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id} required>{$t('shell.settings.users.create.idpPassword')}</FormLabel>
                    <Password.Root>
                      <Password.Input
                        {...props}
                        bind:value={$form.password}
                        placeholder={$t('shell.settings.users.create.passwordPlaceholder')}
                        autocomplete="new-password"
                      >
                        <Password.ToggleVisibility />
                      </Password.Input>
                    </Password.Root>
                    <TranslatedFormFieldErrors />
                    <PasswordChecklist password={$form.password} />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="is_admin">
              <FormControl>
                {#snippet children({ props })}
                  <div class="flex items-center space-x-2">
                    <Checkbox {...props} bind:checked={$form.is_admin} id="is_admin" />
                    <label for="is_admin" class="inline-flex items-center gap-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {$t('shell.settings.users.create.idpAdmin')}
                      {#if getColMeta('is_admin')?.tooltip && getColMeta('is_admin')?.showFormTooltip !== false}
                        <FormLabelWithPriorityHelp
                          text={$t(getColMeta('is_admin')!.tooltip!)}
                          priority={getColMeta('is_admin')?.tooltipPriority}
                          title={getColMeta('is_admin')?.tooltipTitle ? $t(getColMeta('is_admin')!.tooltipTitle!) : undefined}
                        />
                      {/if}
                    </label>
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

            <FormField form={superFormObj} name="is_verified">
              <FormControl>
                {#snippet children({ props })}
                  <div class="flex items-center space-x-2">
                    <Checkbox {...props} bind:checked={$form.is_verified} id="is_verified" />
                    <label for="is_verified" class="inline-flex items-center gap-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {$t('shell.settings.users.create.idpVerified')}
                      {#if getColMeta('is_verified')?.tooltip && getColMeta('is_verified')?.showFormTooltip !== false}
                        <FormLabelWithPriorityHelp
                          text={$t(getColMeta('is_verified')!.tooltip!)}
                          priority={getColMeta('is_verified')?.tooltipPriority}
                          title={getColMeta('is_verified')?.tooltipTitle ? $t(getColMeta('is_verified')!.tooltipTitle!) : undefined}
                        />
                      {/if}
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
                    <label for="email_verified" class="inline-flex items-center gap-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {$t('shell.settings.users.create.idpEmailVerified')}
                      {#if getColMeta('email_verified')?.tooltip && getColMeta('email_verified')?.showFormTooltip !== false}
                        <FormLabelWithPriorityHelp
                          text={$t(getColMeta('email_verified')!.tooltip!)}
                          priority={getColMeta('email_verified')?.tooltipPriority}
                          title={getColMeta('email_verified')?.tooltipTitle ? $t(getColMeta('email_verified')!.tooltipTitle!) : undefined}
                        />
                      {/if}
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
      <Button type="submit" form="user-create-form" disabled={!canSave}>
        {$t('common.save')}
      </Button>
    </div>
  {/snippet}
</FormPageLayout>
