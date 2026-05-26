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
  import { beforeNavigate } from '$app/navigation';
  import { settingsTabMenuSegment } from '$lib/shell/crm-breadcrumb';
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { interpolateTemplate } from '$lib/template-interpolate';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import VersionHistoryPanel from '$lib/entity-list/sheets/panels/VersionHistoryPanel.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { CopyButton } from '$lib/components/ui/copy-button';

  const uuid = $derived(page.params.uuid);

  const SYNC_CHANNEL_NAME = 'primebrick_users_sync';
  let syncChannel: BroadcastChannel | null = null;

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

  // Zod schema for user update form
  const updateSchema = z.object({
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

  let meta = $state<{ updatePageTitle?: string } | null>(null);
  let pageTitle = $state('');
  let loading = $state(true);

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
  let auditInfo = $state({
    uuid: '',
    version: 0,
    createdAt: '',
    createdBy: '',
    createdByName: '',
    updatedAt: '',
    updatedBy: '',
    updatedByName: '',
    hasAudit: false
  });

  $effect(() => {
    if (user) {
      auditInfo.uuid = user.uuid;
      auditInfo.version = user.version;
      auditInfo.createdAt = user.created_at ? formatUiDateTime(user.created_at, $uiLang) : '';
      auditInfo.createdBy = user.created_by || '-';
      auditInfo.createdByName = user.created_by_name || '-';
      auditInfo.updatedAt = user.updated_at ? formatUiDateTime(user.updated_at, $uiLang) : '';
      auditInfo.updatedBy = user.updated_by || '-';
      auditInfo.updatedByName = user.updated_by_name || '-';
      auditInfo.hasAudit = !!(user.created_at || user.updated_at);
    }
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

  loadMeta();
  loadUser();
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
      <h1 class="truncate text-xl font-semibold leading-tight">{pageTitle || $t('shell.settings.users.update.title')}</h1>
    </div>
  {/snippet}

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <div class="text-muted-foreground">Loading...</div>
    </div>
  {:else if user}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left: Form (60%) -->
      <div class="lg:col-span-2 space-y-6">
        <form id="user-update-form" method="POST" use:enhance>
          <div class="space-y-6">
            <!-- Username (read-only) -->
            <div class="space-y-2">
              <FormLabel>{$t('shell.settings.users.update.username')}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  value={user.username}
                  disabled
                />
              </FormControl>
            </div>

            <!-- Display Name -->
            <FormField form={superFormObj} name="display_name">
              <FormLabel>{$t('shell.settings.users.update.displayName')}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder={$t('shell.settings.users.update.displayNamePlaceholder')}
                />
              </FormControl>
              <FormFieldErrors />
            </FormField>

            <!-- Email -->
            <FormField form={superFormObj} name="email">
              <FormLabel>{$t('shell.settings.users.update.email')}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder={$t('shell.settings.users.update.emailPlaceholder')}
                />
              </FormControl>
              <FormFieldErrors />
            </FormField>

            <!-- Avatar Initials -->
            <FormField form={superFormObj} name="avatar_initials">
              <FormLabel>{$t('shell.settings.users.update.avatarInitials')}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder={$t('shell.settings.users.update.avatarInitialsPlaceholder')}
                  maxlength={4}
                />
              </FormControl>
              <FormFieldErrors />
            </FormField>

            <!-- Roles -->
            <FormField form={superFormObj} name="roles">
              <FormLabel>{$t('shell.settings.users.update.roles')}</FormLabel>
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

            <!-- Status badges -->
            <div class="flex gap-2">
              {#if user.is_active}
                <Badge variant="default">Active</Badge>
              {/if}
              {#if user.is_admin}
                <Badge variant="secondary">Admin</Badge>
              {/if}
              {#if user.is_verified}
                <Badge variant="outline">Verified</Badge>
              {/if}
            </div>
          </div>
        </form>
      </div>

      <!-- Right: Audit info (40%) -->
      <div class="space-y-6">
        {#if auditInfo.hasAudit}
          <div class="space-y-4">
            <h3 class="text-sm font-medium">{$t('common.auditInfo')}</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">{$t('common.uuid')}</span>
                <span class="font-mono text-xs">{auditInfo.uuid}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">{$t('common.version')}</span>
                <span>{auditInfo.version}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">{$t('common.createdAt')}</span>
                <span>{auditInfo.createdAt}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">{$t('common.createdBy')}</span>
                <span>{auditInfo.createdByName || auditInfo.createdBy}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">{$t('common.updatedAt')}</span>
                <span>{auditInfo.updatedAt}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">{$t('common.updatedBy')}</span>
                <span>{auditInfo.updatedByName || auditInfo.updatedBy}</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- Actions -->
        <div class="flex gap-2">
          <Button variant="outline" onclick={handleCancel}>
            {$t('common.cancel')}
          </Button>
          <Button type="submit" form="user-update-form" disabled={!hasChanges}>
            {$t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  {/if}
</AppPageScaffold>
