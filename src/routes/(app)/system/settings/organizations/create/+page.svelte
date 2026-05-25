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

  // Zod schema for organization create form
  const createSchema = z.object({
    uuid: z.string().optional().default(''),
    display_name: z.string().min(5, { message: 'validation.tooShort' }),
    website_url: z.string().url({ message: 'validation.invalidUrl' }).max(2048, { message: 'validation.tooLong' }).optional().or(z.literal('')),
    idp_owner: z.string().min(1, { message: 'validation.required' }).max(255, { message: 'validation.tooLong' }).default('admin'),
    idp_name: z.string().min(1, { message: 'validation.required' }).max(255, { message: 'validation.tooLong' }),
  });

  type CreateForm = z.infer<typeof createSchema>;

  // Superforms in SPA mode
  const superFormObj = superForm(defaults(zod4(createSchema)), {
    SPA: true,
    validators: zod4(createSchema),
    invalidateAll: false,
    resetForm: false,
    async onUpdate({ form: updateForm, cancel }) {
      if (!updateForm.valid) return;

      try {
        const body = {
          idp_owner: updateForm.data.idp_owner,
          idp_name: updateForm.data.idp_name,
          display_name: updateForm.data.display_name,
          website_url: updateForm.data.website_url || undefined,
        };
        const response = await apiFetch('/api/v1/entities/organization', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Failed to create organization:', errorData);
          cancel();
          return;
        }

        const data = await response.json();
        if (data.success && data.organization) {
          console.log('Organization created successfully');
          // Update audit state from response
          auditInfo.version = data.organization.version || 1;
          auditInfo.createdAt = data.organization.created_at ? formatUiDateTime(data.organization.created_at, $uiLang) : '';
          auditInfo.createdBy = data.organization.created_by || '';
          auditInfo.createdByName = data.organization.created_by_name || '';
          auditInfo.updatedAt = data.organization.updated_at ? formatUiDateTime(data.organization.updated_at, $uiLang) : '';
          auditInfo.updatedBy = data.organization.updated_by || '';
          auditInfo.updatedByName = data.organization.updated_by_name || '';
          auditInfo.lastSyncedAt = data.organization.last_synced_at ? formatUiDateTime(data.organization.last_synced_at, $uiLang) : '';
          auditInfo.hasAudit = true;

          // Notify parent BEFORE navigating away; after goto the component may unmount and close the channel
          notifyParentRefresh();
          // Navigate to the update page for the newly created organization
          await goto(`/system/settings/organizations/${data.organization.uuid}`);
        }
      } catch (error) {
        console.error('Failed to create organization:', error);
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

  // Auto-slug idp_name from display_name when idp_name is empty
  $effect(() => {
    if (!$form.idp_name && $form.display_name) {
      const slug = $form.display_name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      $form.idp_name = slug;
    }
  });

  // Audit state (local for create page)
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

  // Initialize audit info with default values
  onMount(() => {
    const now = new Date();
    const user = userProfileStore.current;
    auditInfo.createdAt = formatUiDateTime(now.toISOString(), $uiLang);
    auditInfo.createdBy = user?.idp_code || '-';
    auditInfo.createdByName = user?.display_name || '-';
    auditInfo.updatedAt = auditInfo.createdAt;
    auditInfo.updatedBy = auditInfo.createdBy;
    auditInfo.updatedByName = auditInfo.createdByName;
    auditInfo.lastSyncedAt = '-'; // Not synced yet on creation
  });

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (hasChanges) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  function handleCancel() {
    if (hasChanges) {
      const ok = confirm($t('shell.settings.organizations.create.unsavedChanges'));
      if (!ok) return;
    }
    if (window.opener) {
      // Opened as child window from organizations list
      window.close();
    } else {
      // Direct navigation — go back
      history.back();
    }
  }

  beforeNavigate((navigation) => {
    if (hasChanges) {
      const confirmLeave = confirm($t('shell.settings.organizations.create.unsavedChanges'));
      if (!confirmLeave) {
        navigation.cancel();
      }
    }
  });

  // Validation function for idp_name availability
  async function checkIdpNameAvailability(idpName: string): Promise<ValidationResult> {
    try {
      const idpOwner = $form.idp_owner || 'admin';
      const response = await apiFetch(
        `/api/v1/entities/organization/check-availability?idp_owner=${encodeURIComponent(idpOwner)}&idp_name=${encodeURIComponent(idpName)}`
      );

      if (!response.ok) {
        return ValidationResult.ERROR_API;
      }

      const data = await response.json();
      if (data.available === true) {
        return ValidationResult.VALID;
      } else {
        return ValidationResult.NOT_VALID;
      }
    } catch (error) {
      console.error('Error checking idp_name availability:', error);
      return ValidationResult.ERROR_API;
    }
  }

  // Track validation status for idp_name
  let idpNameValidationStatus = $state<ValidationStatus>("idle");

  function handleIdpNameStatusChange(status: ValidationStatus) {
    idpNameValidationStatus = status;
  }
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
          })
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.organizations.create.title')}</h1>
    </div>
  {/snippet}

  <div class="flex min-h-0 flex-1 flex-col overflow-auto">
    <form id="org-create-form" use:enhance>
      <div class="grid grid-cols-2 gap-6 p-4">
        <!-- Column 1 -->
        <div class="space-y-4">
          <FormField form={superFormObj} name="display_name">
            <FormControl>
              {#snippet children({ props })}
                <div class="space-y-2">
                  <FormLabel for={props.id}>{$t('shell.settings.organizations.create.displayName')}</FormLabel>
                  <Input
                    id={props.id}
                    bind:value={$form.display_name}
                    placeholder={$t('shell.settings.organizations.create.displayNamePlaceholder')}
                  />
                  <TranslatedFormFieldErrors {props} />
                </div>
              {/snippet}
            </FormControl>
          </FormField>

          <FormField form={superFormObj} name="website_url">
            <FormControl>
              {#snippet children({ props })}
                <div class="space-y-2">
                  <FormLabel for={props.id}>{$t('shell.settings.organizations.create.websiteUrl')}</FormLabel>
                  <Input
                    id={props.id}
                    bind:value={$form.website_url}
                    placeholder="https://example.com"
                  />
                  <TranslatedFormFieldErrors {props} />
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
                  <FormLabel for={props.id}>{$t('shell.settings.organizations.create.idpOwner')}</FormLabel>
                  <Input
                    id={props.id}
                    bind:value={$form.idp_owner}
                    placeholder="admin"
                  />
                  <TranslatedFormFieldErrors {props} />
                </div>
              {/snippet}
            </FormControl>
          </FormField>

          <FormField form={superFormObj} name="idp_name">
            <FormControl>
              {#snippet children({ props })}
                <div class="space-y-2">
                  <FormLabel for={props.id}>{$t('shell.settings.organizations.create.idpName')}</FormLabel>
                  <AsyncValidatedInput
                    id={props.id}
                    value={$form.idp_name}
                    onChange={(v) => $form.idp_name = v}
                    validateFn={checkIdpNameAvailability}
                    placeholder="acme-corp"
                    hasError={$errors.idp_name !== undefined || idpNameValidationStatus === 'not-valid'}
                    onStatusChange={handleIdpNameStatusChange}
                  />
                  <TranslatedFormFieldErrors {props} />
                  {#if idpNameValidationStatus === 'not-valid'}
                    <div class="text-destructive text-xs font-medium">
                      {$t('validation.nameTaken')}
                    </div>
                  {/if}
                </div>
              {/snippet}
            </FormControl>
          </FormField>
        </div>
      </div>
    </form>
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
        <Button type="submit" form="org-create-form" disabled={!hasChanges}>
          {$t('common.save')}
        </Button>
      </div>
    </div>
  </div>
</AppPageScaffold>
