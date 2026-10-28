<script lang="ts">
  import { orderedColumns } from '$lib/entity-list';
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { TextInput } from '@primebrick/ui';
  import FormPageLayout from '$lib/components/FormPageLayout.svelte';
  import {
    FormField,
    FormLabel,
    FormControl,
    TranslatedFormFieldErrors,
  } from '@primebrick/ui';
  import { superForm, defaults } from 'sveltekit-superforms';
  import { zod4 } from 'sveltekit-superforms/adapters';
  import { z } from 'zod';
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api';
  import { useEntityMetadata, type EntityMetadata } from '$lib/composables/useEntityMetadata.svelte';

  import { useFormGuard } from '$lib/composables/useFormGuard.svelte';
  import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
  import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte';
  import { buildAuditData } from '$lib/utils/audit-data';
  import { maxMsg } from '$lib/validation/zod-messages';
  import { displayNameSchema, idpNameSchema } from '$lib/validation/display-name';

  const uuid = $derived(page.params.uuid);

  const { notifyParentRefresh } = useSyncChannel('primebrick_organizations_sync', { mode: 'sender' });

  // Zod schema for organization update form
  const updateSchema = z.object({
    idp_code: z.string().optional(),
    display_name: displayNameSchema(z.string()),
    website_url: z.string()
      .url({ message: 'app.common.validation.invalidUrl' })
      .max(2048, { message: maxMsg(2048) })
      .optional()
      .or(z.literal('')),
    idp_owner: z.string().min(1, { message: 'app.common.validation.required' }).max(255, { message: maxMsg(255) }),
    idp_name: idpNameSchema(z.string()),
  });

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

  // Superforms in SPA mode
  const superFormObj = superForm(defaults(zod4(updateSchema)), {
    SPA: true,
    validators: zod4(updateSchema),
    validationMethod: 'oninput',
    invalidateAll: false,
    resetForm: false,
    async onUpdate({ form: updateForm, cancel }) {
      if (!updateForm.valid || !organization) return;

      try {
        const body = {
          display_name: updateForm.data.display_name,
          website_url: updateForm.data.website_url || undefined,
          version: organization.version,
        };
        const response = await apiFetch(`/api/v1/entities/organization/${uuid}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ entity: body }),
        });

        if (!response.ok) {
          cancel();
          return;
        }

        // The response IS the updated entity (DAL RETURNING), not a wrapper.
        await response.json();
        console.log('Organization updated successfully');
        // Refresh the organization data to show updated audit info
        await loadOrganization();
        // Notify parent window to refresh
        notifyParentRefresh();
        // Close popup if opened as child window
        if (window.opener) {
          window.close();
        }
      } catch (error) {
        console.error('Failed to update organization:', error);
        cancel();
      }
    },
  });

  const { form, errors, enhance, reset, tainted, isTainted } = superFormObj;

  // NOTE: do NOT destructure — getters freeze at initial values otherwise.
  const formGuard = useFormGuard(
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
    () => formGuard.hasChanges,
    'system.settings.organizations.update.unsavedChanges',
  );
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<FormPageLayout
  entity="organization"
  rowUuid={uuid || ''}
  meta={meta || undefined}
  auditData={auditData}
  auditingColumns={orderedColumns(meta?.columns).filter((c) => c.audited)}
  isCreatePage={isCreatePage}
>

    {#if loading}
      <div class="flex items-center justify-center p-8">
        <div class="text-muted-foreground">{$t('app.common.loading')}</div>
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
                      <FormLabel for={props.id}>{$t('system.settings.organizations.update.displayName')}</FormLabel>
                      <TextInput
                        {...props}
                        bind:value={$form.display_name}
                        placeholder={$t('system.settings.organizations.update.displayNamePlaceholder')}
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
                      <FormLabel for={props.id}>{$t('system.settings.organizations.update.websiteUrl')}</FormLabel>
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
                      <FormLabel for={props.id}>{$t('system.settings.organizations.update.idpCode')}</FormLabel>
                      <TextInput
                        {...props}
                        bind:value={$form.idp_code}
                        readonly
                        copyTooltipLabel={$t('system.settings.organizations.update.copyIdpCode')}
                      />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <FormField form={superFormObj} name="idp_owner">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t('system.settings.organizations.update.idpOwner')}</FormLabel>
                      <TextInput
                        {...props}
                        bind:value={$form.idp_owner}
                        readonly
                        copyTooltipLabel={$t('system.settings.organizations.update.copyIdpOwner')}
                      />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <FormField form={superFormObj} name="idp_name">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t('system.settings.organizations.update.idpName')}</FormLabel>
                      <TextInput
                        {...props}
                        bind:value={$form.idp_name}
                        readonly
                        copyTooltipLabel={$t('system.settings.organizations.update.copyIdpName')}
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

  {#snippet footerActions()}
    <div class="flex gap-2">
      <Button variant="outline" onclick={handleCancel}>
        {formGuard.hasChanges ? $t('app.common.cancel') : $t('app.common.exit')}
      </Button>
      <Button type="submit" form="org-update-form" disabled={!formGuard.canSave}>
        {$t('app.common.save')}
      </Button>
    </div>
  {/snippet}
</FormPageLayout>
