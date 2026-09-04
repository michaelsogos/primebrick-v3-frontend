<script lang="ts">
  import { t } from '$lib/i18n';
  import { Switch } from '$lib/components/ui/switch';
  import { TextInput } from '$lib/components/ui/input';
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
  const isStringType = $derived(type === 'string' || type === 'text' || type === 'secret');
  const isUrlType = $derived(type === 'url');

  // Local state for inputs that don't map 1:1 to builder mutators
  let minInput = $state<string>('');
  let maxInput = $state<string>('');
  let minErrorKey = $state<string>('');
  let maxErrorKey = $state<string>('');
  let regexPattern = $state<string>('');
  let regexErrorKey = $state<string>('');
  let urlProtocols = $state<string>('');
  let urlErrorKey = $state<string>('');
  let requiredErrorKey = $state<string>('');

  // Sync from builder state — only reads custom error_label_keys (auto keys
  // are no longer stored in state, so these stay empty unless user set one)
  $effect(() => {
    const v = builder.validation;
    if (v?.rules?.min) {
      minInput = String(v.rules.min.value);
      minErrorKey = v.rules.min.error_label_key ?? '';
    }
    if (v?.rules?.max) {
      maxInput = String(v.rules.max.value);
      maxErrorKey = v.rules.max.error_label_key ?? '';
    }
    if (v?.rules?.regex) {
      regexPattern = v.rules.regex.pattern;
      regexErrorKey = v.rules.regex.error_label_key ?? '';
    }
    if (v?.rules?.url) {
      urlProtocols = v.rules.url.protocols.join(', ');
      urlErrorKey = v.rules.url.error_label_key ?? '';
    }
    if (v?.required_error_label_key) {
      requiredErrorKey = v.required_error_label_key;
    }
  });

  function handleMinChange() {
    const val = minInput.trim() === '' ? null : Number(minInput);
    builder.setMin(val, minErrorKey || undefined);
  }

  function handleMaxChange() {
    const val = maxInput.trim() === '' ? null : Number(maxInput);
    builder.setMax(val, maxErrorKey || undefined);
  }

  function handleRegexChange() {
    builder.setRegex(regexPattern, regexErrorKey || undefined);
  }

  function handleUrlProtocolsChange() {
    const protocols = urlProtocols.split(',').map((p) => p.trim()).filter(Boolean);
    builder.setUrlProtocols(protocols, urlErrorKey || undefined);
  }

  function handleRequiredErrorKeyChange() {
    builder.setRequiredErrorLabelKey(requiredErrorKey);
  }
</script>

