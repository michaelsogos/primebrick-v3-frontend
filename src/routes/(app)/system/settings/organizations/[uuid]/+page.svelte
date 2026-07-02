<script lang="ts">
  import { page } from '$app/state';
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { TextInput } from '$lib/components/ui/input';
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
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { useEntityMetadata, type EntityMetadata } from '$lib/composables/useEntityMetadata.svelte';
  import { resolvePageTitle, getColMeta as getColMetaUtil } from '$lib/utils/entity-meta';
  import { useFormGuard } from '$lib/composables/useFormGuard.svelte';
  import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
  import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte';
  import { buildAuditData } from '$lib/utils/audit-data';
  import { minMsg, maxMsg } from '$lib/validation/zod-messages';
  import { displayNameSchema, idpNameSchema } from '$lib/validation/display-name';

  const uuid = $derived(page.params.uuid);

  const { notifyParentRefresh } = useSyncChannel('primebrick_organizations_sync', { mode: 'sender' });

  // Zod schema for organization update form
  const updateSchema = z.object({
    idp_code: z.string().optional(),
    display_name: displayNameSchema(z.string()),
    website_url: z.string()
      .url({ message: 'validation.invalidUrl' })
      .max(2048, { message: maxMsg(2048) })
      .optional()
      .or(z.literal('')),
    idp_owner: z.string().min(1, { message: 'validation.required' }).max(255, { message: maxMsg(255) }),
    idp_name: idpNameSchema(z.string()),
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

  let meta = $state<EntityMetadata | null>(null);
  let pageTitle = $state(''); // Frozen title, computed once after load
  let loading = $state(true);
  let isCreatePage = $state(false);

  const entityMetadata = useEntityMetadata({
    endpoint: '/api/v1/entities/organization/meta',
    entityName: 'organization',
  });

  $effect(() => {
    if (entityMetadata.state.meta) {
      meta = entityMetadata.state.meta as EntityMetadata;
    }
  });

  function getColMeta(key: string) {
    return getColMetaUtil(meta, key);
  }

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
          // Close popup if opened as child window
          if (window.opener) {
            window.close();
          }
        }
      } catch (error) {
        console.error('Failed to update organization:', error);
        cancel();
      }
    },
  });

  const { form, errors, enhance, reset, tainted, isTainted } = superFormObj;

  const { hasChanges, canSave } = useFormGuard(
    () => $tainted,
    () => $errors as Record<string, unknown>,
    isTainted as (path?: unknown) => boolean,
  );

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
          idp_code: data.idp_code || '',
          display_name: data.display_name || '',
          website_url: data.website_url || '',
          idp_owner: data.idp_owner || data.idp_code?.split('/')[0] || 'admin',
          idp_name: data.idp_name || data.idp_code?.split('/')[1] || data.idp_code || '',
        },
      });
      // Compute frozen page title from meta expression
      pageTitle = resolvePageTitle(
        meta,
        organization as Record<string, unknown> | null,
        organization?.display_name || '',
      );
    } catch (error) {
      console.error('Failed to load organization:', error);
    } finally {
      loading = false;
    }
  }

  // Audit state
  const auditData = $derived(buildAuditData(organization));

  onMount(() => {
    void entityMetadata.loadMetadata();
    void loadOrganization();
  });

  const { handleBeforeUnload, handleCancel } = useUnsavedChangesGuard(
    () => hasChanges,
    'shell.settings.organizations.update.unsavedChanges',
  );
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<FormPageLayout
  entity="organization"
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
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key)
          }),
          { label: $t('shell.settings.tabs.organizations'), href: '/system/settings/organizations' },
          { label: $t('shell.settings.organizations.update.title') }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{pageTitle || $t('common.loading')}</h1>
    </div>
  {/snippet}

  {#snippet children()}
    {#if loading}
      <div class="flex items-center justify-center p-8">
        <div class="text-muted-foreground">{$t('common.loading')}</div>
      </div>
    {:else}
      <div class="flex-1 overflow-auto p-4">
        <form id="org-update-form" use:enhance>
          <div class="grid grid-cols-2 gap-6">
            <!-- Column 1 -->
            <div class="space-y-4">
              <FormField form={superFormObj} name="display_name">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t('shell.settings.organizations.update.displayName')}</FormLabel>
                      <TextInput
                        {...props}
                        bind:value={$form.display_name}
                        placeholder={$t('shell.settings.organizations.update.displayNamePlaceholder')}
                      />
                      <TranslatedFormFieldErrors />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <FormField form={superFormObj} name="website_url">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t('shell.settings.organizations.update.websiteUrl')}</FormLabel>
                      <TextInput
                        {...props}
                        bind:value={$form.website_url}
                        placeholder="https://example.com"
                      />
                      <TranslatedFormFieldErrors />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>
            </div>

            <!-- Column 2 -->
            <div class="space-y-4">
              <FormField form={superFormObj} name="idp_code">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t('shell.settings.organizations.update.idpCode')}</FormLabel>
                      <TextInput
                        {...props}
                        bind:value={$form.idp_code}
                        readonly
                        copyTooltipLabel={$t('shell.settings.organizations.update.copyIdpCode')}
                      />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <FormField form={superFormObj} name="idp_owner">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t('shell.settings.organizations.update.idpOwner')}</FormLabel>
                      <TextInput
                        {...props}
                        bind:value={$form.idp_owner}
                        readonly
                        copyTooltipLabel={$t('shell.settings.organizations.update.copyIdpOwner')}
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
                      <TextInput
                        {...props}
                        bind:value={$form.idp_name}
                        readonly
                        copyTooltipLabel={$t('shell.settings.organizations.update.copyIdpName')}
                      />
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
        {hasChanges ? $t('common.cancel') : $t('common.exit')}
      </Button>
      <Button type="submit" form="org-update-form" disabled={!canSave}>
        {$t('common.save')}
      </Button>
    </div>
  {/snippet}
</FormPageLayout>
