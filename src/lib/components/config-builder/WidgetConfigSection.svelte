<script lang="ts">
  import { t } from '$lib/i18n';
  import { Label } from '$lib/components/ui/label';
  import { TextInput } from '$lib/components/ui/input';
  import ComboSelect from '$lib/components/ui/combo-select/combo-select.svelte';
  import { getAllCurrencies } from '$lib/currency';
  import type { ConfigEntryType } from '$lib/api-types';
  import type { useTypeConfigBuilder } from '$lib/config/type-config-builder.svelte';
  import { useTypeCapabilities } from '$lib/composables/useTypeCapabilities.svelte';
  import { onMount } from 'svelte';
  import BadgeValuesEditor from './BadgeValuesEditor.svelte';
  import SelectSourceEditor from './SelectSourceEditor.svelte';

  let {
    type,
    builder,
  }: {
    type: ConfigEntryType;
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

  // Currency options for money type
  const currencyOptions = $derived(
    getAllCurrencies().map((c) => ({ code: c.code, name: c.name }))
  );

  function handleCurrencyChange(value: string | string[]) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) builder.setCurrency(v);
  }
</script>

{#if isMoney}
  <div class="space-y-4">
    <h4 class="text-sm font-semibold text-muted-foreground">{$t('system.settings.config.typeConfig.moneyConfig')}</h4>
    <div class="space-y-1">
      <Label for="tcb-currency">{$t('system.settings.config.typeConfig.defaultCurrency')}</Label>
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
  </div>
{:else if isBadge}
  <div class="space-y-4">
    <h4 class="text-sm font-semibold text-muted-foreground">{$t('system.settings.config.typeConfig.badgeValues')}</h4>
    <BadgeValuesEditor {builder} />
  </div>
{:else if isSelect}
  <div class="space-y-4">
    <h4 class="text-sm font-semibold text-muted-foreground">{$t('system.settings.config.typeConfig.selectConfig')}</h4>
    <SelectSourceEditor {builder} />
  </div>
{/if}
