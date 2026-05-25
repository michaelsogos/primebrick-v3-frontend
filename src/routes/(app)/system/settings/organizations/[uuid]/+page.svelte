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
  } from '$lib/components/ui/form';
  import { superForm, defaults } from 'sveltekit-superforms';
  import { zod4 } from 'sveltekit-superforms/adapters';
  import { z } from 'zod';
  import { onMount } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import { settingsTabMenuSegment } from '$lib/shell/crm-breadcrumb';
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';

  const uuid = $derived(page.params.uuid);

  const SYNC_CHANNEL_NAME = 'primebrick_organizations_sync';
  let syncChannel: BroadcastChannel | null = $state(null);

  $effect(() => {
    if (!syncChannel) {
      syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    }
    return () => {
      if (syncChannel) {
        syncChannel.close();
        syncChannel = null;
      }
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

  // Zod schema for organization update form
  const updateSchema = z.object({
    uuid: z.string(),
    display_name: z.string().min(1, 'Display name is required'),
    website_url: z.string().url().max(2048).optional().or(z.literal('')),
    idp_owner: z.string().min(1).max(255),
    idp_name: z.string().min(1).max(255),
  });

  type UpdateForm = z.infer<typeof updateSchema>;

  let organization = $state<{
    uuid: string;
    idp_code: string;
    idp_owner?: string;
    idp_name?: string;
    display_name?: string;
    website_url?: string;
    version: number;
    created_at?: string;
    created_by?: string;
    created_by_name?: string;
    updated_at?: string;
    updated_by?: string;
    updated_by_name?: string;
    last_synced_at?: string;
  } | null>(null);

  let loading = $state(true);

  // Superforms in SPA mode
  const superFormObj = superForm(defaults(zod4(updateSchema)), {
    SPA: true,
    validators: zod4(updateSchema),
    invalidateAll: false,
    resetForm: false,
    async onUpdate({ form: updateForm, cancel }) {
      if (!updateForm.valid) return;

      try {
        const body = {
          display_name: updateForm.data.display_name,
          website_url: updateForm.data.website_url || undefined,
        };
        const response = await apiFetch(`/api/v1/entities/organization/${uuid}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Failed to update organization:', errorData);
          cancel();
          return;
        }

        const data = await response.json();
        if (data.success) {
          console.log('Organization updated successfully');
          // Refresh the organization data to show updated audit info
          await loadOrganization();
          // Notify parent window to refresh
          notifyParentRefresh();
        }
      } catch (error) {
        console.error('Failed to update organization:', error);
        cancel();
      }
    },
  });

  const { form, errors, enhance, tainted, reset } = superFormObj;

  const hasChanges = $derived.by(() => {
    const t = $tainted;
    if (!t) return false;
    return Object.values(t).some((v) => v === true);
  });

  async function loadOrganization() {
    loading = true;
    try {
      const response = await apiFetch(`/api/v1/entities/organization/${uuid}`);
      if (!response.ok) {
        console.error('Failed to load organization');
        return;
      }
      const data = await response.json();
      organization = data;
      // Reset form with loaded data
      reset({
        data: {
          uuid: data.uuid,
          display_name: data.display_name || '',
          website_url: data.website_url || '',
          idp_owner: data.idp_owner || data.idp_code?.split('/')[0] || 'admin',
          idp_name: data.idp_name || data.idp_code?.split('/')[1] || data.idp_code || '',
        },
      });
    } catch (error) {
      console.error('Failed to load organization:', error);
    } finally {
      loading = false;
    }
  }

  // Audit state
  let auditInfo = $state({
    version: 0,
    createdAt: '',
    createdBy: '',
    createdByName: '',
    updatedAt: '',
    updatedBy: '',
    updatedByName: '',
    lastSyncedAt: '',
    hasAudit: false
  });

  $effect(() => {
    if (organization) {
      auditInfo.version = organization.version || 1;
      auditInfo.createdAt = organization.created_at ? formatUiDateTime(organization.created_at, $uiLang) : '';
      auditInfo.createdBy = organization.created_by || '';
      auditInfo.createdByName = organization.created_by_name || '';
      auditInfo.updatedAt = organization.updated_at ? formatUiDateTime(organization.updated_at, $uiLang) : '';
      auditInfo.updatedBy = organization.updated_by || '';
      auditInfo.updatedByName = organization.updated_by_name || '';
      auditInfo.lastSyncedAt = organization.last_synced_at ? formatUiDateTime(organization.last_synced_at, $uiLang) : '';
      auditInfo.hasAudit = true;
    }
  });

  onMount(() => {
    void loadOrganization();
  });

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (hasChanges) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  function handleCancel() {
    if (hasChanges) {
      const ok = confirm($t('shell.settings.organizations.update.unsavedChanges'));
      if (!ok) return;
    }
    history.back();
  }

  beforeNavigate((navigation) => {
    if (hasChanges) {
      const confirmLeave = confirm($t('shell.settings.organizations.update.unsavedChanges'));
      if (!confirmLeave) {
        navigation.cancel();
      }
    }
  });
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

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
          }),
          { label: organization?.display_name || $t('common.loading') }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('entities.organization.singular')} - {organization?.display_name || ''}</h1>
    </div>
  {/snippet}

  <div class="flex min-h-0 flex-1 flex-col overflow-auto">
    {#if loading}
      <div class="flex items-center justify-center p-8">
        <div class="text-muted-foreground">{$t('common.loading')}</div>
      </div>
    {:else}
      <form id="org-update-form" use:enhance>
        <div class="grid grid-cols-2 gap-6 p-4">
          <!-- Column 1 -->
          <div class="space-y-4">
            <FormField form={superFormObj} name="uuid">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.organizations.update.uuid')}</FormLabel>
                    <Input
                      id={props.id}
                      bind:value={$form.uuid}
                      readonly
                      class="bg-muted"
                    />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="display_name">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.organizations.update.displayName')}</FormLabel>
                    <Input
                      id={props.id}
                      bind:value={$form.display_name}
                      placeholder={$t('shell.settings.organizations.update.displayNamePlaceholder')}
                    />
                    <FormFieldErrors {props} />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="website_url">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.organizations.update.websiteUrl')}</FormLabel>
                    <Input
                      id={props.id}
                      bind:value={$form.website_url}
                      placeholder="https://example.com"
                    />
                    <FormFieldErrors {props} />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>
          </div>

          <!-- Column 2 -->
          <div class="space-y-4">
            <FormField form={superFormObj} name="idp_owner">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.organizations.update.idpOwner')}</FormLabel>
                    <Input
                      id={props.id}
                      bind:value={$form.idp_owner}
                      readonly
                      class="bg-muted"
                    />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="idp_name">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.organizations.update.idpName')}</FormLabel>
                    <Input
                      id={props.id}
                      bind:value={$form.idp_name}
                      readonly
                      class="bg-muted"
                    />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>
          </div>
        </div>
      </form>
    {/if}
  </div>

  <!-- FOOTER: Audit Box (60%) + CTA (40%) -->
  <div class="bg-muted/50 shrink-0 border-t p-4">
    <div class="flex items-center justify-between gap-4">
      <!-- Left: Audit info (60%) -->
      <div class="flex-1">
        <div class="text-xs">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            {#if auditInfo.version && auditInfo.hasAudit}
              <Badge class="text-xs font-semibold border border-sky-600 dark:border-sky-400" variant="outline">
                v{auditInfo.version}
              </Badge>
            {:else if auditInfo.version}
              <Badge class="text-xs font-semibold border border-sky-600 dark:border-sky-400" variant="outline">
                v{auditInfo.version}
              </Badge>
            {/if}
            <div class="flex items-center gap-x-2">
              <span class="text-primary">{$t('shell.settings.audit.createdAt')}:</span>
              <span class="italic text-muted-foreground">{auditInfo.createdAt || '-'}</span>
            </div>
            <div class="flex items-center gap-x-2">
              <span class="text-primary">{$t('shell.settings.audit.createdBy')}:</span>
              <span class="italic text-muted-foreground">{auditInfo.createdByName || auditInfo.createdBy || '-'}</span>
            </div>
            <div class="flex items-center gap-x-2">
              <span class="text-primary">{$t('shell.settings.audit.updatedAt')}:</span>
              <span class="italic text-muted-foreground">{auditInfo.updatedAt || '-'}</span>
            </div>
            <div class="flex items-center gap-x-2">
              <span class="text-primary">{$t('shell.settings.audit.updatedBy')}:</span>
              <span class="italic text-muted-foreground">{auditInfo.updatedByName || auditInfo.updatedBy || '-'}</span>
            </div>
            <div class="flex items-center gap-x-2">
              <span class="text-primary">{$t('shell.settings.audit.lastSyncedAt')}:</span>
              <span class="italic text-muted-foreground">{auditInfo.lastSyncedAt || '-'}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: CTA (40%) -->
      <div class="shrink-0 flex gap-2">
        <Button variant="outline" onclick={handleCancel}>
          {$t('common.cancel')}
        </Button>
        <Button type="submit" form="org-update-form" disabled={!hasChanges}>
          {$t('common.save')}
        </Button>
      </div>
    </div>
  </div>
</AppPageScaffold>
