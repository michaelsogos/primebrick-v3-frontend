<script lang="ts">
  import { page } from '$app/state';
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { cn } from '$lib/utils';
  import { avatarFallbackChromeClasses, getContrastTextColor } from '$lib/avatar-chrome-palette';
  import * as ColorPicker from '$lib/components/ui/color-picker';
  import * as Popover from '$lib/components/ui/popover';
  import MultiSelect from '$lib/components/ui/multi-select/multi-select.svelte';
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

  const uuid = $derived(page.params.uuid);

  const SYNC_CHANNEL_NAME = 'primebrick_users_sync';
  let syncChannel: BroadcastChannel | null = null;

  onMount(() => {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    void loadMeta();
    void loadUser();

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
    display_name: z.string().min(2, { message: 'validation.tooShort' }),
    email: z.string()
      .email({ message: 'validation.invalidUrl' })
      .max(320, { message: 'validation.tooLong' })
      .optional()
      .or(z.literal('')),
    roles: z.array(z.string()).default([]),
    avatar_color: z.string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
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

  // Superforms in SPA mode
  const superFormObj = superForm(defaults(zod4(updateSchema)), {
    SPA: true,
    validators: zod4(updateSchema),
    validationMethod: 'oninput',
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
          { label: $t('shell.settings.title'), href: '/system/settings/profile' },
          { label: $t('shell.settings.users.update.title') }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{pageTitle || $t('shell.settings.users.update.title')}</h1>
    </div>
  {/snippet}

  {#snippet children()}
    {#if loading}
      <div class="flex items-center justify-center py-12">
        <div class="text-muted-foreground">Loading...</div>
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
                  Avatar Color
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
                            {$form.avatar_color || 'Select color'}
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
                      <FormLabel for={props.id}>Display Name</FormLabel>
                      <Input
                        {...props}
                        bind:value={$form.display_name}
                        placeholder="Display name"
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
                      <FormLabel for={props.id}>Email</FormLabel>
                      <Input
                        {...props}
                        type="email"
                        bind:value={$form.email}
                        placeholder="email@example.com"
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
                      <FormLabel for={props.id}>Roles</FormLabel>
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

            <!-- Column 2: IDP fields (readonly) -->
            <div class="space-y-4">
              <div class="space-y-2">
                <label for="idp-code" class="text-sm font-medium">IDP Code</label>
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
                <label for="idp-org" class="text-sm font-medium">IDP Organization</label>
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
                <label for="idp-username" class="text-sm font-medium">IDP Username</label>
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
                <label for="issuer" class="text-sm font-medium">Issuer</label>
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
                <Checkbox checked={user?.is_active === true} disabled id="is-active" />
                <label for="is-active" class="text-sm font-medium">Is Active</label>
              </div>

              <div class="flex items-center space-x-2">
                <Checkbox checked={user?.is_admin === true} disabled id="is-admin" />
                <label for="is-admin" class="text-sm font-medium">Is Admin</label>
              </div>

              <div class="flex items-center space-x-2">
                <Checkbox checked={user?.is_verified === true} disabled id="is-verified" />
                <label for="is-verified" class="text-sm font-medium">Is Verified</label>
              </div>

              <div class="flex items-center space-x-2">
                <Checkbox checked={user?.email_verified === true} disabled id="email-verified" />
                <label for="email-verified" class="text-sm font-medium">Email Verified</label>
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
      <Button type="submit" form="user-update-form" disabled={!hasChanges}>
        {$t('common.save')}
      </Button>
    </div>
  {/snippet}
</FormPageLayout>
