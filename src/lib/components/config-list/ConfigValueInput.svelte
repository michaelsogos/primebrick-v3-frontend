<script lang="ts">
  import { t } from '$lib/i18n';
  import { Switch } from '$lib/components/ui/switch';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { ComboSelect } from '$lib/components/ui/combo-select';
  import DateWheelPicker from '$lib/components/date-dropper/date-wheel-picker.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Password from '$lib/components/ui/password';
  import type { ConfigEntry } from '$lib/api-types';

  let {
    entry,
    value,
    errors = [],
    onChange,
  }: {
    entry: ConfigEntry;
    value: string;
    errors?: string[];
    onChange: (value: string) => void;
  } = $props();

  // Local editing state — synced from prop, used for bind:value in inputs.
  // The parent (ConfigList) owns the authoritative form state via taint tracking.
  // svelte-ignore state_referenced_locally -- local mutable state initialized from a prop, then reassigned on change.
  let localValue = $state(value);

  // Sync local value when the prop changes (e.g. after bulk save reset)
  // svelte-ignore state_referenced_locally -- local mutable state initialized from a prop, then reassigned on change.
  let lastValue = $state(value);
  $effect(() => {
    if (value !== lastValue) {
      localValue = value;
      lastValue = value;
    }
  });

  // Parse type_config for badge type
  let badgeOptions = $derived.by<Record<string, { label_key?: string; color?: string }>>(() => {
    if (entry.type !== 'badge' || !entry.type_config) return {};
    try {
      const config = JSON.parse(entry.type_config);
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
    if (entry.type !== 'list' || !entry.type_config) return null;
    try {
      return JSON.parse(entry.type_config);
    } catch {
      return null;
    }
  });

  // List options loaded from BE API
  let listOptions = $state<Record<string, string>[]>([]);
  let listLoading = $state(false);

  // Load list options when the entry is a list type
  $effect(() => {
    if (entry.type !== 'list' || !listConfig?.api_url) return;
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

  // Notify parent of value changes
  function notifyChange(newValue: string) {
    if (newValue !== lastValue) {
      lastValue = newValue;
      onChange(newValue);
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

  // Text/number/url/date: notify on blur
  function handleBlur() {
    // Ensure string — Svelte's bind:value with type="number" converts to number,
    // but the DAL stores everything as string and validation expects string.
    const v = typeof localValue === 'number' ? String(localValue) : localValue;
    notifyChange(v);
  }

  // For inputs that update localValue on input
  function handleInput() {
    // Don't notify on every keystroke — wait for blur
    // But do update localValue via bind:value
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

{#if entry.type === 'boolean'}
  <Switch
    checked={value === 'true'}
    onCheckedChange={handleBooleanChange}
    data-testid={`config-input-boolean-${entry.key}`}
  />
{:else if entry.type === 'badge'}
  <div class="w-full">
    <ComboSelect
      mode="single"
      value={value}
      onChange={handleBadgeChange}
      options={badgeComboOptions}
      valueField="value"
      labelField="label_key"
      isLabelTranslated
      aria-invalid={ariaInvalid}
      placeholder={$t('common.selectValue')}
      data-testid={`config-input-badge-${entry.key}`}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if entry.type === 'list'}
  <div class="w-full">
    <ComboSelect
      mode="single"
      value={value}
      onChange={handleListChange}
      options={listOptions}
      valueField={listConfig?.value_field ?? 'value'}
      labelField={listConfig?.label_field ?? 'label_key'}
      isLabelTranslated
      aria-invalid={ariaInvalid}
      placeholder={$t('common.selectValue')}
      disabled={listLoading}
      loading={listLoading}
      data-testid={`config-input-list-${entry.key}`}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if entry.type === 'integer' || entry.type === 'number'}
  <div class="w-full">
    <Input
      type="number"
      bind:value={localValue}
      onblur={handleBlur}
      aria-invalid={ariaInvalid}
      class="w-full"
      data-testid={`config-input-number-${entry.key}`}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if entry.type === 'date'}
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
{:else if entry.type === 'datetime'}
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
{:else if entry.type === 'time'}
  <div class="w-full">
    <Input
      type="time"
      bind:value={localValue}
      onblur={handleBlur}
      aria-invalid={ariaInvalid}
      class="w-full"
      data-testid={`config-input-time-${entry.key}`}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if entry.type === 'secret'}
  <div class="w-full">
    <Password.Root class="w-full">
      <Password.Input
        bind:value={localValue}
        onblur={handleBlur}
        class="w-full"
        data-testid={`config-input-secret-${entry.key}`}
      >
        <Password.ToggleVisibility />
      </Password.Input>
    </Password.Root>
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if entry.type === 'url'}
  <div class="w-full">
    <Input
      type="url"
      bind:value={localValue}
      onblur={handleBlur}
      aria-invalid={ariaInvalid}
      class="w-full"
      data-testid={`config-input-url-${entry.key}`}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{:else if entry.type === 'text' || entry.type === 'json'}
  <div class="w-full">
    <Textarea
      bind:value={localValue}
      onblur={handleBlur}
      aria-invalid={ariaInvalid}
      class="w-full min-h-[80px]"
      data-testid={`config-input-text-${entry.key}`}
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
      onblur={handleBlur}
      aria-invalid={ariaInvalid}
      class="w-full"
      data-testid={`config-input-string-${entry.key}`}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
{/if}
