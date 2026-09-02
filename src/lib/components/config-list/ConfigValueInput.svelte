<script lang="ts">
  import { t } from '$lib/i18n';
  import { Switch } from '$lib/components/ui/switch';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { ComboSelect } from '$lib/components/ui/combo-select';
  import DateWheelPicker from '$lib/components/date-dropper/date-wheel-picker.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Password from '$lib/components/ui/password';
  import { NumericInput } from '$lib/components/ui/numeric-input';
  import type { ConfigEntryType } from '$lib/api-types';
  import { currencySymbol } from '$lib/currency';

  let {
    type,
    type_config = null,
    fieldKey = 'field',
    value = $bindable(''),
    errors = [],
    onChange,
    onTypeConfigChange,
  }: {
    type: ConfigEntryType;
    type_config?: string | null;
    fieldKey?: string;
    value: string | bigint | number;
    errors?: string[];
    onChange?: (value: string | bigint | number) => void;
    /** Called when the user changes the currency via the currency selection sheet. */
    onTypeConfigChange?: (typeConfig: string) => void;
  } = $props();

  // Local editing state — synced from prop, used for bind:value in inputs.
  // The parent owns the authoritative form state (ConfigList via taint tracking,
  // or SuperForms via $form.value in the create page).
  // For bigint/number types, the BE sends native types; we convert to string
  // for display in text inputs, and convert back to native on change.
  // svelte-ignore state_referenced_locally -- local mutable state initialized from a prop, then reassigned on change.
  let localValue = $state<string>(String(value));

  // Sync local value when the prop changes (e.g. after bulk save reset, or
  // when SuperForms resets the form). Supports both bind:value and value+onChange modes.
  // svelte-ignore state_referenced_locally -- local mutable state initialized from a prop, then reassigned on change.
  let lastValue = $state<string | bigint | number>(value);
  $effect(() => {
    if (value !== lastValue) {
      localValue = String(value);
      lastValue = value;
    }
  });

  // Parse type_config for badge type
  let badgeOptions = $derived.by<Record<string, { label_key?: string; color?: string }>>(() => {
    if (type !== 'badge' || !type_config) return {};
    try {
      const config = JSON.parse(type_config);
      return config.values ?? {};
    } catch {
      return {};
    }
  });

  // Build ComboSelect options for badge type
  let badgeComboOptions = $derived(
    Object.entries(badgeOptions).map(([val, meta]) => ({
      value: val,
      label_key: meta.label_key,
      color: meta.color,
    })),
  );

  // Parse type_config for list type
  let listConfig = $derived.by<{
    api_url?: string;
    api_verb?: string;
    value_field?: string;
    label_field?: string;
  } | null>(() => {
    if (type !== 'list' || !type_config) return null;
    try {
      return JSON.parse(type_config);
    } catch {
      return null;
    }
  });

  // List options loaded from BE API
  let listOptions = $state<Record<string, string>[]>([]);
  let listLoading = $state(false);

  // Money: extract currency from type_config and derive symbol
  let moneyCurrency = $derived.by<string>(() => {
    if (type !== 'money' || !type_config) return 'EUR';
    try {
      const config = JSON.parse(type_config) as { currency?: string };
      return config.currency ?? 'EUR';
    } catch {
      return 'EUR';
    }
  });

  let moneyCurrencySymbol = $derived.by<string>(() => {
    if (type !== 'money') return '';
    return currencySymbol(moneyCurrency);
  });

  // Handle currency change from the currency selection sheet.
  // Updates type_config JSON with the new currency code and notifies the parent.
  function handleCurrencyChange(code: string) {
    if (!onTypeConfigChange) return;
    let config: Record<string, unknown> = {};
    if (type_config) {
      try { config = JSON.parse(type_config) as Record<string, unknown>; } catch { /* start fresh */ }
    }
    config.currency = code;
    onTypeConfigChange(JSON.stringify(config));
  }

  // String representation of value for display in select/input components
  // that expect string (ComboSelect, Switch, etc.)
  let stringValue = $derived(String(value ?? ''));

  // Load list options when the entry is a list type
  $effect(() => {
    if (type !== 'list' || !listConfig?.api_url) return;
    listLoading = true;
    fetch(listConfig.api_url, { method: listConfig.api_verb ?? 'GET' })
      .then((res) => res.json())
      .then((data) => {
        const arr: Record<string, string>[] = Array.isArray(data)
          ? data
          : data.rows ?? data.roles ?? data.organizations ?? data.services ?? [];
        listOptions = arr as Record<string, string>[];
      })
      .catch(() => {
        listOptions = [];
      })
      .finally(() => {
        listLoading = false;
      });
  });

  // Notify parent of value changes — works for both bind:value and onChange modes.
  // Writes to `value` (the bindable) for bind:value mode, and calls `onChange`
  // if provided for the value+onChange mode.
  // For bigint/number/money types, converts the string display value to the
  // native JS type before notifying the parent.
  function notifyChange(newValue: string) {
    let nativeValue: string | bigint | number = newValue;
    if (type === 'bigint' && newValue !== '') {
      try { nativeValue = BigInt(newValue); } catch { /* keep as string */ }
    } else if ((type === 'number' || type === 'money') && newValue !== '') {
      const n = Number(newValue);
      if (!isNaN(n)) nativeValue = n;
    }
    if (nativeValue !== lastValue) {
      lastValue = nativeValue;
      value = nativeValue;
      onChange?.(nativeValue);
    }
  }

  // Boolean: toggle immediately
  function handleBooleanChange(checked: boolean) {
    const v = checked ? 'true' : 'false';
    localValue = v;
    notifyChange(v);
  }

  // Badge: change immediately
  function handleBadgeChange(val: string | string[]) {
    const v = Array.isArray(val) ? val[0] ?? '' : val;
    localValue = v;
    notifyChange(v);
  }

  // List: change immediately
  function handleListChange(val: string | string[]) {
    const v = Array.isArray(val) ? val[0] ?? '' : val;
    localValue = v;
    notifyChange(v);
  }

  // Text-like inputs: notify on every keystroke so SuperForms validates
  // in real-time (matching how the KEY field works with bind:value={$form.key}).
  // Without this, $form.value only updates on blur, and SuperForms' onChange
  // callback never fires during typing — validation appears broken.
  function handleInput() {
    notifyChange(localValue);
  }

  // Also notify on blur (catches programmatic changes, DateWheelPicker button, etc.)
  function handleBlur() {
    notifyChange(localValue);
  }

  // First error message for this field — uses the same `key|jsonParams` format
  // as TranslatedFormFieldErrors (translated-field-errors.svelte).
  let firstError = $derived(errors.length > 0 ? errors[0] : '');
  let ariaInvalid = $derived(!!firstError);

  // Translate error using the standard `translationKey|jsonParams` convention.
  function translateError(error: string): string {
    if (!error.includes('|')) return $t(error);
    const [key, jsonParams] = error.split('|', 2);
    try {
      const params = JSON.parse(jsonParams);
      return $t(key, params);
    } catch {
      return $t(key);
    }
  }

  let translatedError = $derived(firstError ? translateError(firstError) : '');