<div class="space-y-4">
  <h4 class="text-sm font-semibold text-muted-foreground">{$t('config.typeConfig.validationRules')}</h4>

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
        {$t('config.typeConfig.required')}
      </span>
    </div>
    <p class="text-xs text-muted-foreground">{$t('config.typeConfig.requiredHelp')}</p>
  </div>

  {#if builder.validation?.required}
    <div class="space-y-1">
      <Label for="tcb-required-error-key" class="text-xs text-muted-foreground">
        {$t('config.typeConfig.requiredErrorLabelKey')}
        <FormLabelWithPriorityHelp
          text={$t('common.optionalTooltipText')}
          priority="INFORMATION"
          title={$t('common.optionalTooltipTitle')}
          labelKey="common.optional"
        />
      </Label>
      <TextInput
        id="tcb-required-error-key"
        bind:value={requiredErrorKey}
        oninput={handleRequiredErrorKeyChange}
        placeholder="validation.required"
        class="text-xs"
        data-testid="tcb-required-error-key"
      />
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
          {$t('config.typeConfig.unsigned')}
        </span>
      </div>
      <p class="text-xs text-muted-foreground">{$t('config.typeConfig.unsignedHelp')}</p>
    </div>
  {/if}

  <!-- Min / Max -->
  <div class="grid grid-cols-2 gap-3">
    <div class="space-y-1">
      <Label for="tcb-min">{isNumericType ? $t('config.typeConfig.minValue') : $t('config.typeConfig.minLength')}</Label>
      <TextInput
        id="tcb-min"
        type="number"
        bind:value={minInput}
        oninput={handleMinChange}
        placeholder={isNumericType ? '0' : '1'}
        class="text-xs"
        data-testid="tcb-min"
      />
      {#if minInput.trim() !== ''}
        <Label for="tcb-min-error-key" class="text-xs text-muted-foreground">
          {$t('config.typeConfig.errorLabelKey')}
          <FormLabelWithPriorityHelp
            text={$t('common.optionalTooltipText')}
            priority="INFORMATION"
            title={$t('common.optionalTooltipTitle')}
            labelKey="common.optional"
          />
        </Label>
        <TextInput
          id="tcb-min-error-key"
          bind:value={minErrorKey}
          oninput={handleMinChange}
          placeholder={autoErrorLabelKey(configKey, 'min')}
          class="text-xs"
          data-testid="tcb-min-error-key"
        />
      {/if}
    </div>
    <div class="space-y-1">
      <Label for="tcb-max">{isNumericType ? $t('config.typeConfig.maxValue') : $t('config.typeConfig.maxLength')}</Label>
      <TextInput
        id="tcb-max"
        type="number"
        bind:value={maxInput}
        oninput={handleMaxChange}
        placeholder={isNumericType ? '999' : '65535'}
        class="text-xs"
        data-testid="tcb-max"
      />
      {#if maxInput.trim() !== ''}
        <Label for="tcb-max-error-key" class="text-xs text-muted-foreground">
          {$t('config.typeConfig.errorLabelKey')}
          <FormLabelWithPriorityHelp
            text={$t('common.optionalTooltipText')}
            priority="INFORMATION"
            title={$t('common.optionalTooltipTitle')}
            labelKey="common.optional"
          />
        </Label>
        <TextInput
          id="tcb-max-error-key"
          bind:value={maxErrorKey}
          oninput={handleMaxChange}
          placeholder={autoErrorLabelKey(configKey, 'max')}
          class="text-xs"
          data-testid="tcb-max-error-key"
        />
      {/if}
    </div>
  </div>

  <!-- URL protocols (url type only) -->
  {#if isUrlType}
    <div class="space-y-1">
      <Label for="tcb-url-protocols">{$t('config.typeConfig.urlProtocols')}</Label>
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
          {$t('config.typeConfig.errorLabelKey')}
          <FormLabelWithPriorityHelp
            text={$t('common.optionalTooltipText')}
            priority="INFORMATION"
            title={$t('common.optionalTooltipTitle')}
            labelKey="common.optional"
          />
        </Label>
        <TextInput
          id="tcb-url-error-key"
          bind:value={urlErrorKey}
          oninput={handleUrlProtocolsChange}
          placeholder={autoErrorLabelKey(configKey, 'url')}
          class="text-xs"
          data-testid="tcb-url-error-key"
        />
      {/if}
    </div>
  {/if}

  <!-- Email (string/text only) -->
  {#if isStringType}
    <div class="space-y-2">
      <div class="flex items-center gap-3">
        <Switch
          id="tcb-email"
          checked={!!builder.validation?.rules?.email}
          onCheckedChange={(checked) => builder.setEmail(checked)}
          data-testid="tcb-email"
        />
        <span class="text-sm font-medium leading-none">
          {$t('config.typeConfig.emailValidation')}
        </span>
      </div>
      <p class="text-xs text-muted-foreground">{$t('config.typeConfig.emailValidationHelp')}</p>
    </div>
  {/if}

  <!-- Regex (string/text/secret only) -->
  {#if isStringType}
    <div class="space-y-1">
      <Label for="tcb-regex">{$t('config.typeConfig.regexPattern')}</Label>
      <TextInput
        id="tcb-regex"
        bind:value={regexPattern}
        oninput={handleRegexChange}
        placeholder="^[A-Z]{3}$"
        class="font-mono text-xs"
        data-testid="tcb-regex"
      />
      {#if regexPattern.trim() !== ''}
        <Label for="tcb-regex-error-key" class="text-xs text-muted-foreground">
          {$t('config.typeConfig.errorLabelKey')}
          <FormLabelWithPriorityHelp
            text={$t('common.optionalTooltipText')}
            priority="INFORMATION"
            title={$t('common.optionalTooltipTitle')}
            labelKey="common.optional"
          />
        </Label>
        <TextInput
          id="tcb-regex-error-key"
          bind:value={regexErrorKey}
          oninput={handleRegexChange}
          placeholder={autoErrorLabelKey(configKey, 'regex')}
          class="text-xs"
          data-testid="tcb-regex-error-key"
        />
      {/if}
    </div>
  {/if}
</div>
