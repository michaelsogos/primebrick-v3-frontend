<script lang="ts">
  import { t } from '$lib/i18n';
  import { Label } from '$lib/components/ui/label';
  import ComboSelect from '$lib/components/ui/combo-select/combo-select.svelte';
  import { SelectableFieldset } from '$lib/components/ui/selectable-fieldset';
  import FormLabelWithPriorityHelp from '$lib/components/forms/FormLabelWithPriorityHelp.svelte';
  import { getAllCurrencies } from '$lib/currency';
  import { getCountryData, countries } from 'countries-list';
  import type { TCountryCode } from 'countries-list';
  import type { ConfigEntryType } from '$lib/api-types';
  import type { useTypeConfigBuilder } from '$lib/config/type-config-builder.svelte';
  import { useTypeCapabilities } from '$lib/composables/useTypeCapabilities.svelte';
  import { onMount } from 'svelte';
  import BadgeValuesEditor from './BadgeValuesEditor.svelte';
  import SelectSourceEditor from './SelectSourceEditor.svelte';

  let {
    type,
    configKey,
    builder,
  }: {
    type: ConfigEntryType;
    configKey: string;
    builder: ReturnType<typeof useTypeConfigBuilder>;
  } = $props();

  // Per-type capabilities — canonical matrix from @primebrick/sdk via
  // config_entry/meta (see useTypeCapabilities). Replaces hardcoded type checks.
  const typeCapabilities = useTypeCapabilities();
  onMount(() => void typeCapabilities.ensureLoaded());
  const caps = $derived(typeCapabilities.capabilitiesFor(type));
  const isMoney = $derived(caps.widget.currency === true);
  const isBadge = $derived(caps.widget.badge_values === true);
  const isSelect = $derived(caps.widget.select_source === true);
  const isUrl = $derived(caps.widget.url_protocols === true);
  const isPhone = $derived(caps.widget.country === true);

  // Currency options for money type
  const currencyOptions = $derived(
    getAllCurrencies().map((c) => ({ code: c.code, name: c.name }))
  );

  // Country options for phone type
  const countryOptions = $derived(
    Object.keys(countries).map((code) => ({
      code,
      name: getCountryData(code as TCountryCode).name,
    }))
  );

  // Protocol presets — allowCreate lets the user add non-standard ones.
  const protocolOptions = [
    { value: 'http' },
    { value: 'https' },
    { value: 'ftp' },
    { value: 'ws' },
    { value: 'wss' },
  ];

  // default_protocol is constrained to allowed_protocols (when set).
  const defaultProtocolOptions = $derived(
    (builder.urlConfig.allowed_protocols ?? []).length > 0
      ? (builder.urlConfig.allowed_protocols ?? []).map((p) => ({ value: p }))
      : protocolOptions
  );

  function handleCurrencyChange(value: string | string[]) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) builder.setCurrency(v);
  }

  function handleAllowedCurrenciesChange(value: string | string[]) {
    builder.setAllowedCurrencies(Array.isArray(value) ? value : [value]);
  }

  function handleAllowedProtocolsChange(value: string | string[]) {
    builder.setAllowedProtocols(Array.isArray(value) ? value : [value]);
  }

  function handleDefaultProtocolChange(value: string | string[]) {
    builder.setDefaultProtocol((Array.isArray(value) ? value[0] : value) || null);
  }

  function handleCountryChange(value: string | string[]) {
    builder.setCountry((Array.isArray(value) ? value[0] : value) || null);
  }

  function handleAllowedCountriesChange(value: string | string[]) {
    builder.setAllowedCountries(Array.isArray(value) ? value : [value]);
  }
</script>

