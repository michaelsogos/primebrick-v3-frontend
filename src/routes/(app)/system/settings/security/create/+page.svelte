<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { TextInput } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import { ComboSelect } from '$lib/components/ui/combo-select';
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
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { apiFetch, createConfigEntry } from '$lib/api';
  import { useFormGuard } from '$lib/composables/useFormGuard.svelte';
  import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
  import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte';
  import { buildAuditData } from '$lib/utils/audit-data';
  import { minMsg, maxMsg } from '$lib/validation/zod-messages';
  import { buildConfigValueSchema } from '$lib/validation/config-validation';
  import type { ConfigEntryType } from '$lib/api-types';
  import { pushNotification } from '$lib/errors/app-errors';
  import ConfigValueInput from '$lib/components/config-list/ConfigValueInput.svelte';

  const { notifyParentRefresh } = useSyncChannel('primebrick_config_sync', { mode: 'sender' });

  // Config type options for the dropdown
  const configTypeOptions: Array<{ value: string; label: string }> = [
    { value: 'string', label: 'String' },
    { value: 'text', label: 'Text' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'integer', label: 'Integer' },
    { value: 'number', label: 'Number' },
    { value: 'badge', label: 'Badge' },
    { value: 'list', label: 'List' },
    { value: 'url', label: 'URL' },
    { value: 'secret', label: 'Secret' },
    { value: 'json', label: 'JSON' },
    { value: 'date', label: 'Date' },
    { value: 'datetime', label: 'DateTime' },
    { value: 'time', label: 'Time' },
  ];

  // Zod schema for config create form
  const createSchema = z.object({
    key: z.string()
      .min(1, { message: 'validation.required' })
      .max(100, { message: maxMsg(100) })
      .regex(/^[a-z][a-z0-9_]*$/, { message: 'validation.invalidFormat' })
      .default(''),
    type: z.string()
      .min(1, { message: 'validation.required' })
      .default('string'),
    value: z.string()
      .default(''),
    type_config: z.string()
      .default(''),
    label_key: z.string()
      .max(100, { message: maxMsg(100) })
      .default(''),
    description_key: z.string()
      .max(100, { message: maxMsg(100) })
      .default(''),
    group_key: z.string()
      .max(100, { message: maxMsg(100) })
      .default(''),
    reserved: z.boolean()
      .default(false),
  }).superRefine((data, ctx) => {
    // Dynamic validation: validate value based on type and type_config.
    // Same pattern as users/create superRefine for password policy.
    // buildConfigValueSchema reads type_config.validation at validation time.
    const valueSchema = buildConfigValueSchema(
      data.type as ConfigEntryType,
      data.type_config || null,
    );
    const result = valueSchema.safeParse(data.value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: issue.message,
        });
      }
    }
  });

  type CreateForm = z.infer<typeof createSchema>;

  const superFormObj = superForm(defaults(zod4(createSchema)), {
    SPA: true,
    validators: zod4(createSchema),
    validationMethod: 'oninput',
    invalidateAll: false,
    resetForm: false,
    async onUpdate({ form: updateForm, cancel }) {
      if (!updateForm.valid) return;

      try {
        const params = {
          key: updateForm.data.key,
          value: updateForm.data.value,
          type: updateForm.data.type,
          type_config: updateForm.data.type_config?.trim() || null,
          label_key: updateForm.data.label_key?.trim() || null,
          description_key: updateForm.data.description_key?.trim() || null,
          group_key: updateForm.data.group_key?.trim() || null,
          reserved: updateForm.data.reserved,
        };
        const data = await createConfigEntry(params);
        console.log('Config entry created successfully');

        notifyParentRefresh();
        reset({ data: $form });

        pushNotification({
          impact: 'NONE',
          message: $t('shell.settings.security.create.createSuccess'),
          scope: 'config_entries',
        });

        if (window.opener) {
          window.close();
        }
      } catch (error) {
        console.error('Failed to create config entry:', error);
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

  const { handleBeforeUnload, handleCancel } = useUnsavedChangesGuard(
    () => hasChanges,
    'shell.settings.security.create.unsavedChanges',
  );

  const isCreatePage = $derived(true);
  const auditData = $derived(buildAuditData());

  // Check key uniqueness via API
  let keyCheckTimer: ReturnType<typeof setTimeout> | null = null;
  let keyExistsError = $state(false);
  let keyChecking = $state(false);

  function handleKeyInput() {
    keyExistsError = false;
    if (keyCheckTimer) clearTimeout(keyCheckTimer);
    const keyValue = $form.key?.trim() ?? '';
    if (!keyValue) return;
    keyChecking = true;
    keyCheckTimer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/v1/entities/config_entries/list`);
        if (res.ok) {
          const data = (await res.json()) as { rows: Array<{ key: string }> };
          keyExistsError = data.rows.some((r) => r.key === keyValue);
        }
      } catch {
        // ignore — BE will catch duplicates on submit
      } finally {
        keyChecking = false;
      }
    }, 500);
  }

  function handleTypeChange(value: string | string[]) {
    $form.type = Array.isArray(value) ? value[0] ?? '' : value;
  }

  // Extract SuperForms errors for the value field — ConfigValueInput expects string[]
  let valueErrors = $derived(
    $errors?.value
      ? Array.isArray($errors.value)
        ? $errors.value.map(String)
        : [String($errors.value)]
      : [],
  );

  let effectiveCanSave = $derived(canSave && !keyExistsError && !keyChecking);
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<FormPageLayout
  entity="config_entries"
  rowUuid=""
  auditData={auditData}
  auditingColumns={[]}
  isCreatePage={isCreatePage}
>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings' },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: $t,
          }),
          { label: $t('shell.settings.security.create.title') }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.security.create.title')}</h1>
      <p class="text-sm text-muted-foreground">{$t('shell.settings.security.create.description')}</p>
    </div>
  {/snippet}

  {#snippet children()}
    <div class="flex-1 overflow-auto">
      <form id="config-create-form" use:enhance>
        <div class="grid grid-cols-2 gap-6 p-4">
          <!-- Column 1 -->
          <div class="space-y-4">
            <FormField form={superFormObj} name="key">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.security.create.key')}</FormLabel>
                    <TextInput
                      {...props}
                      bind:value={$form.key}
                      oninput={handleKeyInput}
                      placeholder={$t('shell.settings.security.create.keyPlaceholder')}
                      aria-invalid={keyExistsError || props['aria-invalid'] === 'true' || props['aria-invalid'] === true}
                      data-testid="config-create-key"
                    />
                    <TranslatedFormFieldErrors />
                    {#if keyExistsError}
                      <div class="text-destructive text-xs font-medium">
                        {$t('shell.settings.security.create.keyExists')}
                      </div>
                    {/if}
                    <p class="text-xs text-muted-foreground">{$t('shell.settings.security.create.keyHelp')}</p>
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="type">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.security.create.type')}</FormLabel>
                    <ComboSelect
                      mode="single"
                      value={$form.type}
                      onChange={handleTypeChange}
                      options={configTypeOptions}
                      valueField="value"
                      labelField="label"
                      placeholder={$t('common.selectValue')}
                      data-testid="config-create-type"
                    />
                    <TranslatedFormFieldErrors />
                    <p class="text-xs text-muted-foreground">{$t('shell.settings.security.create.typeHelp')}</p>
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="value">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.security.create.value')}</FormLabel>
                    <ConfigValueInput
                      type={$form.type as ConfigEntryType}
                      type_config={$form.type_config || null}
                      fieldKey="create"
                      bind:value={$form.value}
                      errors={valueErrors}
                    />
                    <TranslatedFormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>
          </div>

          <!-- Column 2 -->
          <div class="space-y-4">
            <FormField form={superFormObj} name="type_config">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.security.create.typeConfig')}</FormLabel>
                    <Textarea
                      {...props}
                      bind:value={$form.type_config}
                      placeholder={$t('shell.settings.security.create.typeConfigPlaceholder')}
                      rows={5}
                      class="font-mono text-xs"
                      data-testid="config-create-type-config"
                    />
                    <TranslatedFormFieldErrors />
                    <p class="text-xs text-muted-foreground">{$t('shell.settings.security.create.typeConfigHelp')}</p>
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="label_key">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.security.create.labelKey')}</FormLabel>
                    <TextInput
                      {...props}
                      bind:value={$form.label_key}
                      placeholder={$t('shell.settings.security.create.labelKeyPlaceholder')}
                      data-testid="config-create-label-key"
                    />
                    <TranslatedFormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="description_key">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.security.create.descriptionKey')}</FormLabel>
                    <TextInput
                      {...props}
                      bind:value={$form.description_key}
                      placeholder={$t('shell.settings.security.create.descriptionKeyPlaceholder')}
                      data-testid="config-create-description-key"
                    />
                    <TranslatedFormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="group_key">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('shell.settings.security.create.groupKey')}</FormLabel>
                    <TextInput
                      {...props}
                      bind:value={$form.group_key}
                      placeholder={$t('shell.settings.security.create.groupKeyPlaceholder')}
                      data-testid="config-create-group-key"
                    />
                    <TranslatedFormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <div class="space-y-2">
              <div class="flex items-center gap-3">
                <Switch
                  checked={$form.reserved}
                  onCheckedChange={(checked) => { $form.reserved = checked; }}
                  data-testid="config-create-reserved"
                />
                <span class="text-sm font-medium leading-none">
                  {$t('shell.settings.security.create.reserved')}
                </span>
              </div>
              <p class="text-xs text-muted-foreground">{$t('shell.settings.security.create.reservedHelp')}</p>
            </div>
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
      <Button type="submit" form="config-create-form" disabled={!effectiveCanSave}>
        {$t('common.save')}
      </Button>
    </div>
  {/snippet}
</FormPageLayout>
