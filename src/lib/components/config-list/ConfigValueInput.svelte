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
    onSave,
  }: {
    entry: ConfigEntry;
    onSave: (value: string) => Promise<void>;
  } = $props();

  // Local editing state — initialized from the entry value.
  // svelte-ignore state_referenced_locally -- local mutable state initialized from a prop, then reassigned on save.
  let localValue = $state(entry.value ?? '');
  let isSaving = $state(false);

  // Reset local value when entry changes (e.g. after external refresh)
  // svelte-ignore state_referenced_locally -- local mutable state initialized from a prop, then reassigned on save.
  let lastUuid = $state(entry.uuid);
  $effect(() => {
    if (entry.uuid !== lastUuid) {
      localValue = entry.value ?? '';
      lastUuid = entry.uuid;
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
    Object.entries(badgeOptions).map(([value, meta]) => ({
      value,
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
        // Extract array from common response shapes
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

  async function save(value: string) {
    isSaving = true;
    try {
      await onSave(value);
    } finally {
      isSaving = false;
    }
  }

  // Boolean: save immediately on toggle
  function handleBooleanChange(checked: boolean) {
    save(checked ? 'true' : 'false');
  }

  // Badge: save on change
  function handleBadgeChange(value: string | string[]) {
    const v = Array.isArray(value) ? value[0] ?? '' : value;
    localValue = v;
    save(v);
  }

  // List: save on change
  function handleListChange(value: string | string[]) {
    const v = Array.isArray(value) ? value[0] ?? '' : value;
    localValue = v;
    save(v);
  }

  // Text/number/url/date: save on blur
  function handleBlur() {
    if (localValue !== (entry.value ?? '')) {
      save(localValue);
    }
  }

  // Secret: save on button click
  function handleSecretSave() {
    if (localValue) {
      save(localValue);
      localValue = '';
    }
  }
</script>

{#if entry.type === 'boolean'}
  <Switch
    checked={entry.value === 'true'}
    onCheckedChange={handleBooleanChange}
    disabled={isSaving}
    data-testid={`config-input-boolean-${entry.key}`}
  />
{:else if entry.type === 'badge'}
  <ComboSelect
    mode="single"
    value={entry.value ?? ''}
    onChange={handleBadgeChange}
    options={badgeComboOptions}
    valueField="value"
    labelField="label_key"
    isLabelTranslated
    placeholder={$t('common.selectValue')}
    disabled={isSaving}
    data-testid={`config-input-badge-${entry.key}`}
  />
{:else if entry.type === 'list'}
  <ComboSelect
    mode="single"
    value={entry.value ?? ''}
    onChange={handleListChange}
    options={listOptions}
    valueField={listConfig?.value_field ?? 'value'}
    labelField={listConfig?.label_field ?? 'label_key'}
    isLabelTranslated
    placeholder={$t('common.selectValue')}
    disabled={isSaving || listLoading}
    loading={listLoading}
    data-testid={`config-input-list-${entry.key}`}
  />
{:else if entry.type === 'integer' || entry.type === 'number'}
  <Input
    type="number"
    value={localValue}
    onblur={handleBlur}
    disabled={isSaving}
    class="w-full"
    data-testid={`config-input-number-${entry.key}`}
  />
{:else if entry.type === 'date'}
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
      disabled={isSaving}
      class="ml-2"
    >
      {$t('common.save')}
    </Button>
  {/if}
{:else if entry.type === 'datetime'}
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
      disabled={isSaving}
      class="ml-2"
    >
      {$t('common.save')}
    </Button>
  {/if}
{:else if entry.type === 'time'}
  <!-- DateWheelPicker has no time-only mode — use native time input as fallback -->
  <Input
    type="time"
    value={localValue}
    onblur={handleBlur}
    disabled={isSaving}
    class="w-full"
    data-testid={`config-input-time-${entry.key}`}
  />
{:else if entry.type === 'secret'}
  <Password.Root class="w-full">
    <Password.Input
      bind:value={localValue}
      onblur={handleBlur}
      disabled={isSaving}
      class="w-full"
      data-testid={`config-input-secret-${entry.key}`}
    >
      <Password.ToggleVisibility />
    </Password.Input>
  </Password.Root>
{:else if entry.type === 'url'}
  <Input
    type="url"
    value={localValue}
    onblur={handleBlur}
    disabled={isSaving}
    class="w-full"
    data-testid={`config-input-url-${entry.key}`}
  />
{:else if entry.type === 'text' || entry.type === 'json'}
  <Textarea
    value={localValue}
    onblur={handleBlur}
    disabled={isSaving}
    class="w-full min-h-[80px]"
    data-testid={`config-input-text-${entry.key}`}
  />
{:else}
  <!-- string and any unknown type: plain text input -->
  <Input
    type="text"
    value={localValue}
    onblur={handleBlur}
    disabled={isSaving}
    class="w-full"
    data-testid={`config-input-string-${entry.key}`}
  />
{/if}
