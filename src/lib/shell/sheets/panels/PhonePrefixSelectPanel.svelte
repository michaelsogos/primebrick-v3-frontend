<script lang="ts">
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';
  import SheetSectionTitle from '$lib/shell/sheets/SheetSectionTitle.svelte';
  import { getCountryData, countries } from 'countries-list';
  import type { TCountryCode } from 'countries-list';
  import { UI_LANGS } from '$lib/i18n/languages';
  import { Button } from '$lib/components/ui/button';
  import { ButtonGroup } from '$lib/components/ui/button-group';
  import { cn } from '$lib/utils.js';
  import Phone from '@lucide/svelte/icons/phone';
  import Check from '@lucide/svelte/icons/check';
  import Search from '@lucide/svelte/icons/search';
  import ArrowDownAZ from '@lucide/svelte/icons/arrow-down-a-z';
  import ArrowDown01 from '@lucide/svelte/icons/arrow-down-0-1';

  interface Props {
    currentCountry: string;
    allowedCountries?: string[];
    onCountryChange: (country: string) => void;
  }

  let { currentCountry, allowedCountries, onCountryChange }: Props = $props();

  let searchQuery = $state('');
  let sortMode = $state<'name' | 'prefix'>('name');

  interface CountryWithPhone {
    code: string;
    name: string;
    native: string;
    phone_prefix: string;
    phone_num: number;
  }

  function toCountry(code: string): CountryWithPhone | null {
    const data = getCountryData(code as TCountryCode);
    if (!data || !data.phone || data.phone.length === 0) return null;
    return {
      code,
      name: data.name,
      native: data.native,
      phone_prefix: `+${data.phone[0]}`,
      phone_num: data.phone[0],
    };
  }

  let allCountries = $derived.by<CountryWithPhone[]>(() => {
    const allCodes = allowedCountries && allowedCountries.length > 0
      ? allowedCountries
      : Object.keys(countries);
    return allCodes
      .map(toCountry)
      .filter((c): c is CountryWithPhone => c !== null)
      .sort((a, b) =>
        sortMode === 'prefix'
          ? a.phone_num - b.phone_num || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
      );
  });

  // Suggested countries = the countries of the UI languages (region subtag
  // of each UI_LANGS tag = ISO country code). Deduped, UI_LANGS order,
  // intersected with allowedCountries when provided.
  let suggestedCountries = $derived.by<CountryWithPhone[]>(() => {
    const allowed = allowedCountries && allowedCountries.length > 0
      ? new Set(allowedCountries)
      : null;
    const seen = new Set<string>();
    return UI_LANGS
      .map((tag) => tag.split('-')[1])
      .filter((code) => {
        if (seen.has(code) || (allowed && !allowed.has(code))) return false;
        seen.add(code);
        return true;
      })
      .map(toCountry)
      .filter((c): c is CountryWithPhone => c !== null);
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

  // When not searching, suggested countries render in their own top section
  // and are excluded from the main list (same rule as currency favorites).
  let nonSuggestedCountries = $derived.by(() => {
    if (searchQuery) return filteredCountries;
    const suggestedSet = new Set(suggestedCountries.map((c) => c.code));
    return filteredCountries.filter((c) => !suggestedSet.has(c.code));
  });

  function selectCountry(code: string) {
    onCountryChange(code);
    closeSheet();
  }
</script>

{#snippet countryRow(country: CountryWithPhone)}
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
    <span class={`fi fi-${country.code.toLowerCase()} shrink-0 rounded-sm`} aria-hidden="true"></span>
    <span class="text-xs font-mono text-muted-foreground">{country.code}</span>
    {#if country.code === currentCountry}
      <Check class="size-4 text-primary shrink-0" />
    {/if}
  </button>
{/snippet}

<SheetPanelLayout contentClass="p-0">
  {#snippet icon()}
    <Phone class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('system.settings.config.phonePrefixSelect.title')}
  {/snippet}
  {#snippet toolbar()}
    <div class="flex items-center gap-2">
      <div class="relative flex-1 min-w-0">
        <Search class="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder={$t('system.settings.config.phonePrefixSelect.searchPlaceholder')}
          class="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          data-testid="phone-prefix-search"
        />
      </div>
      <ButtonGroup segmented aria-label={$t('system.settings.config.phonePrefixSelect.sortByName')}>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          class={cn(sortMode === 'name' && 'bg-foreground/10 text-foreground shadow-xs')}
          aria-pressed={sortMode === 'name'}
          title={$t('system.settings.config.phonePrefixSelect.sortByName')}
          data-testid="phone-prefix-sort-name"
          onclick={() => (sortMode = 'name')}
        >
          <ArrowDownAZ class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          class={cn(sortMode === 'prefix' && 'bg-foreground/10 text-foreground shadow-xs')}
          aria-pressed={sortMode === 'prefix'}
          title={$t('system.settings.config.phonePrefixSelect.sortByPrefix')}
          data-testid="phone-prefix-sort-prefix"
          onclick={() => (sortMode = 'prefix')}
        >
          <ArrowDown01 class="size-4" />
        </Button>
      </ButtonGroup>
    </div>
  {/snippet}

  {#if !searchQuery && suggestedCountries.length > 0}
    <div>
      <SheetSectionTitle>
        {$t('system.settings.config.phonePrefixSelect.suggested')}
      </SheetSectionTitle>
      {#each suggestedCountries as country (country.code)}
        {@render countryRow(country)}
      {/each}
    </div>
    <div>
      <SheetSectionTitle>
        {$t('system.settings.config.phonePrefixSelect.allCountries')}
      </SheetSectionTitle>
      {#each nonSuggestedCountries as country (country.code)}
        {@render countryRow(country)}
      {/each}
    </div>
  {:else}
    {#each filteredCountries as country (country.code)}
      {@render countryRow(country)}
    {:else}
      <div class="px-3 py-8 text-center text-sm text-muted-foreground">
        {$t('system.settings.config.phonePrefixSelect.noResults')}
      </div>
    {/each}
  {/if}
</SheetPanelLayout>