</script>

{#if type === 'boolean'}
  <Switch
    checked={stringValue === 'true'}
    onCheckedChange={handleBooleanChange}
    data-testid={`config-input-boolean-${fieldKey}`}
  />
{:else if type === 'badge'}
  <div class="w-full">
    <ComboSelect
      mode="single"
      value={stringValue}
      onChange={handleBadgeChange}
      options={badgeComboOptions}
      valueField="value"
      labelField="label_key"
      isLabelTranslated
      aria-invalid={ariaInvalid}
      placeholder={$t('common.selectValue')}
      data-testid={`config-input-badge-${fieldKey}`}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if type === 'list'}
  <div class="w-full">
    <ComboSelect
      mode="single"
      value={stringValue}
      onChange={handleListChange}
      options={listOptions}
      valueField={listConfig?.value_field ?? 'value'}
      labelField={listConfig?.label_field ?? 'label_key'}
      isLabelTranslated
      aria-invalid={ariaInvalid}
      placeholder={$t('common.selectValue')}
      disabled={listLoading}
      loading={listLoading}
      data-testid={`config-input-list-${fieldKey}`}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if type === 'bigint' || type === 'number'}
  <NumericInput
    type={type as 'bigint' | 'number' | 'money'}
    {type_config}
    bind:value
    errors={errors}
    {onChange}
    data-testid={`config-input-number-${fieldKey}`}
  />
{:else if type === 'money'}
  <NumericInput
    type="money"
    {type_config}
    bind:value
    errors={errors}
    {onChange}
    currencySymbol={moneyCurrencySymbol}
    currencyCode={moneyCurrency}
    onCurrencyChange={onTypeConfigChange ? handleCurrencyChange : undefined}
    data-testid={`config-input-money-${fieldKey}`}
  />
{:else if type === 'date'}
  <div class="w-full">
    <DateWheelPicker
      bind:value={localValue}
      includeTime={false}
      placeholder={$t('common.selectDate')}
    />
    {#if localValue}
      <Button
        variant="ghost"
        size="sm"
        onclick={handleBlur}
        class="ml-2"
      >
        {$t('common.save')}
      </Button>
    {/if}
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if type === 'datetime'}
  <div class="w-full">
    <DateWheelPicker
      bind:value={localValue}
      includeTime={true}
      placeholder={$t('common.selectDate')}
    />
    {#if localValue}
      <Button
        variant="ghost"
        size="sm"
        onclick={handleBlur}
        class="ml-2"
      >
        {$t('common.save')}
      </Button>
    {/if}
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if type === 'time'}
  <div class="w-full">
    <Input
      type="time"
      bind:value={localValue}
      oninput={handleInput}
      onblur={handleBlur}
      aria-invalid={ariaInvalid}
      class="w-full"
      data-testid={`config-input-time-${fieldKey}`}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if type === 'secret'}
  <div class="w-full">
    <Password.Root class="w-full">
      <Password.Input
        bind:value={localValue}
        oninput={handleInput}
        onblur={handleBlur}
        class="w-full"
        data-testid={`config-input-secret-${fieldKey}`}
      >
        <Password.ToggleVisibility />
      </Password.Input>
    </Password.Root>
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if type === 'url'}
  <div class="w-full">
    <Input
      type="url"
      bind:value={localValue}
      oninput={handleInput}
      onblur={handleBlur}
      aria-invalid={ariaInvalid}
      class="w-full"
      data-testid={`config-input-url-${fieldKey}`}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if type === 'text' || type === 'json'}
  <div class="w-full">
    <Textarea
      bind:value={localValue}
      oninput={handleInput}
      onblur={handleBlur}
      aria-invalid={ariaInvalid}
      class="w-full min-h-[80px]"
      data-testid={`config-input-text-${fieldKey}`}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else}
  <div class="w-full">
    <Input
      type="text"
      bind:value={localValue}
      oninput={handleInput}
      onblur={handleBlur}
      aria-invalid={ariaInvalid}
      class="w-full"
      data-testid={`config-input-string-${fieldKey}`}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{/if}
