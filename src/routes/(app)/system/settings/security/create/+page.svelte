<script lang="ts">
  import { page } from '$app/state';
  import { t, dict } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { TextInput } from '$lib/components/ui/input';
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
  import { useExistingGroupKeys } from '$lib/composables/useExistingGroupKeys.svelte';
  import { buildAuditData } from '$lib/utils/audit-data';
  import { minMsg, maxMsg } from '$lib/validation/zod-messages';
  import { buildConfigValueSchema } from '$lib/validation/config-validation';
  import type { ConfigEntryType } from '$lib/api-types';
  import { pushNotification } from '$lib/errors/app-errors';
  import ConfigValueInput from '$lib/components/config-list/ConfigValueInput.svelte';
  import TypeConfigBuilder from '$lib/components/config-builder/TypeConfigBuilder.svelte';
  import FormLabelWithPriorityHelp from '$lib/components/forms/FormLabelWithPriorityHelp.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';

  const { notifyParentRefresh } = useSyncChannel('primebrick_config_sync', { mode: 'sender' });

  // Config type options for the dropdown
  const configTypeOptions: Array<{ value: string; label: string }> = [
    { value: 'string', label: 'String' },
    { value: 'text', label: 'Text' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'bigint', label: 'BigInt' },
    { value: 'number', label: 'Number' },
    { value: 'money', label: 'Money' },
    { value: 'badge', label: 'Badge' },
    { value: 'single_select', label: 'Single Select' },
    { value: 'multi_select', label: 'Multi Select' },
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
      .min(1, { message: 'app.common.validation.required' })
      .max(100, { message: maxMsg(100) })
      .regex(/^[a-z][a-z0-9_]*$/, { message: 'app.common.validation.invalidFormat' })
      .default(''),
    type: z.string()
      .min(1, { message: 'app.common.validation.required' })
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
      .regex(/^$|^[a-z][a-z0-9_]*$/, { message: 'app.common.validation.invalidFormat' })
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
    async onChange() {
      // Force ALL errors to display on every change, regardless of taint.
      // validateForm({ update: true }) sets force=true in Form__displayNewErrors,
      // bypassing all taint/event/previous-error checks.
      // This is required because the value field's validation depends on type
      // and type_config via root-level superRefine — field-level validation
      // alone (z.string().default('')) won't catch required/type errors.
      // Same pattern as users/create page.
      await superFormObj.validateForm({ update: true, focusOnError: false });
    },
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
          message: $t('system.settings.security.create.createSuccess'),
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
    'system.settings.security.create.unsavedChanges',
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

  // Existing group keys for the group_key ComboSelect (selectable suggestions)
  const { state: groupKeysState } = useExistingGroupKeys();
  const existingGroupKeys = $derived([...groupKeysState.groupKeys]);
  const groupKeysLoading = $derived(groupKeysState.loading);

  // Build ComboSelect options: each group_key becomes an object with the
  // raw key as value and the full i18n key as label (translated at render time)
  const groupKeyOptions = $derived(
    existingGroupKeys.map((gk) => ({
      group_key: gk,
      label_key: `config.auth.group.${gk}`,
    })),
  );

  // Check if the current group_key value is new (not in existing options)
  function isGroupKeyNew(val: string) {
    return val.trim() !== '' && !existingGroupKeys.includes(val.trim());
  }

  function handleGroupKeyChange(value: string | string[]) {
    $form.group_key = Array.isArray(value) ? value[0] ?? '' : value;
  }

  // Reactive i18n key placeholders based on the config key being typed.
  // Uses 'my_custom_setting' as fallback when key is empty (same convention as the builder).
  const labelKeyPlaceholder = $derived(
    `config.auth.${$form.key?.trim() || 'my_custom_setting'}.label`,
  );
  const descriptionKeyPlaceholder = $derived(
    `config.auth.${$form.key?.trim() || 'my_custom_setting'}.description`,
  );

  // ─── i18n key options for label_key / description_key ComboSelects ──────
  // The dict is flat (keys are dot-paths), so Object.keys() gives us all keys.
  // Filter to system.settings.config.auth.*.label / .description leaves.
  // These are the selectable options; the user can also type a new key (allowCreate).
  const allI18nKeys = $derived(Object.keys($dict as Record<string, string>));
  const labelKeyOptions = $derived(
    allI18nKeys
      .filter((k) => k.startsWith('system.settings.config.auth.') && k.endsWith('.label'))
      .map((k) => ({ key: k })),
  );
  const descriptionKeyOptions = $derived(
    allI18nKeys
      .filter((k) => k.startsWith('config.auth.') && k.endsWith('.description'))
      .map((k) => ({ key: k })),
  );

  // Pre-filter prefix: when the popover opens, only show keys matching the
  // current config key. User can clear the search (X button) to see all.
  const labelKeyDefaultSearch = $derived(
    `config.auth.${$form.key?.trim() || 'my_custom_setting'}.`,
  );
  const descriptionKeyDefaultSearch = $derived(
    `config.auth.${$form.key?.trim() || 'my_custom_setting'}.`,
  );

  function handleLabelKeyChange(value: string | string[]) {
    $form.label_key = Array.isArray(value) ? value[0] ?? '' : value;
  }
  function handleDescriptionKeyChange(value: string | string[]) {
    $form.description_key = Array.isArray(value) ? value[0] ?? '' : value;
  }
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
          { label: $t('app.system') },
          { label: $t('system.settings.title'), href: '/system/settings' },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: $t,
          }),
          { label: $t('system.settings.security.create.title') }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('system.settings.security.create.title')}</h1>
      <p class="text-sm text-muted-foreground">{$t('system.settings.security.create.description')}</p>
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
                    <FormLabel for={props.id}>{$t('system.settings.security.create.key')}</FormLabel>
                    <TextInput
                      {...props}
                      bind:value={$form.key}
                      oninput={handleKeyInput}
                      placeholder={$t('system.settings.security.create.keyPlaceholder')}
                      aria-invalid={keyExistsError || props['aria-invalid'] === 'true' || props['aria-invalid'] === true}
                      data-testid="config-create-key"
                    />
                    <TranslatedFormFieldErrors />
                    {#if keyExistsError}
                      <div class="text-destructive text-xs font-medium">
                        {$t('system.settings.security.create.keyExists')}
                      </div>
                    {/if}
                    <p class="text-xs text-muted-foreground">{$t('system.settings.security.create.keyHelp')}</p>
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="type">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('system.settings.security.create.type')}</FormLabel>
                    <ComboSelect
                      mode="single"
                      value={$form.type}
                      onChange={handleTypeChange}
                      options={configTypeOptions}
                      valueField="value"
                      labelField="label"
                      placeholder={$t('app.common.selectValue')}
                      data-testid="config-create-type"
                    />
                    <TranslatedFormFieldErrors />
                    <p class="text-xs text-muted-foreground">{$t('system.settings.security.create.typeHelp')}</p>
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="value">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('system.settings.security.create.value')}</FormLabel>
                    <ConfigValueInput
                      type={$form.type as ConfigEntryType}
                      type_config={$form.type_config || null}
                      fieldKey="create"
                      bind:value={$form.value}
                      errors={valueErrors}
                      onTypeConfigChange={(newConfig) => $form.type_config = newConfig}
                    />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="label_key">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>
                      {$t('system.settings.security.create.labelKey')}
                      <FormLabelWithPriorityHelp
                        text={$t('app.common.optionalTooltipText')}
                        priority="INFORMATION"
                        title={$t('app.common.optionalTooltipTitle')}
                        labelKey="app.common.optional"
                      />
                    </FormLabel>
                    <ComboSelect
                      {...props}
                      mode="single"
                      value={$form.label_key}
                      onChange={handleLabelKeyChange}
                      options={labelKeyOptions}
                      valueField="key"
                      labelField="key"
                      isLabelTranslated={true}
                      allowCreate={true}
                      defaultSearch={labelKeyDefaultSearch}
                      placeholder={labelKeyPlaceholder}
                      searchPlaceholder={labelKeyPlaceholder}
                      data-testid="config-create-label-key"
                    >
                      {#snippet itemSnippet({ resolvedLabel, resolvedValue })}
                        <div class="flex flex-col min-w-0 flex-1 gap-0.5">
                          <span class="font-medium truncate">{resolvedLabel}</span>
                          <span class="text-xs text-muted-foreground truncate font-mono">{resolvedValue}</span>
                        </div>
                      {/snippet}
                    </ComboSelect>
                    <TranslatedFormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="description_key">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>
                      {$t('system.settings.security.create.descriptionKey')}
                      <FormLabelWithPriorityHelp
                        text={$t('app.common.optionalTooltipText')}
                        priority="INFORMATION"
                        title={$t('app.common.optionalTooltipTitle')}
                        labelKey="app.common.optional"
                      />
                    </FormLabel>
                    <ComboSelect
                      {...props}
                      mode="single"
                      value={$form.description_key}
                      onChange={handleDescriptionKeyChange}
                      options={descriptionKeyOptions}
                      valueField="key"
                      labelField="key"
                      isLabelTranslated={true}
                      allowCreate={true}
                      defaultSearch={descriptionKeyDefaultSearch}
                      placeholder={descriptionKeyPlaceholder}
                      searchPlaceholder={descriptionKeyPlaceholder}
                      data-testid="config-create-description-key"
                    >
                      {#snippet itemSnippet({ resolvedLabel, resolvedValue })}
                        <div class="flex flex-col min-w-0 flex-1 gap-0.5">
                          <span class="font-medium truncate">{resolvedLabel}</span>
                          <span class="text-xs text-muted-foreground truncate font-mono">{resolvedValue}</span>
                        </div>
                      {/snippet}
                    </ComboSelect>
                    <TranslatedFormFieldErrors />
                  </div>
                {/snippet}
              </FormControl>
            </FormField>

            <FormField form={superFormObj} name="group_key">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>
                      {$t('system.settings.security.create.groupKey')}
                      <FormLabelWithPriorityHelp
                        text={$t('app.common.optionalTooltipText')}
                        priority="INFORMATION"
                        title={$t('app.common.optionalTooltipTitle')}
                        labelKey="app.common.optional"
                      />
                    </FormLabel>
                    <ComboSelect
                      {...props}
                      mode="single"
                      value={$form.group_key}
                      onChange={handleGroupKeyChange}
                      options={groupKeyOptions}
                      valueField="group_key"
                      labelField="label_key"
                      isLabelTranslated={true}
                      allowCreate={true}
                      loading={groupKeysLoading}
                      getSearchKeywords={(opt) => {
                        const gk = (opt as Record<string, any>).group_key;
                        return gk ? [$t(`config.auth.group.${gk}`)] : [];
                      }}
                      placeholder={$t('system.settings.security.create.groupKeyPlaceholder')}
                      searchPlaceholder={$t('system.settings.security.create.groupKeySearch')}
                      data-testid="config-create-group-key"
                    >
                      {#snippet itemSnippet({ option, resolvedLabel, resolvedValue })}
                        {@const gk = (option as Record<string, any>).group_key ?? resolvedValue}
                        <div class="flex flex-col min-w-0 flex-1 gap-0.5">
                          <span class="font-medium truncate">{resolvedLabel}</span>
                          <span class="text-xs text-muted-foreground truncate font-mono">{gk}</span>
                        </div>
                      {/snippet}
                      {#snippet selectedSnippet({ resolvedLabel, resolvedValue })}
                        {#if isGroupKeyNew(resolvedValue)}
                          <Badge variant="outline" class="gap-1 border-primary-gradient-soft text-foreground">
                            {resolvedLabel}
                          </Badge>
                        {:else}
                          <span class="flex-1 truncate text-left">
                            {resolvedLabel}
                          </span>
                        {/if}
                      {/snippet}
                    </ComboSelect>
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
                  {$t('system.settings.security.create.reserved')}
                </span>
              </div>
              <p class="text-xs text-muted-foreground">{$t('system.settings.security.create.reservedHelp')}</p>
            </div>
          </div>

          <!-- Column 2: Type Config Builder -->
          <div class="space-y-4">
            <FormField form={superFormObj} name="type_config">
              <FormControl>
                {#snippet children({ props })}
                  <div class="space-y-2">
                    <FormLabel for={props.id}>{$t('system.settings.security.create.typeConfig')}</FormLabel>
                    <TypeConfigBuilder
                      type={$form.type as ConfigEntryType}
                      configKey={$form.key ?? ''}
                      type_config={$form.type_config || null}
                      onTypeConfigChange={(newConfig) => $form.type_config = newConfig}
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
  {/snippet}

  {#snippet footerActions()}
    <div class="flex gap-2">
      <Button variant="outline" onclick={handleCancel}>
        {$t('app.common.cancel')}
      </Button>
      <Button type="submit" form="config-create-form" disabled={!effectiveCanSave}>
        {$t('app.common.save')}
      </Button>
    </div>
  {/snippet}
</FormPageLayout>
