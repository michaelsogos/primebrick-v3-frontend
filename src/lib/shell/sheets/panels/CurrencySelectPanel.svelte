<script lang="ts">
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';
  import SheetSectionTitle from '$lib/shell/sheets/SheetSectionTitle.svelte';
  import { getAllCurrencies } from '$lib/currency';
  import { useConfigEntries } from '$lib/composables/useConfigEntries.svelte';
  import { onMount } from 'svelte';
  import Coins from '@lucide/svelte/icons/coins';
  import Check from '@lucide/svelte/icons/check';
  import Search from '@lucide/svelte/icons/search';

  interface Props {
    currentCurrency: string;
    onCurrencyChange: (code: string) => void;
  }

  let { currentCurrency, onCurrencyChange }: Props = $props();

  const config = useConfigEntries();

  let searchQuery = $state('');
  let favoriteCodes = $state<string[]>([]);

  let allCurrencies = $derived(getAllCurrencies());

  // Favorite currencies — resolved from config codes against the full currency list.
  // Unknown codes (typos, removed currencies) are silently filtered out.
  // Preserves the configured order.
  let favoriteCurrencies = $derived.by(() => {
    return favoriteCodes
      .map((code) => allCurrencies.find((c) => c.code === code))
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
  });

  let filteredCurrencies = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allCurrencies;
    return allCurrencies.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q),
    );
  });

  // When not searching, favorites are shown in a separate section at the top.
  // The full list below excludes favorites to avoid duplication.
  let nonFavoriteCurrencies = $derived.by(() => {
    if (searchQuery) return filteredCurrencies;
    const favSet = new Set(favoriteCurrencies.map((c) => c.code));
    return filteredCurrencies.filter((c) => !favSet.has(c.code));
  });

  onMount(async () => {
    try {
      await config.ensureLoaded();
      const entry = config.getEntry('currency_favorites');
      if (entry?.value) {
        favoriteCodes = String(entry.value)
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s) => s.length > 0);
      }
    } catch {
      // Fail silently — no favorites shown, full list still works
    }
  });

  function selectCurrency(code: string) {
    onCurrencyChange(code);
    closeSheet();
  }
</script>

{#snippet currencyRow(currency: { code: string; name: string; symbol: string })}
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
    onclick={() => selectCurrency(currency.code)}
    data-testid={`currency-select-item-${currency.code}`}
  >
    <span class="w-8 text-center font-mono text-base font-semibold text-primary">
      {currency.symbol}
    </span>
    <span class="min-w-0 flex-1">
      <span class="block font-medium">{currency.code}</span>
      <span class="block truncate text-xs text-muted-foreground">{currency.name}</span>
    </span>
    {#if currency.code === currentCurrency}
      <Check class="size-4 text-primary shrink-0" />
    {/if}
  </button>
{/snippet}

<SheetPanelLayout contentClass="p-0">
  {#snippet icon()}
    <Coins class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('system.settings.config.currencySelect.title')}
  {/snippet}
  {#snippet toolbar()}
    <div class="relative">
      <Search class="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder={$t('system.settings.config.currencySelect.searchPlaceholder')}
        class="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        data-testid="currency-select-search"
      />
    </div>
  {/snippet}

  {#if !searchQuery && favoriteCurrencies.length > 0}
    <div>
      <SheetSectionTitle>
        {$t('system.settings.config.currencySelect.favorites')}
      </SheetSectionTitle>
      {#each favoriteCurrencies as currency (currency.code)}
        {@render currencyRow(currency)}
      {/each}
    </div>
    <div>
      <SheetSectionTitle>
        {$t('system.settings.config.currencySelect.allCurrencies')}
      </SheetSectionTitle>
      {#each nonFavoriteCurrencies as currency (currency.code)}
        {@render currencyRow(currency)}
      {:else}
        <div class="px-3 py-8 text-center text-sm text-muted-foreground">
          {$t('system.settings.config.currencySelect.noResults')}
        </div>
      {/each}
    </div>
  {:else}
    {#each filteredCurrencies as currency (currency.code)}
      {@render currencyRow(currency)}
    {:else}
      <div class="px-3 py-8 text-center text-sm text-muted-foreground">
        {$t('system.settings.config.currencySelect.noResults')}
      </div>
    {/each}
  {/if}
</SheetPanelLayout>
