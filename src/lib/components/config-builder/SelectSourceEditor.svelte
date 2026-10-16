<script lang="ts">
  import { t } from '$lib/i18n';
  import { Label } from '$lib/components/ui/label';
  import { TextInput } from '$lib/components/ui/input';
  import ComboSelect from '$lib/components/ui/combo-select/combo-select.svelte';
  import { BUILTIN_VALUES_SOURCES } from '$lib/config/type-config-schema';
  import type { useTypeConfigBuilder } from '$lib/config/type-config-builder.svelte';

  let { builder }: { builder: ReturnType<typeof useTypeConfigBuilder> } = $props();

  // Source mode: 'builtin' | 'api' | 'inline'
  type SourceMode = 'builtin' | 'api' | 'inline';
  let sourceMode = $state<SourceMode>('builtin');

  // Local state for API fields
  let apiUrl = $state('');
  let apiVerb = $state('GET');
  let valueField = $state('');
  let labelField = $state('');

  // Sync from builder state on mount
  $effect(() => {
    const cfg = builder.selectConfig;
    if (cfg.values_source) {
      sourceMode = 'builtin';
    } else if (cfg.api_url) {
      sourceMode = 'api';
      apiUrl = cfg.api_url;
      apiVerb = cfg.api_verb ?? 'GET';
      valueField = cfg.value_field ?? '';
      labelField = cfg.label_field ?? '';
    }
  });

  // Built-in source options for ComboSelect
  const sourceOptions = $derived(
    BUILTIN_VALUES_SOURCES.map((s) => ({ value: s.id, label: s.id }))
  );

  function handleModeChange(mode: SourceMode) {
    sourceMode = mode;
    // Clear opposite config when switching modes
    if (mode === 'builtin') {
      builder.setApiUrl('');
      builder.setApiVerb('');
    } else if (mode === 'api') {
      builder.setValuesSource(null);
    }
  }

  function handleBuiltinSourceChange(value: string | string[]) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) {
      builder.setValuesSource(v);
      // Auto-fill value_field and label_field from the source definition
      const def = BUILTIN_VALUES_SOURCES.find((s) => s.id === v);
      if (def) {
        builder.setValueField(def.value_field);
        builder.setLabelField(def.label_field);
      }
    }
  }

  function handleApiUrlChange() {
    builder.setApiUrl(apiUrl);
  }

  function handleApiVerbChange() {
    builder.setApiVerb(apiVerb);
  }

  function handleValueFieldChange() {
    builder.setValueField(valueField);
  }

  function handleLabelFieldChange() {
    builder.setLabelField(labelField);
  }
</script>

<div class="space-y-4">
  <div class="space-y-2">
    <Label>{$t('system.settings.config.typeConfig.sourceMode')}</Label>
    <div class="flex gap-2">
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-md border {sourceMode === 'builtin' ? 'bg-primary text-primary-foreground' : 'border-border'}"
        onclick={() => handleModeChange('builtin')}
        data-testid="tcb-source-builtin"
      >{$t('system.settings.config.typeConfig.sourceBuiltin')}</button>
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-md border {sourceMode === 'api' ? 'bg-primary text-primary-foreground' : 'border-border'}"
        onclick={() => handleModeChange('api')}
        data-testid="tcb-source-api"
      >{$t('system.settings.config.typeConfig.sourceApi')}</button>
    </div>
  </div>

  {#if sourceMode === 'builtin'}
    <div class="space-y-1">
      <Label for="tcb-builtin-source">{$t('system.settings.config.typeConfig.builtinSource')}</Label>
      <ComboSelect
        mode="single"
        value={builder.selectConfig.values_source ?? ''}
        onChange={handleBuiltinSourceChange}
        options={sourceOptions}
        valueField="value"
        labelField="label"
        placeholder={$t('system.settings.config.typeConfig.selectSource')}
        data-testid="tcb-builtin-source"
      />
    </div>
  {:else if sourceMode === 'api'}
    <div class="space-y-3">
      <div class="space-y-1">
        <Label for="tcb-api-url">{$t('system.settings.config.typeConfig.apiUrl')}</Label>
        <TextInput
          id="tcb-api-url"
          bind:value={apiUrl}
          oninput={handleApiUrlChange}
          placeholder="https://api.example.com/items"
          class="text-xs"
          data-testid="tcb-api-url"
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1">
          <Label for="tcb-api-verb">{$t('system.settings.config.typeConfig.httpVerb')}</Label>
          <TextInput
            id="tcb-api-verb"
            bind:value={apiVerb}
            oninput={handleApiVerbChange}
            placeholder="GET"
            class="text-xs"
            data-testid="tcb-api-verb"
          />
        </div>
        <div class="space-y-1">
          <Label for="tcb-value-field">{$t('system.settings.config.typeConfig.valueField')}</Label>
          <TextInput
            id="tcb-value-field"
            bind:value={valueField}
            oninput={handleValueFieldChange}
            placeholder="id"
            class="text-xs"
            data-testid="tcb-value-field"
          />
        </div>
      </div>
      <div class="space-y-1">
        <Label for="tcb-label-field">{$t('system.settings.config.typeConfig.labelField')}</Label>
        <TextInput
          id="tcb-label-field"
          bind:value={labelField}
          oninput={handleLabelFieldChange}
          placeholder="name"
          class="text-xs"
          data-testid="tcb-label-field"
        />
      </div>
    </div>
  {/if}
</div>