{#if isMoney}
  <SelectableFieldset label={$t('system.settings.config.typeConfig.moneyConfig')}>
    <div class="space-y-1">
      <Label for="tcb-currency">
        {$t('system.settings.config.typeConfig.defaultCurrency')}
        <FormLabelWithPriorityHelp
          text={$t('system.settings.config.typeConfig.defaultCurrencyHelp')}
          priority="INFORMATION"
          title={$t('system.settings.config.typeConfig.defaultCurrency')}
          labelKey="app.common.optional"
        />
      </Label>
      <ComboSelect
        mode="single"
        value={builder.currency ?? 'EUR'}
        onChange={handleCurrencyChange}
        options={currencyOptions}
        valueField="code"
        labelField="name"
        placeholder={$t('system.settings.config.typeConfig.selectSource')}
        data-testid="tcb-currency"
      />
    </div>
    <div class="space-y-1">
      <Label for="tcb-allowed-currencies">
        {$t('system.settings.config.typeConfig.allowedCurrencies')}
        <FormLabelWithPriorityHelp
          text={$t('system.settings.config.typeConfig.allowedCurrenciesHelp')}
          priority="INFORMATION"
          title={$t('system.settings.config.typeConfig.allowedCurrencies')}
          labelKey="app.common.optional"
        />
      </Label>
      <ComboSelect
        mode="multi"
        value={builder.allowedCurrencies ?? []}
        onChange={handleAllowedCurrenciesChange}
        options={currencyOptions}
        valueField="code"
        labelField="name"
        placeholder={$t('system.settings.config.typeConfig.selectSource')}
        data-testid="tcb-allowed-currencies"
      />
    </div>
  </SelectableFieldset>
{:else if isBadge}
  <SelectableFieldset label={$t('system.settings.config.typeConfig.badgeValues')}>
    <BadgeValuesEditor {builder} {configKey} />
  </SelectableFieldset>
{:else if isSelect}
  <SelectableFieldset label={$t('system.settings.config.typeConfig.selectConfig')}>
    <SelectSourceEditor {builder} />
  </SelectableFieldset>
{:else if isUrl}
  <SelectableFieldset label={$t('system.settings.config.typeConfig.urlConfig')}>
    <div class="space-y-1">
      <Label for="tcb-allowed-protocols">
        {$t('system.settings.config.typeConfig.allowedProtocols')}
        <FormLabelWithPriorityHelp
          text={$t('system.settings.config.typeConfig.allowedProtocolsHelp')}
          priority="INFORMATION"
          title={$t('system.settings.config.typeConfig.allowedProtocols')}
          labelKey="app.common.optional"
        />
      </Label>
      <ComboSelect
        id="tcb-allowed-protocols"
        mode="multi"
        value={builder.urlConfig.allowed_protocols ?? []}
        onChange={handleAllowedProtocolsChange}
        options={protocolOptions}
        valueField="value"
        labelField="value"
        allowCreate={true}
        placeholder="http, https"
        data-testid="tcb-allowed-protocols"
      />
    </div>
    <div class="space-y-1">
      <Label for="tcb-default-protocol">
        {$t('system.settings.config.typeConfig.defaultProtocol')}
        <FormLabelWithPriorityHelp
          text={$t('system.settings.config.typeConfig.defaultProtocolHelp')}
          priority="INFORMATION"
          title={$t('system.settings.config.typeConfig.defaultProtocol')}
          labelKey="app.common.optional"
        />
      </Label>
      <ComboSelect
        id="tcb-default-protocol"
        mode="single"
        value={builder.urlConfig.default_protocol ?? ''}
        onChange={handleDefaultProtocolChange}
        options={defaultProtocolOptions}
        valueField="value"
        labelField="value"
        allowCreate={true}
        placeholder="https"
        data-testid="tcb-default-protocol"
      />
    </div>
  </SelectableFieldset>
{:else if isPhone}
  <SelectableFieldset label={$t('system.settings.config.typeConfig.phoneConfig')}>
    <div class="space-y-1">
      <Label for="tcb-country">
        {$t('system.settings.config.typeConfig.defaultCountry')}
        <FormLabelWithPriorityHelp
          text={$t('system.settings.config.typeConfig.defaultCountryHelp')}
          priority="INFORMATION"
          title={$t('system.settings.config.typeConfig.defaultCountry')}
          labelKey="app.common.optional"
        />
      </Label>
      <ComboSelect
        id="tcb-country"
        mode="single"
        value={builder.phoneConfig.country ?? ''}
        onChange={handleCountryChange}
        options={countryOptions}
        valueField="code"
        labelField="name"
        placeholder="IT"
        data-testid="tcb-country"
      />
    </div>
    <div class="space-y-1">
      <Label for="tcb-allowed-countries">
        {$t('system.settings.config.typeConfig.allowedCountries')}
        <FormLabelWithPriorityHelp
          text={$t('system.settings.config.typeConfig.allowedCountriesHelp')}
          priority="INFORMATION"
          title={$t('system.settings.config.typeConfig.allowedCountries')}
          labelKey="app.common.optional"
        />
      </Label>
      <ComboSelect
        id="tcb-allowed-countries"
        mode="multi"
        value={builder.phoneConfig.allowed_countries ?? []}
        onChange={handleAllowedCountriesChange}
        options={countryOptions}
        valueField="code"
        labelField="name"
        placeholder={$t('system.settings.config.typeConfig.selectSource')}
        data-testid="tcb-allowed-countries"
      />
    </div>
  </SelectableFieldset>
{/if}
