<script lang="ts">
  import { page } from '$app/state';
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
    username: z.string().optional(),
    display_name: z.string().min(2, { message: 'validation.tooShort' }),
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

  type UpdateForm = z.infer<typeof updateSchema>;

  let user = $state<{
    uuid: string;
    username: string;
    display_name?: string;
    email?: string;
    roles?: string[];
    avatar_initials?: string;
    is_active?: boolean;
    is_admin?: boolean;
    is_verified?: boolean;
    version: number;
    created_at?: string;
    created_by?: string;
    created_by_name?: string;
    updated_at?: string;
    updated_by?: string;
    updated_by_name?: string;
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
        const body = {
          display_name: updateForm.data.display_name,
          email: updateForm.data.email || undefined,
          roles: updateForm.data.roles ? updateForm.data.roles.split(',').map(r => r.trim()) : [],
          avatar_initials: updateForm.data.avatar_initials || undefined,
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
        if (data.success) {
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
          username: data.username || '',
          display_name: data.display_name || '',
          email: data.email || '',
          roles: data.roles?.join(', ') || '',
          avatar_initials: data.avatar_initials || '',
        },
      });
      if (meta?.updatePageTitle && user) {
        pageTitle = interpolateTemplate(meta.updatePageTitle, user);
      } else {
        pageTitle = user?.display_name || user?.username || '';
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
      last_synced_at: (user as any).last_synced_at
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
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key)
          })
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
      <div class="flex-1 overflow-auto p-4">
        <form id="user-update-form" use:enhance>
          <div class="grid grid-cols-2 gap-6">
            <!-- Column 1 -->
            <div class="space-y-4">
              <!-- Username (read-only) -->
              <FormField form={superFormObj} name="username">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t('shell.settings.users.update.username')}</FormLabel>
                      <Input
                        type="text"
                        value={user.username}
                        disabled
                        {...props}
                      />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <!-- Display Name -->
              <FormField form={superFormObj} name="display_name">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t('shell.settings.users.update.displayName')}</FormLabel>
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

              <!-- Email -->
              <FormField form={superFormObj} name="email">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t('shell.settings.users.update.email')}</FormLabel>
                      <Input
                        {...props}
                        bind:value={$form.email}
                        type="email"
                        placeholder={$t('shell.settings.users.update.emailPlaceholder')}
                      />
                      <TranslatedFormFieldErrors />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>
            </div>

            <!-- Column 2 -->
            <div class="space-y-4">
              <!-- Roles -->
              <FormField form={superFormObj} name="roles">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t('shell.settings.users.update.roles')}</FormLabel>
                      <Input
                        {...props}
                        bind:value={$form.roles}
                        type="text"
                        placeholder={$t('shell.settings.users.update.rolesPlaceholder')}
                      />
                      <TranslatedFormFieldErrors />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <!-- Avatar Initials -->
              <FormField form={superFormObj} name="avatar_initials">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t('shell.settings.users.update.avatarInitials')}</FormLabel>
                      <Input
                        {...props}
                        bind:value={$form.avatar_initials}
                        type="text"
                        placeholder={$t('shell.settings.users.update.avatarInitialsPlaceholder')}
                      />
                      <TranslatedFormFieldErrors />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>
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
