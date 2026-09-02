<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import { t } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import { getAllCurrencies } from '$lib/currency';
  import XIcon from '@lucide/svelte/icons/x';
  import Check from '@lucide/svelte/icons/check';
  import Search from '@lucide/svelte/icons/search';

  interface $$Props {
    currentCurrency: string;
    onCurrencyChange: (code: string) => void;
  }

  let { currentCurrency, onCurrencyChange }: $$Props = $props();

  let searchQuery = $state('');

  let allCurrencies = $derived(getAllCurrencies());

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

  function selectCurrency(code: string) {
    onCurrencyChange(code);
    closeSheet();
  }
</script>

{#snippet headerTitle()}
  {$t('config.currencySelect.title')}
{/snippet}

{#snippet headerActions()}
  <Sheet.Close
    class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    title={$t('common.done')}
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
        placeholder={$t('config.currencySelect.searchPlaceholder')}
        class="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        data-testid="currency-select-search"
      />
    </div>
  </div>

  <!-- Currency list -->
  <div class="min-h-0 flex-1 overflow-auto">
    {#each filteredCurrencies as currency (currency.code)}
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
    {:else}
      <div class="px-3 py-8 text-center text-sm text-muted-foreground">
        {$t('config.currencySelect.noResults')}
      </div>
    {/each}
  </div>
</div>
