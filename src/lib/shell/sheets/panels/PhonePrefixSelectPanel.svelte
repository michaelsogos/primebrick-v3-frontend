<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import { getCountryData, countries } from 'countries-list';
  import type { TCountryCode } from 'countries-list';
  import XIcon from '@lucide/svelte/icons/x';
  import Check from '@lucide/svelte/icons/check';
  import Search from '@lucide/svelte/icons/search';

  interface $$Props {
    currentCountry: string;
    allowedCountries?: string[];
    onCountryChange: (country: string) => void;
  }

  let { currentCountry, allowedCountries, onCountryChange }: $$Props = $props();

  let searchQuery = $state('');

  interface CountryWithPhone {
    code: string;
    name: string;
    native: string;
    phone_prefix: string;
  }

  let allCountries = $derived.by<CountryWithPhone[]>(() => {
    const allCodes = allowedCountries && allowedCountries.length > 0
      ? allowedCountries
      : Object.keys(countries);
    return allCodes
      .map((code) => {
        const data = getCountryData(code as TCountryCode);
        if (!data || !data.phone || data.phone.length === 0) return null;
        return {
          code,
          name: data.name,
          native: data.native,
          phone_prefix: `+${data.phone[0]}`,
        };
      })
      .filter((c): c is CountryWithPhone => c !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  let filteredCountries = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allCountries;
    return allCountries.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.native.toLowerCase().includes(q) ||
        c.phone_prefix.includes(q),
    );
  });

  function selectCountry(code: string) {
    onCountryChange(code);
    closeSheet();
  }
</script>

{#snippet headerTitle()}
  {$t('system.settings.config.phonePrefixSelect.title')}
{/snippet}

{#snippet headerActions()}
  <Sheet.Close
    class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    title={$t('app.common.done')}
    onclick={() => closeSheet()}
  >
    <XIcon class="size-4" />
  </Sheet.Close>
{/snippet}

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <!-- Search bar -->
  <div class="border-b px-3 py-2">
    <div class="relative">
      <Search class="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder={$t('system.settings.config.phonePrefixSelect.searchPlaceholder')}
        class="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        data-testid="phone-prefix-search"
      />
    </div>
  </div>

  <!-- Country list -->
  <div class="min-h-0 flex-1 overflow-auto">
    {#each filteredCountries as country (country.code)}
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
        onclick={() => selectCountry(country.code)}
        data-testid={`phone-prefix-item-${country.code}`}
      >
        <span class="w-12 text-center font-mono text-sm font-semibold text-primary">
          {country.phone_prefix}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-medium">{country.name}</span>
          <span class="block truncate text-xs text-muted-foreground">{country.native}</span>
        </span>
        <span class="text-xs font-mono text-muted-foreground">{country.code}</span>
        {#if country.code === currentCountry}
          <Check class="size-4 text-primary shrink-0" />
        {/if}
      </button>
    {:else}
      <div class="px-3 py-8 text-center text-sm text-muted-foreground">
        {$t('system.settings.config.phonePrefixSelect.noResults')}
      </div>
    {/each}
  </div>
</div>
