<script lang="ts">
  import { page } from '$app/state';
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import FormLabelWithPriorityHelp from '$lib/components/forms/FormLabelWithPriorityHelp.svelte';
  import { cn } from '$lib/utils';
  import { avatarFallbackChromeClasses, getContrastTextColor } from '$lib/avatar-chrome-palette';
  import * as ColorPicker from '$lib/components/ui/color-picker';
  import * as Popover from '$lib/components/ui/popover';
  import { ComboSelect } from '$lib/components/ui/combo-select';
  import { CopyButton } from '$lib/components/ui/copy-button';
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
  import { beforeNavigate } from '$app/navigation';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { interpolateTemplate } from '$lib/template-interpolate';
  import type { EntityMetadata } from '$lib/composables/useEntityMetadata.svelte';
  import { minMsg, maxMsg } from '$lib/validation/zod-messages';
  import ShieldUser from '@lucide/svelte/icons/shield-user';
  import ShieldOff from '@lucide/svelte/icons/shield-off';

  const uuid = $derived(page.params.uuid);

  const SYNC_CHANNEL_NAME = 'primebrick_users_sync';
  let syncChannel: BroadcastChannel | null = null;

  let availableRoles: { idp_role: string; label_key?: string; permissions?: string[]; is_admin?: boolean }[] = $state([]);

  onMount(() => {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    void loadMeta();
    void loadUser();

    void (async () => {
      try {
        const res = await apiFetch('/api/v1/system/roles/active');
        if (res.ok) {
          const data = await res.json();
          availableRoles = (data.roles ?? []) as { idp_role: string; label_key?: string; permissions?: string[]; is_admin?: boolean }[];
        }
      } catch (e) {
        console.error('Failed to load roles', e);
      }
    })();

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

  // Zod schema for user update form
  const updateSchema = z.object({
    display_name: z.string().min(3, { message: minMsg(3) }),
    email: z.string()
      .email({ message: 'validation.invalidEmail' })
      .max(320, { message: maxMsg(320) })
      .optional()
      .or(z.literal('')),
    roles: z.array(z.string()).min(1, { message: 'validation.rolesRequired' }).default([]),
    avatar_color: z.string()
      .regex(/^#[0-9A-Fa-f]{6}$/, { message: 'validation.invalidFormat' })
      .optional()
      .or(z.literal('')),
  });

  type UpdateForm = z.infer<typeof updateSchema>;

  let user = $state<{
    uuid: string;
    idp_code: string;
    idp_org?: string;
    idp_username?: string;
    display_name?: string;
    email?: string;
    avatar_color?: string;
    avatar_initials?: string;
    roles?: string[];
    is_active?: boolean;
    is_admin?: boolean;
    is_verified?: boolean;
    email_verified?: boolean;
    issuer?: string;
    version: number;
    created_at?: string;
    created_by?: string;
    created_by_name?: string;
    updated_at?: string;
    updated_by?: string;
    updated_by_name?: string;
    last_synced_at?: string;
  } | null>(null);

  let meta = $state<EntityMetadata | null>(null);
  let pageTitle = $state('');
  let loading = $state(true);
  let isCreatePage = $state(false);

  function getColMeta(key: string) {
    return meta?.list?.columns?.find((c) => c.key === key);
  }

  // Superforms in SPA mode
  const superFormObj = superForm(defaults(zod4(updateSchema)), {
    SPA: true,
    validators: zod4(updateSchema),
    validationMethod: 'onblur',
    invalidateAll: false,
    resetForm: false,
    async onUpdate({ form: updateForm, cancel }) {
      if (!updateForm.valid) return;

      try {
        // Calculate avatar initials from display_name (like CREATE/PROFILE)
        const initials = updateForm.data.display_name 
          ? updateForm.data.display_name
              .trim()
              .split(/\s+/)
              .filter((w) => w.length > 0)
              .map((w, i, arr) => {
                if (arr.length > 1 && i === arr.length - 1) {
                  return w[0].toUpperCase();
                }
                if (i === 0) {
                  return w[0].toUpperCase();
                }
                return '';
              })
              .join('')
              .slice(0, 2)
          : '??';

        const body = {
          display_name: updateForm.data.display_name,
          email: updateForm.data.email || undefined,
          avatar_color: updateForm.data.avatar_color || undefined,
          avatar_initials: initials,
          roles: updateForm.data.roles || [],
        };
        const response = await apiFetch(`/api/v1/entities/user_profiles/${uuid}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          cancel();
          return;
        }

        const data = await response.json();
        if (data) {
          console.log('User updated successfully');
          await loadUser();
          notifyParentRefresh();
          if (window.opener) {
            window.close();
          }
        }
      } catch (error) {
        console.error('Failed to update user:', error);
        cancel();
      }
    },
  });

  const { form, errors, enhance, tainted, reset, isTainted } = superFormObj;

  const hasChanges = $derived(isTainted($tainted));

  // canSave: form must have changes AND no validation errors
  const canSave = $derived.by(() => {
    if (!hasChanges) return false;
    for (const key in $errors) {
      const err = ($errors as Record<string, string | string[] | undefined>)[key];
      if (err && (Array.isArray(err) ? err.length > 0 : true)) return false;
    }
    return true;
  });

  // Derive initials from display_name for preview (same as CREATE/PROFILE)
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

  async function loadUser() {
    loading = true;
    try {
      const response = await apiFetch(`/api/v1/entities/user_profiles/${uuid}`);
      if (!response.ok) {
        console.error('Failed to load user');
        return;
      }
      const data = await response.json();
      user = data;
      reset({
        data: {
          display_name: data.display_name || '',
          email: data.email || '',
          avatar_color: data.avatar_color || '',
          roles: data.roles || [],
        },
      });
      // Clear tainting and errors after reset.
      // reset({ data }) preserves tainting for fields in opts.data, so we must explicitly clear it.
      // Without this, roles is pre-tainted and shows errors when other fields are blurred with validationMethod: 'onblur'.
      tainted.set(undefined);
      errors.set({});
      if (meta?.updatePageTitle && user) {
        pageTitle = interpolateTemplate(meta.updatePageTitle, user);
      } else {
        pageTitle = user?.display_name || user?.idp_username || '';
      }
    } catch (error) {
      console.error('Failed to load user:', error);
    } finally {
      loading = false;
    }
  }

  async function loadMeta() {
    try {
      const response = await apiFetch('/api/v1/entities/user_profiles/meta');
      if (!response.ok) {
        console.error('Failed to load user meta');
        return;
      }
      meta = await response.json();
    } catch (error) {
      console.error('Failed to load meta:', error);
    }
  }

  // Audit state
  const auditData = $derived.by(() => {
    if (!user) return {};
    return {
      uuid: user.uuid,
      version: user.version,
      created_at: user.created_at,
      created_by: user.created_by,
      created_by_name: user.created_by_name,
      updated_at: user.updated_at,
      updated_by: user.updated_by,
      updated_by_name: user.updated_by_name,
      deleted_at: (user as any).deleted_at,
      deleted_by: (user as any).deleted_by,
      deleted_by_name: (user as any).deleted_by_name,
      last_synced_at: user.last_synced_at
    };
  });

  function handleCancel() {
    if (hasChanges) {
      const ok = confirm($t('shell.settings.users.update.unsavedChanges'));
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
      const confirmLeave = confirm($t('shell.settings.users.update.unsavedChanges'));
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
  rowUuid={uuid || ''}
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
          { label: $t('shell.settings.users.update.title') }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{pageTitle || $t('shell.settings.users.update.title')}</h1>
    </div>
  {/snippet}

  {#snippet children()}
    {#if loading}
      <div class="flex items-center justify-center py-12">
        <div class="text-muted-foreground">{$t('common.loading')}</div>
      </div>
    {:else if user}
      <div class="flex-1 overflow-auto">
        <form id="user-update-form" use:enhance>
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
                    {$form.display_name || user?.display_name || ''}
                  </p>
                  <p class="text-sm text-muted-foreground">
                    {$form.email || user?.email || ''}
                  </p>
                </div>
              </div>

              <!-- Color Picker -->
              <div>
                <label
                  for="avatar-color-trigger"
                  class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {$t('shell.settings.users.update.avatarColor')}
                </label>
                <div class="mt-2">
                  <Popover.Root>
                    <Popover.Trigger>
                      {#snippet child({ props })}
                        <Button {...props} variant="outline" id="avatar-color-trigger">
                          <div class="flex items-center gap-4">
                            <div
                              class="w-5 h-5 rounded-full border shadow-sm"
                              style="background-color: {$form.avatar_color || '#000000'};"
                            ></div>
                            {$form.avatar_color || $t('shell.settings.users.update.selectColorPlaceholder')}
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
            <!-- Column 1: Editable Primebrick fields -->
            <div class="space-y-4">
              <FormField form={superFormObj} name="display_name">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id} required>{$t('shell.settings.users.update.displayName')}</FormLabel>
                      <Input
                        {...props}
                        bind:value={$form.display_name}
                        placeholder={$t('shell.settings.users.update.displayNamePlaceholder')}
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
                      <FormLabel for={props.id}>{$t('shell.settings.users.update.email')}</FormLabel>
                      <Input
                        {...props}
                        type="email"
                        bind:value={$form.email}
                        placeholder={$t('shell.settings.users.update.emailPlaceholder')}
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
                      <FormLabel for={props.id} required>{$t('shell.settings.users.update.roles')}</FormLabel>
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
                        placeholder={$t('shell.settings.users.update.rolesPlaceholder')}
                        isOptionDisabled={(opt) => {
                          const role = opt as Record<string, any>;
                          return !role.is_admin && (!role.permissions || !Array.isArray(role.permissions) || role.permissions.length === 0);
                        }}
                      >
                        {#snippet itemSnippet({ option, resolvedLabel }: { option: string | Record<string, any>; selected: boolean; resolvedLabel: string; resolvedValue: string })}
                          {@const role = option as Record<string, any>}
                          <div class="flex flex-col min-w-0 flex-1 gap-0.5">
                            <span class="font-medium truncate">{resolvedLabel}</span>
                            {#if role.is_admin}
                              <Badge variant="outline" class="w-fit gap-1 text-[10px] py-0 px-1.5 text-success border-success/30">
                                <ShieldUser class="size-3" />
                                {$t('roles.systemAdministrator')}
                              </Badge>
                            {:else if role.permissions && Array.isArray(role.permissions) && role.permissions.length > 0}
                              <span class="italic text-muted-foreground text-xs truncate">{role.permissions.join(', ')}</span>
                            {:else}
                              <Badge variant="outline" class="w-fit gap-1 text-[10px] py-0 px-1.5 text-muted-foreground border-muted-foreground/30">
                                <ShieldOff class="size-3" />
                                {$t('roles.notValidRole')}
                              </Badge>
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

            <!-- Column 2: IDP fields (readonly) -->
            <div class="space-y-4">
              <div class="space-y-2">
                <label for="idp-code" class="text-sm font-medium">{$t('shell.settings.users.update.idpCode')}</label>
                <div class="relative">
                  <Input id="idp-code" value={user?.idp_code} readonly class="bg-muted pr-10" />
                  {#if user?.idp_code}
                    <div class="absolute right-2 top-1/2 -translate-y-1/2">
                      <CopyButton text={user.idp_code} variant="ghost" size="icon" class="h-8 w-8" />
                    </div>
                  {/if}
                </div>
              </div>

              <div class="space-y-2">
                <label for="idp-org" class="text-sm font-medium">{$t('shell.settings.users.update.idpOrg')}</label>
                <div class="relative">
                  <Input id="idp-org" value={user?.idp_org} readonly class="bg-muted pr-10" />
                  {#if user?.idp_org}
                    <div class="absolute right-2 top-1/2 -translate-y-1/2">
                      <CopyButton text={user.idp_org} variant="ghost" size="icon" class="h-8 w-8" />
                    </div>
                  {/if}
                </div>
              </div>

              <div class="space-y-2">
                <label for="idp-username" class="text-sm font-medium">{$t('shell.settings.users.update.idpUsername')}</label>
                <div class="relative">
                  <Input id="idp-username" value={user?.idp_username} readonly class="bg-muted pr-10" />
                  {#if user?.idp_username}
                    <div class="absolute right-2 top-1/2 -translate-y-1/2">
                      <CopyButton text={user.idp_username} variant="ghost" size="icon" class="h-8 w-8" />
                    </div>
                  {/if}
                </div>
              </div>

              <div class="space-y-2">
                <label for="issuer" class="text-sm font-medium">{$t('shell.settings.users.update.issuer')}</label>
                <div class="relative">
                  <Input id="issuer" value={user?.issuer} readonly class="bg-muted pr-10" />
                  {#if user?.issuer}
                    <div class="absolute right-2 top-1/2 -translate-y-1/2">
                      <CopyButton text={user.issuer} variant="ghost" size="icon" class="h-8 w-8" />
                    </div>
                  {/if}
                </div>
              </div>

              <!-- Readonly checkboxes -->
              <div class="flex items-center space-x-2">
                <Checkbox checked={user?.is_admin === true} disabled id="is-admin" />
                <label for="is-admin" class="inline-flex items-center gap-1 text-sm font-medium">{$t('shell.settings.users.update.isAdmin')}
                  {#if getColMeta('is_admin')?.tooltip && getColMeta('is_admin')?.showFormTooltip !== false}
                    <FormLabelWithPriorityHelp
                      text={$t(getColMeta('is_admin')!.tooltip!)}
                      priority={getColMeta('is_admin')?.tooltipPriority}
                      title={getColMeta('is_admin')?.tooltipTitle ? $t(getColMeta('is_admin')!.tooltipTitle!) : undefined}
                    />
                  {/if}
                </label>
              </div>

              <div class="flex items-center space-x-2">
                <Checkbox checked={user?.is_active === true} disabled id="is-active" />
                <label for="is-active" class="text-sm font-medium">{$t('shell.settings.users.update.isActive')}</label>
              </div>

              <div class="flex items-center space-x-2">
                <Checkbox checked={user?.is_verified === true} disabled id="is-verified" />
                <label for="is-verified" class="inline-flex items-center gap-1 text-sm font-medium">{$t('shell.settings.users.update.isVerified')}
                  {#if getColMeta('is_verified')?.tooltip && getColMeta('is_verified')?.showFormTooltip !== false}
                    <FormLabelWithPriorityHelp
                      text={$t(getColMeta('is_verified')!.tooltip!)}
                      priority={getColMeta('is_verified')?.tooltipPriority}
                      title={getColMeta('is_verified')?.tooltipTitle ? $t(getColMeta('is_verified')!.tooltipTitle!) : undefined}
                    />
                  {/if}
                </label>
              </div>

              <div class="flex items-center space-x-2">
                <Checkbox checked={user?.email_verified === true} disabled id="email-verified" />
                <label for="email-verified" class="inline-flex items-center gap-1 text-sm font-medium">{$t('shell.settings.users.update.emailVerified')}
                  {#if getColMeta('email_verified')?.tooltip && getColMeta('email_verified')?.showFormTooltip !== false}
                    <FormLabelWithPriorityHelp
                      text={$t(getColMeta('email_verified')!.tooltip!)}
                      priority={getColMeta('email_verified')?.tooltipPriority}
                      title={getColMeta('email_verified')?.tooltipTitle ? $t(getColMeta('email_verified')!.tooltipTitle!) : undefined}
                    />
                  {/if}
                </label>
              </div>
            </div>
          </div>
        </form>
      </div>
    {/if}
  {/snippet}

  {#snippet footerActions()}
    <div class="flex gap-2">
      <Button variant="outline" onclick={handleCancel}>
        {$t('common.cancel')}
      </Button>
      <Button type="submit" form="user-update-form" disabled={!canSave}>
        {$t('common.save')}
      </Button>
    </div>
  {/snippet}
</FormPageLayout>
