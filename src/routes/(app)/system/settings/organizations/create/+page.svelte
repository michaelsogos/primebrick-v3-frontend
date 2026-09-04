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
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import AsyncValidatedInput from '$lib/components/ui/input/async-validated-input.svelte';
  import { ValidationResult } from '$lib/types/validation.js';
  import type { ValidationStatus } from '$lib/types/validation.js';
  import type { EntityMetadata } from '$lib/composables/useEntityMetadata.svelte';
  import { useFormGuard } from '$lib/composables/useFormGuard.svelte';
  import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
  import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte';
  import { buildAuditData } from '$lib/utils/audit-data';
  import { minMsg, maxMsg } from '$lib/validation/zod-messages';
  import { displayNameSchema, idpNameSchema, startsAndEndsWithAlphanumeric } from '$lib/validation/display-name';

  const { notifyParentRefresh } = useSyncChannel('primebrick_organizations_sync', { mode: 'sender' });

  // Zod schema for organization create form
  const createSchema = z.object({
    display_name: displayNameSchema(z.string()),
    website_url: z.string()
      .url({ message: 'app.common.validation.invalidUrl' })
      .max(2048, { message: maxMsg(2048) })
      .refine(startsAndEndsWithAlphanumeric, { message: 'app.common.validation.invalidFormat' })
      .or(z.literal(''))
      .default(''),
    idp_owner: z.string()
      .min(1, { message: 'app.common.validation.required' })
      .max(255, { message: maxMsg(255) })
      .refine(startsAndEndsWithAlphanumeric, { message: 'app.common.validation.invalidFormat' })
      .default('admin'),
    idp_name: idpNameSchema(z.string()),
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

  const { form, errors, enhance, reset, tainted, isTainted } = superFormObj;

  const { hasChanges, canSave } = useFormGuard(
    () => $tainted,
    () => $errors as Record<string, unknown>,
    isTainted as (path?: unknown) => boolean,
  );

  // Auto-slug idp_name from display_name on blur (not on every keystroke).
  // On blur of display_name: compute slug once, write to idp_name, then
  // dispatch a synthetic input event on the idp_name input so the
  // AsyncValidatedInput's handleInputChange fires and starts the availability check.
  let userTouchedIdpName = $state(false);

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async function handleDisplayNameBlur() {
    if (userTouchedIdpName) return;
    const display = $form.display_name?.trim() ?? '';
    const slug = slugify(display);
    if ($form.idp_name === slug) return;
    $form.idp_name = slug;
    // Wait for the DOM to update, then trigger the AsyncValidatedInput's
    // validation by dispatching an input event on the idp_name field.
    await tick();
    const idpNameInput = document.querySelector<HTMLInputElement>('input[name="idp_name"]');
    if (idpNameInput) {
      idpNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function handleIdpNameInput() {
    userTouchedIdpName = true;
  }

  // Computed idp_code from idp_owner and idp_name (reactive, not sent to API)
  const idpCode = $derived.by(() => {
    const owner = $form.idp_owner || 'admin';
    const name = $form.idp_name || '';
    return name ? `${owner}/${name}` : '';
  });

  // Audit data state
  let meta = $state<EntityMetadata | null>(null);
  let isCreatePage = $state(true);

  const auditData = $derived(buildAuditData());

  const { handleBeforeUnload, handleCancel } = useUnsavedChangesGuard(
    () => hasChanges,
    'system.settings.organizations.create.unsavedChanges',
  );

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
  auditingColumns={meta?.list?.auditingColumns || []}
  isCreatePage={isCreatePage}
>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('app.system') },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key)
          }),
          { label: $t('system.settings.tabs.organizations'), href: '/system/settings/organizations' },
          { label: $t('system.settings.organizations.create.title') }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('system.settings.organizations.create.title')}</h1>
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
                    <FormLabel for={props.id}>{$t('system.settings.organizations.create.displayName')}</FormLabel>
                    <TextInput
                      {...props}
                      bind:value={$form.display_name}
                      onblur={handleDisplayNameBlur}
                      placeholder={$t('system.settings.organizations.create.displayNamePlaceholder')}
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
                    <FormLabel for={props.id}>{$t('system.settings.organizations.create.websiteUrl')}</FormLabel>
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
            <div class="space-y-2">
              <label for="idp-code-display" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                {$t('system.settings.organizations.create.idpCode')}
              </label>
              <TextInput
                id="idp-code-display"
                value={idpCode}
                readonly
                copyTooltipLabel={$t('system.settings.organizations.create.copyIdpCode')}
              />
            </div>

            <div class="space-y-2">
              <label for="idp-owner-display" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                {$t('system.settings.organizations.create.idpOwner')}
              </label>
              <TextInput
                id="idp-owner-display"
                value="admin"
                readonly
                copyTooltipLabel={$t('system.settings.organizations.create.copyIdpOwner')}
              />
            </div>

            <FormField form={superFormObj} name="idp_name">
              <FormControl>
                {#snippet children({ props })}
                  {@const hasZodError = props['aria-invalid'] === 'true' || props['aria-invalid'] === true}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('system.settings.organizations.create.idpName')}</FormLabel>
                    <AsyncValidatedInput
                      {...props}
                      bind:value={$form.idp_name}
                      validateFn={checkIdpNameAvailability}
                      placeholder="acme-corp"
                      onStatusChange={handleIdpNameStatusChange}
                      oninput={handleIdpNameInput}
                      externalInvalid={hasZodError}
                      aria-invalid={hasAsyncError ? true : props['aria-invalid']}
                      data-fs-error={hasAsyncError ? 'true' : props['data-fs-error']}
                    />
                    <TranslatedFormFieldErrors />
                    {#if hasAsyncError && !hasZodError}
                      <div class="text-destructive text-xs font-medium">
                        {$t('app.common.validation.nameTaken')}
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
        {$t('app.common.cancel')}
      </Button>
      <Button type="submit" form="org-create-form" disabled={!canSave}>
        {$t('app.common.save')}
      </Button>
    </div>
  {/snippet}
</FormPageLayout>
