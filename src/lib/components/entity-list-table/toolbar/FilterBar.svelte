<script lang="ts">
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import XIcon from '@lucide/svelte/icons/x';
  import type { MetaColumn, AdvancedFilter } from '$lib/entity-list/types';

  interface FilterBarProps {
    hasAppliedFilters: boolean;
    filterValues: Record<string, any>;
    advancedFilters: AdvancedFilter[];
    filterableColumns: MetaColumn[];
    onResetFilters: () => void;
    onFilterValuesChange: (values: Record<string, any>) => void;
    onAdvancedFiltersChange: (filters: AdvancedFilter[]) => void;
  }

  let {
    hasAppliedFilters,
    filterValues,
    advancedFilters,
    filterableColumns,
    onResetFilters,
    onFilterValuesChange,
    onAdvancedFiltersChange
  }: FilterBarProps = $props();

  function formatBadgeValue(col: MetaColumn, value: any): string {
    if (col.type === 'badge' && col.badge?.values) {
      const badgeValue = col.badge.values[value];
      if (badgeValue) {
        return badgeValue.labelText || $t(badgeValue.labelKey || `entities.customer.status.${value}`);
      }
    }
    return String(value);
  }

  function formatFilterDateValue(isoString: string): string {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;

      const isDateTime = isoString.includes('T') || isoString.includes(':');
      const options: Intl.DateTimeFormatOptions = isDateTime
        ? { dateStyle: "long", timeStyle: "medium" }
        : { dateStyle: "long" };

      return new Intl.DateTimeFormat($uiLang, options).format(date);
    } catch {
      return isoString;
    }
  }
</script>

{#if hasAppliedFilters}
  <div class="flex flex-wrap items-center gap-2">
    <Button
      variant="soft"
      tone="primary"
      size="xs"
      onclick={onResetFilters}
    >
      <XIcon class="size-3.5" />
      {$t('common.clearAll')}
    </Button>
    <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>
    {#if filterValues && Object.keys(filterValues).length > 0}
      {#each Object.entries(filterValues) as [key, value]}
        {@const col = filterableColumns.find((c) => c.key === key)}
        {#if col}
          {@const operator = col.type === 'text' ? 'contains' : '='}
          {@const formattedValue = col.type === 'date' || col.type === 'datetime' ? formatFilterDateValue(String(value)) : formatBadgeValue(col, value)}
          <Badge
            variant="secondary"
            class="gap-1.5 pr-1"
          >
            <span class="text-xs font-bold text-foreground">{$t(col.labelKey)}</span>
            <span class="text-xs text-primary">{$t(`entities.list.operators.${operator}`)}</span>
            <span class="text-xs italic text-muted-foreground">{formattedValue}</span>
            <button
              type="button"
              class="ml-0.5 inline-flex size-4 items-center justify-center rounded-full hover:bg-muted-foreground/20"
              onclick={() => {
                const next = { ...filterValues };
                delete next[key];
                onFilterValuesChange?.(next);
              }}
              aria-label={$t('common.remove')}
            >
              <XIcon class="size-3" />
            </button>
          </Badge>
        {/if}
      {/each}
    {/if}
    {#if advancedFilters && advancedFilters.length > 0}
      {#each advancedFilters as filter}
        {@const col = filterableColumns.find((c) => c.key === filter.field)}
        {#if col}
          {@const formattedValue = (() => {
            if (Array.isArray(filter.value)) {
              return filter.value.map((v) => formatBadgeValue(col, v)).join(", ");
            } else if (filter.operator === "BETWEEN" && typeof filter.value === "object" && "start" in filter.value && "end" in filter.value) {
              const startFormatted = formatFilterDateValue(String(filter.value.start));
              const endFormatted = formatFilterDateValue(String(filter.value.end));
              return `${startFormatted} e ${endFormatted}`;
            } else if (col.type === 'date' || col.type === 'datetime') {
              return formatFilterDateValue(String(filter.value));
            } else {
              return formatBadgeValue(col, filter.value);
            }
          })()}
          <Badge
            variant="secondary"
            class="gap-1.5 pr-1"
          >
            <span class="text-xs font-bold text-foreground">{$t(col.labelKey)}</span>
            <span class="text-xs text-primary">{$t(`entities.list.operators.${filter.operator}`)}</span>
            <span class="text-xs italic text-muted-foreground">{formattedValue}</span>
            <button
              type="button"
              class="ml-0.5 inline-flex size-4 items-center justify-center rounded-full hover:bg-muted-foreground/20"
              onclick={() => {
                const next = advancedFilters.filter((f) => f.id !== filter.id);
                onAdvancedFiltersChange?.(next);
              }}
              aria-label={$t('common.remove')}
            >
              <XIcon class="size-3" />
            </button>
          </Badge>
        {/if}
      {/each}
    {/if}
  </div>
{:else}
  <span class="text-xs italic text-muted-foreground/70">{$t('entities.list.filterBadge.noFiltersApplied')}</span>
{/if}
