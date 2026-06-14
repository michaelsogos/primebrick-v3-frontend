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
  import { beforeNavigate, goto } from '$app/navigation';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import AsyncValidatedInput from '$lib/components/ui/input/async-validated-input.svelte';
  import { ValidationResult } from '$lib/types/validation.js';
  import type { ValidationStatus } from '$lib/types/validation.js';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { CopyButton } from '$lib/components/ui/copy-button';
  import type { AuditField } from '$lib/composables/useAuditBox';

  const SYNC_CHANNEL_NAME = 'primebrick_organizations_sync';
  let syncChannel: BroadcastChannel | null = null;

  // Custom refinement to ensure strings start and end with alphanumeric characters
  function startsAndEndsWithAlphanumeric(value: string): boolean {
    if (!value || value.length === 0) return true; // Skip empty strings (handled by required)
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

  // Zod schema for organization create form
  const createSchema = z.object({
    display_name: z.string()
      .min(5, { message: 'validation.tooShort' })
      .refine(startsAndEndsWithAlphanumeric, { message: 'validation.invalidFormat' }),
    website_url: z.string()
      .url({ message: 'validation.invalidUrl' })
      .max(2048, { message: 'validation.tooLong' })
      .refine(startsAndEndsWithAlphanumeric, { message: 'validation.invalidFormat' })
      .optional()
      .or(z.literal('')),
    idp_owner: z.string()
      .min(1, { message: 'validation.required' })
      .max(255, { message: 'validation.tooLong' })
      .refine(startsAndEndsWithAlphanumeric, { message: 'validation.invalidFormat' })
      .default('admin'),
    idp_name: z.string()
      .min(5, { message: 'validation.tooShort' })
      .max(255, { message: 'validation.tooLong' })
      .superRefine((value, ctx) => {
        if (!startsAndEndsWithAlphanumeric(value)) {
          ctx.addIssue({ code: 'custom', message: 'validation.invalidFormat' });
        }
      }),
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

          // Notify parent BEFORE navigating away; after goto the component may unmount and close the channel
          notifyParentRefresh();
          // Reset taint baseline so hasChanges becomes false before navigation
          reset({ data: $form });
          // Navigate to the update page for the newly created organization
          await goto(`/system/settings/organizations/${data.organization.uuid}`);
        }
      } catch (error) {
        console.error('Failed to create organization:', error);
        cancel();
      }
    },
  });

  const { form, errors, enhance, tainted, reset, isTainted } = superFormObj;

  const hasChanges = $derived(isTainted($tainted));

  // Auto-slug idp_name from display_name when idp_name is empty (set once only)
  let didAutoSlugIdpName = $state(false);

  $effect(() => {
    if (didAutoSlugIdpName) return;

    // If user already has an idp_name (e.g. loaded defaults), stop
    if ($form.idp_name) {
      didAutoSlugIdpName = true;
      return;
    }

    const display = $form.display_name?.trim();
    if (!display) return;

    const slug = display
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Important: do not write an empty slug (prevents infinite loop)
    if (!slug) return;

    $form.idp_name = slug;
    didAutoSlugIdpName = true;
  });

  // Computed idp_code from idp_owner and idp_name (reactive, not sent to API)
  const idpCode = $derived.by(() => {
    const owner = $form.idp_owner || 'admin';
    const name = $form.idp_name || '';
    return name ? `${owner}/${name}` : '';
  });

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
  let hasAsyncError = $derived(idpNameValidationStatus === 'not-valid');

  function handleIdpNameStatusChange(status: ValidationStatus) {
    idpNameValidationStatus = status;
    // Async error is now tracked via status only
    // Zod errors are handled by Superforms/Formsnap
  }
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<FormPageLayout
  entity="organization"
  rowUuid=""
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

  {#snippet children()}
    <div class="flex-1 overflow-auto">
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
                      {...props}
                      bind:value={$form.display_name}
                      placeholder={$t('shell.settings.organizations.create.displayNamePlaceholder')}
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
                    <FormLabel for={props.id}>{$t('shell.settings.organizations.create.websiteUrl')}</FormLabel>
                    <Input
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
            <div class="space-y-2">
              <label for="idp-code-display" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                {$t('shell.settings.organizations.create.idpCode')}
              </label>
              <div class="relative">
                <Input
                  id="idp-code-display"
                  value={idpCode}
                  readonly
                  class="bg-muted pr-10"
                />
                {#if idpCode}
                  <div class="absolute right-2 top-1/2 -translate-y-1/2">
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props: tooltipProps })}
                          <CopyButton
                            text={idpCode}
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8 hover:bg-transparent"
                            animationDuration={2000}
                            {...tooltipProps}
                          />
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content>{$t('shell.settings.organizations.create.copyIdpCode')}</Tooltip.Content>
                    </Tooltip.Root>
                  </div>
                {/if}
              </div>
            </div>

            <FormField form={superFormObj} name="idp_owner">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.organizations.create.idpOwner')}</FormLabel>
                    <Input
                      {...props}
                      bind:value={$form.idp_owner}
                      placeholder="admin"
                    />
                    <TranslatedFormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="idp_name">
              <FormControl>
                {#snippet children({ props })}
                  {@const hasZodError = props['aria-invalid'] === 'true' || props['aria-invalid'] === true}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.organizations.create.idpName')}</FormLabel>
                    <AsyncValidatedInput
                      {...props}
                      bind:value={$form.idp_name}
                      validateFn={checkIdpNameAvailability}
                      placeholder="acme-corp"
                      onStatusChange={handleIdpNameStatusChange}
                      externalInvalid={hasZodError}
                      aria-invalid={hasAsyncError ? true : props['aria-invalid']}
                      data-fs-error={hasAsyncError ? 'true' : props['data-fs-error']}
                    />
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
      <Button type="submit" form="org-create-form" disabled={!hasChanges}>
        {$t('common.save')}
      </Button>
    </div>
  {/snippet}
</FormPageLayout>
