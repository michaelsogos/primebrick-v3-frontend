<script lang="ts">
  import { t, dict, getDictKeys } from '$lib/i18n';
  import { Switch } from '$lib/components/ui/switch';
  import { TextInput } from '$lib/components/ui/input';
  import { SmartRegexInput } from '$lib/components/ui/smart-regex-input';
  import ComboSelect from '$lib/components/ui/combo-select/combo-select.svelte';
  import { Label } from '$lib/components/ui/label';
  import FormLabelWithPriorityHelp from '$lib/components/forms/FormLabelWithPriorityHelp.svelte';
  import type { ConfigEntryType } from '$lib/api-types';
  import { autoErrorLabelKey } from '$lib/config/type-config-schema';
  import type { useTypeConfigBuilder } from '$lib/config/type-config-builder.svelte';

  let {
    type,
    configKey,
    builder,
  }: {
    type: ConfigEntryType;
    configKey: string;
    builder: ReturnType<typeof useTypeConfigBuilder>;
  } = $props();

  const isNumericType = $derived(type === 'bigint' || type === 'number' || type === 'money');
  // String-derived types: support min/max (length) and regex validation
  const isStringType = $derived(type === 'string' || type === 'text' || type === 'secret' || type === 'url' || type === 'email' || type === 'phone');
  const isUrlType = $derived(type === 'url');
  // Types that support min/max (numeric value or string length)
  const hasMinMax = $derived(isNumericType || isStringType);

  // All i18n keys for ComboSelect error_label_key selectors
  const allI18nKeys = $derived(getDictKeys($dict as Record<string, unknown>));
  const errorKeyOptions = $derived(allI18nKeys.map((k: string) => ({ key: k })));

  // Local state for inputs that don't map 1:1 to builder mutators
  let minInput = $state<string>('');
  let maxInput = $state<string>('');
  let minErrorKey = $state<string>('');
  let maxErrorKey = $state<string>('');
  let regexPattern = $state<string>('');
  let regexFlags = $state<string>('');
  let regexErrorKey = $state<string>('');
  let regexPatternError = $state<string | null>(null);
  let urlProtocols = $state<string>('');
  let urlErrorKey = $state<string>('');
  let requiredErrorKey = $state<string>('');

  // Sync from builder state — error_label_keys fall back to auto-generated
  // defaults (typed values, not placeholders) so the ComboSelect shows them
  // as selected and the user can override or pick a different key.
  $effect(() => {
    const v = builder.validation;
    if (v?.rules?.min) {
      minInput = String(v.rules.min.value);
      minErrorKey = v.rules.min.error_label_key ?? autoErrorLabelKey(configKey, 'min');
    }
    if (v?.rules?.max) {
      maxInput = String(v.rules.max.value);
      maxErrorKey = v.rules.max.error_label_key ?? autoErrorLabelKey(configKey, 'max');
    }
    if (v?.rules?.regex) {
      regexPattern = v.rules.regex.pattern;
      regexFlags = v.rules.regex.flags ?? '';
      regexErrorKey = v.rules.regex.error_label_key ?? autoErrorLabelKey(configKey, 'regex');
      // Validate existing pattern on load — use local var to avoid tracking regexPattern
      const p = v.rules.regex.pattern;
      const f = v.rules.regex.flags ?? '';
      if (p && p.trim() !== '') {
        try {
          new RegExp(p, f);
          regexPatternError = null;
        } catch {
          regexPatternError = $t('app.common.validation.invalidRegexPattern');
        }
      } else {
        regexPatternError = null;
      }
    }
    if (v?.rules?.url) {
      urlProtocols = v.rules.url.protocols.join(', ');
      urlErrorKey = v.rules.url.error_label_key ?? autoErrorLabelKey(configKey, 'url');
    }
    if (v?.required_error_label_key) {
      requiredErrorKey = v.required_error_label_key;
    } else if (v?.required) {
      requiredErrorKey = autoErrorLabelKey(configKey, 'required');
    }
  });

  function handleMinChange() {
    const val = (minInput ?? '').trim() === '' ? null : Number(minInput);
    builder.setMin(val, minErrorKey || undefined);
  }

  function handleMinErrorKeyChange(value: string | string[]) {
    minErrorKey = Array.isArray(value) ? value[0] ?? '' : value;
    handleMinChange();
  }

  function handleMaxChange() {
    const val = (maxInput ?? '').trim() === '' ? null : Number(maxInput);
    builder.setMax(val, maxErrorKey || undefined);
  }

  function handleMaxErrorKeyChange(value: string | string[]) {
    maxErrorKey = Array.isArray(value) ? value[0] ?? '' : value;
    handleMaxChange();
  }

  function handleRegexChange() {
    const pattern = (regexPattern ?? '').trim();
    if (pattern !== '') {
      try {
        new RegExp(pattern, regexFlags);
        regexPatternError = null;
      } catch {
        regexPatternError = $t('app.common.validation.invalidRegexPattern');
      }
    } else {
      regexPatternError = null;
    }
    builder.setRegex(regexPattern, regexFlags || undefined, regexErrorKey || undefined);
  }

  function handleRegexErrorKeyChange(value: string | string[]) {
    regexErrorKey = Array.isArray(value) ? value[0] ?? '' : value;
    handleRegexChange();
  }

  function handleUrlProtocolsChange() {
    const protocols = urlProtocols.split(',').map((p) => p.trim()).filter(Boolean);
    builder.setUrlProtocols(protocols, urlErrorKey || undefined);
  }

  function handleUrlErrorKeyChange(value: string | string[]) {
    urlErrorKey = Array.isArray(value) ? value[0] ?? '' : value;
    handleUrlProtocolsChange();
  }

  function handleRequiredErrorKeyChange() {
    builder.setRequiredErrorLabelKey(requiredErrorKey);
  }

  function handleRequiredErrorKeyComboChange(value: string | string[]) {
    requiredErrorKey = Array.isArray(value) ? value[0] ?? '' : value;
    handleRequiredErrorKeyChange();
  }
</script>

<div class="space-y-4">
  <h4 class="text-sm font-semibold text-muted-foreground">{$t('system.settings.config.typeConfig.validationRules')}</h4>

  <!-- Required -->
  <div class="space-y-2">
    <div class="flex items-center gap-3">
      <Switch
        id="tcb-required"
        checked={builder.validation?.required ?? false}
        onCheckedChange={(checked) => builder.setRequired(checked)}
        data-testid="tcb-required"
      />
      <span class="text-sm font-medium leading-none">
        {$t('system.settings.config.typeConfig.required')}
      </span>
    </div>
    <p class="text-xs text-muted-foreground">{$t('system.settings.config.typeConfig.requiredHelp')}</p>
  </div>

  {#if builder.validation?.required}
    <div class="space-y-1">
      <Label for="tcb-required-error-key" class="text-xs text-muted-foreground">
        {$t('system.settings.config.typeConfig.requiredErrorLabelKey')}
        <FormLabelWithPriorityHelp
          text={$t('app.common.optionalTooltipText')}
          priority="INFORMATION"
          title={$t('app.common.optionalTooltipTitle')}
          labelKey="app.common.optional"
        />
      </Label>
      <ComboSelect
        id="tcb-required-error-key"
        mode="single"
        value={requiredErrorKey}
        onChange={handleRequiredErrorKeyComboChange}
        options={errorKeyOptions}
        valueField="key"
        labelField="key"
        isLabelTranslated={true}
        allowCreate={true}
        defaultSearch={autoErrorLabelKey(configKey, 'required')}
        placeholder={autoErrorLabelKey(configKey, 'required')}
        searchPlaceholder={autoErrorLabelKey(configKey, 'required')}
        class="text-xs"
        data-testid="tcb-required-error-key"
      >
        {#snippet itemSnippet({ resolvedLabel, resolvedValue })}
          <div class="flex flex-col min-w-0 flex-1 gap-0.5">
            <span class="font-medium truncate">{resolvedLabel}</span>
            <span class="text-xs text-muted-foreground truncate font-mono">{resolvedValue}</span>
          </div>
        {/snippet}
      </ComboSelect>
    </div>
  {/if}

  <!-- Unsigned (numeric only) -->
  {#if isNumericType}
    <div class="space-y-2">
      <div class="flex items-center gap-3">
        <Switch
          id="tcb-unsigned"
          checked={builder.validation?.unsigned === true}
          onCheckedChange={(checked) => builder.setUnsigned(checked)}
          data-testid="tcb-unsigned"
        />
        <span class="text-sm font-medium leading-none">
          {$t('system.settings.config.typeConfig.unsigned')}
        </span>
      </div>
      <p class="text-xs text-muted-foreground">{$t('system.settings.config.typeConfig.unsignedHelp')}</p>
    </div>
  {/if}

  <!-- Min / Max (numeric types: value; string-derived types: length) -->
  {#if hasMinMax}
  <div class="grid grid-cols-2 gap-3">
    <div class="space-y-1">
      <Label for="tcb-min">
        {isNumericType ? $t('system.settings.config.typeConfig.minValue') : $t('system.settings.config.typeConfig.minLength')}
        <FormLabelWithPriorityHelp
          text={$t('app.common.optionalTooltipText')}
          priority="INFORMATION"
          title={$t('app.common.optionalTooltipTitle')}
          labelKey="app.common.optional"
        />
      </Label>
      <TextInput
        id="tcb-min"
        type="number"
        bind:value={minInput}
        oninput={handleMinChange}
        placeholder={isNumericType ? '0' : '1'}
        class="text-xs"
        data-testid="tcb-min"
      />
      {#if (minInput ?? '').trim() !== ''}
        <Label for="tcb-min-error-key" class="text-xs text-muted-foreground">
          {$t('system.settings.config.typeConfig.minErrorLabelKey')}
          <FormLabelWithPriorityHelp
            text={$t('app.common.optionalTooltipText')}
            priority="INFORMATION"
            title={$t('app.common.optionalTooltipTitle')}
            labelKey="app.common.optional"
          />
        </Label>
        <ComboSelect
          id="tcb-min-error-key"
          mode="single"
          value={minErrorKey}
          onChange={handleMinErrorKeyChange}
          options={errorKeyOptions}
          valueField="key"
          labelField="key"
          isLabelTranslated={true}
          allowCreate={true}
          defaultSearch={autoErrorLabelKey(configKey, 'min')}
          placeholder={autoErrorLabelKey(configKey, 'min')}
          searchPlaceholder={autoErrorLabelKey(configKey, 'min')}
          class="text-xs"
          data-testid="tcb-min-error-key"
        >
          {#snippet itemSnippet({ resolvedLabel, resolvedValue })}
            <div class="flex flex-col min-w-0 flex-1 gap-0.5">
              <span class="font-medium truncate">{resolvedLabel}</span>
              <span class="text-xs text-muted-foreground truncate font-mono">{resolvedValue}</span>
            </div>
          {/snippet}
        </ComboSelect>
      {/if}
    </div>
    <div class="space-y-1">
      <Label for="tcb-max">
        {isNumericType ? $t('system.settings.config.typeConfig.maxValue') : $t('system.settings.config.typeConfig.maxLength')}
        <FormLabelWithPriorityHelp
          text={$t('app.common.optionalTooltipText')}
          priority="INFORMATION"
          title={$t('app.common.optionalTooltipTitle')}
          labelKey="app.common.optional"
        />
      </Label>
      <TextInput
        id="tcb-max"
        type="number"
        bind:value={maxInput}
        oninput={handleMaxChange}
        placeholder={isNumericType ? '999' : '65535'}
        class="text-xs"
        data-testid="tcb-max"
      />
      {#if (maxInput ?? '').trim() !== ''}
        <Label for="tcb-max-error-key" class="text-xs text-muted-foreground">
          {$t('system.settings.config.typeConfig.maxErrorLabelKey')}
          <FormLabelWithPriorityHelp
            text={$t('app.common.optionalTooltipText')}
            priority="INFORMATION"
            title={$t('app.common.optionalTooltipTitle')}
            labelKey="app.common.optional"
          />
        </Label>
        <ComboSelect
          id="tcb-max-error-key"
          mode="single"
          value={maxErrorKey}
          onChange={handleMaxErrorKeyChange}
          options={errorKeyOptions}
          valueField="key"
          labelField="key"
          isLabelTranslated={true}
          allowCreate={true}
          defaultSearch={autoErrorLabelKey(configKey, 'max')}
          placeholder={autoErrorLabelKey(configKey, 'max')}
          searchPlaceholder={autoErrorLabelKey(configKey, 'max')}
          class="text-xs"
          data-testid="tcb-max-error-key"
        >
          {#snippet itemSnippet({ resolvedLabel, resolvedValue })}
            <div class="flex flex-col min-w-0 flex-1 gap-0.5">
              <span class="font-medium truncate">{resolvedLabel}</span>
              <span class="text-xs text-muted-foreground truncate font-mono">{resolvedValue}</span>
            </div>
          {/snippet}
        </ComboSelect>
      {/if}
    </div>
  </div>
  {/if}

  <!-- URL protocols (url type only) -->
  {#if isUrlType}
    <div class="space-y-1">
      <Label for="tcb-url-protocols">
        {$t('system.settings.config.typeConfig.urlProtocols')}
        <FormLabelWithPriorityHelp
          text={$t('app.common.optionalTooltipText')}
          priority="INFORMATION"
          title={$t('app.common.optionalTooltipTitle')}
          labelKey="app.common.optional"
        />
      </Label>
      <TextInput
        id="tcb-url-protocols"
        bind:value={urlProtocols}
        oninput={handleUrlProtocolsChange}
        placeholder="http, https"
        class="text-xs"
        data-testid="tcb-url-protocols"
      />
      {#if urlProtocols.trim() !== ''}
        <Label for="tcb-url-error-key" class="text-xs text-muted-foreground">
          {$t('system.settings.config.typeConfig.urlErrorLabelKey')}
          <FormLabelWithPriorityHelp
            text={$t('app.common.optionalTooltipText')}
            priority="INFORMATION"
            title={$t('app.common.optionalTooltipTitle')}
            labelKey="app.common.optional"
          />
        </Label>
        <ComboSelect
          id="tcb-url-error-key"
          mode="single"
          value={urlErrorKey}
          onChange={handleUrlErrorKeyChange}
          options={errorKeyOptions}
          valueField="key"
          labelField="key"
          isLabelTranslated={true}
          allowCreate={true}
          defaultSearch={autoErrorLabelKey(configKey, 'url')}
          placeholder={autoErrorLabelKey(configKey, 'url')}
          searchPlaceholder={autoErrorLabelKey(configKey, 'url')}
          class="text-xs"
          data-testid="tcb-url-error-key"
        >
          {#snippet itemSnippet({ resolvedLabel, resolvedValue })}
            <div class="flex flex-col min-w-0 flex-1 gap-0.5">
              <span class="font-medium truncate">{resolvedLabel}</span>
              <span class="text-xs text-muted-foreground truncate font-mono">{resolvedValue}</span>
            </div>
          {/snippet}
        </ComboSelect>
      {/if}
    </div>
  {/if}

  <!-- Email validation rule is deprecated — email is now a TYPE with inherent validation -->
  <!-- No email rule switch needed for string/text types -->

  <!-- Regex (string-derived types: string, text, secret, url, email, phone) -->
  {#if isStringType}
    <div class="space-y-1">
      <Label for="tcb-regex">
        {$t('system.settings.config.typeConfig.regexPattern')}
        <FormLabelWithPriorityHelp
          text={$t('app.common.optionalTooltipText')}
          priority="INFORMATION"
          title={$t('app.common.optionalTooltipTitle')}
          labelKey="app.common.optional"
        />
      </Label>
      <SmartRegexInput
        id="tcb-regex"
        bind:value={regexPattern}
        bind:flags={regexFlags}
        on_change={() => handleRegexChange()}
        placeholder="^[A-Z]{3}$"
        class="font-mono text-xs"
        config_type={type as 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone'}
        data-testid="tcb-regex"
      />
      {#if regexPatternError}
        <p class="text-xs text-destructive" data-testid="tcb-regex-error">
          {regexPatternError}
        </p>
      {/if}
      {#if (regexPattern ?? '').trim() !== ''}
        <Label for="tcb-regex-error-key" class="text-xs text-muted-foreground">
          {$t('system.settings.config.typeConfig.regexErrorLabelKey')}
          <FormLabelWithPriorityHelp
            text={$t('app.common.optionalTooltipText')}
            priority="INFORMATION"
            title={$t('app.common.optionalTooltipTitle')}
            labelKey="app.common.optional"
          />
        </Label>
        <ComboSelect
          id="tcb-regex-error-key"
          mode="single"
          value={regexErrorKey}
          onChange={handleRegexErrorKeyChange}
          options={errorKeyOptions}
          valueField="key"
          labelField="key"
          isLabelTranslated={true}
          allowCreate={true}
          defaultSearch={autoErrorLabelKey(configKey, 'regex')}
          placeholder={autoErrorLabelKey(configKey, 'regex')}
          searchPlaceholder={autoErrorLabelKey(configKey, 'regex')}
          class="text-xs"
          data-testid="tcb-regex-error-key"
        >
          {#snippet itemSnippet({ resolvedLabel, resolvedValue })}
            <div class="flex flex-col min-w-0 flex-1 gap-0.5">
              <span class="font-medium truncate">{resolvedLabel}</span>
              <span class="text-xs text-muted-foreground truncate font-mono">{resolvedValue}</span>
            </div>
          {/snippet}
        </ComboSelect>
      {/if}
    </div>
  {/if}
</div>
