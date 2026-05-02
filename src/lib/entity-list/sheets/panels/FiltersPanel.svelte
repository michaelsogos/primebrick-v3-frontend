<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Sheet from "$lib/components/ui/sheet";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { t } from "$lib/i18n";
  import { closeSheet } from "$lib/shell/sheets/sheet-manager.svelte";
  import SheetHeader from "$lib/shell/sheets/SheetHeader.svelte";
  import XIcon from "@lucide/svelte/icons/x";
  import { RotateCcw, ChevronDown } from "lucide-svelte";
  import type { MetaColumn } from "$lib/entity-list/types";
  import DateDropper from "$lib/components/date-dropper/date-dropper.svelte";
  import { CalendarDate, parseDate } from "@internationalized/date";

  interface $$Props {
    content: any;
    filterableColumns?: MetaColumn[];
    filterValues?: Record<string, any>;
    onFilterValuesChange?: (values: Record<string, any>) => void;
    onResetFilters?: () => void;
    sheetMenuCheckboxClass?: string;
    modal?: boolean;
  }

  let { 
    content,
    filterableColumns = [],
    filterValues = {},
    onFilterValuesChange,
    onResetFilters,
    sheetMenuCheckboxClass = "h-4 w-4",
    modal = true
  }: $$Props = $props();

  // Temporary filter values (being edited by user)
  let tempFilterValues = $state<Record<string, any>>({});

  // Local state for DateDropper values (CalendarDate objects)
  let dateDropperValues = $state<Record<string, CalendarDate | null>>({});

  // Initialize temp values when component loads or when filterValues change
  $effect(() => {
    tempFilterValues = { ...filterValues };
    // Sync date dropper values
    for (const col of filterableColumns) {
      if (col.type === 'date') {
        dateDropperValues[col.key] = isoToCalendarDate(filterValues[col.key]);
      }
    }
  });

  // Sync date dropper changes back to temp filter values
  $effect(() => {
    for (const col of filterableColumns) {
      if (col.type === 'date' && dateDropperValues[col.key] !== undefined) {
        const isoValue = calendarDateToIso(dateDropperValues[col.key]);
        if (isoValue !== tempFilterValues[col.key]) {
          tempFilterValues = { ...tempFilterValues, [col.key]: isoValue };
        }
      }
    }
  });

  function updateTempFilterValue(key: string, value: any) {
    tempFilterValues = { ...tempFilterValues, [key]: value };
  }

  function clearTempFilter(key: string) {
    const newValues = { ...tempFilterValues };
    delete newValues[key];
    tempFilterValues = newValues;
    // Also clear date dropper value if it's a date field
    if (dateDropperValues[key] !== undefined) {
      dateDropperValues[key] = null;
    }
  }

  function applyFilters() {
    onFilterValuesChange?.(tempFilterValues);
  }

  function getBadgeOptions(col: MetaColumn) {
    if (col.type !== 'badge' || !col.badge?.values) return [];
    return Object.entries(col.badge.values).map(([key, value]) => ({
      key,
      label: value.labelText || $t(value.labelKey || `entities.customer.status.${key}`),
      color: value.color
    }));
  }

  // Conversione da stringa ISO (YYYY-MM-DD) a CalendarDate
  function isoToCalendarDate(isoString: string | null | undefined): CalendarDate | null {
    if (!isoString) return null;
    try {
      return parseDate(isoString);
    } catch {
      return null;
    }
  }

  // Conversione da CalendarDate a stringa ISO (YYYY-MM-DD)
  function calendarDateToIso(date: CalendarDate | null): string | null {
    if (!date) return null;
    return date.toString();
  }

  function renderFilterInput(col: MetaColumn) {
    if (col.type === 'badge' && col.badge?.values) {
      const options = getBadgeOptions(col);
      const selectedOption = options.find(opt => opt.key === tempFilterValues[col.key]);

      return {
        type: 'dropdown',
        options,
        selectedOption,
        placeholder: $t(`entities.list.filterPlaceholder`)
      };
    }

    // For date types - use DateDropper
    if (col.type === 'date') {
      return {
        type: 'date-dropper'
      };
    }

    // For text, datetime types - use text input
    return {
      type: 'input',
      inputType: col.type === 'datetime' ? 'datetime-local' : 'text',
      placeholder: $t(`entities.list.filterPlaceholder`),
      value: tempFilterValues[col.key] || ''
    };
  }
  function resetAllFilters() {
    onResetFilters?.();
  }
</script>

{#snippet headerActions()}
  <Button
    variant="default"
    size="sm"
    class="mr-2"
    onclick={applyFilters}
    title={$t("common.apply")}
  >
    {$t("common.apply")}
  </Button>
  <Button
    variant="ghost"
    size="icon-sm"
    class="text-muted-foreground opacity-70 hover:bg-accent hover:text-accent-foreground hover:opacity-100"
    onclick={resetAllFilters}
    title={$t("common.reset")}
  >
    <RotateCcw class="size-4" />
  </Button>
  <Sheet.Close
    class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    title={$t("common.done")}
    onclick={() => closeSheet()}
  >
    <XIcon class="size-4" />
  </Sheet.Close>
{/snippet}

{#snippet headerTitle()}
  {$t("entities.list.filters")}
{/snippet}

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <div class="min-h-0 flex-1 overflow-auto px-2 py-2 {modal ? '' : 'bg-muted/40'}">
    {#each filterableColumns as col (col.key)}
      <div class="mb-4">
        <div class="mb-2 flex items-center justify-between">
          <label for="filter-{col.key}" class="text-sm font-medium text-foreground">
            {$t(col.labelKey)}
          </label>
          {#if tempFilterValues[col.key]}
            <Button
              variant="ghost"
              size="sm"
              class="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onclick={() => clearTempFilter(col.key)}
            >
              {$t("common.clear")}
            </Button>
          {/if}
        </div>
        
        {#if renderFilterInput(col).type === 'dropdown'}
          {@const filterConfig = renderFilterInput(col)}
          {@const options = filterConfig.options}
          {@const selectedOption = filterConfig.selectedOption}
          {@const placeholder = filterConfig.placeholder}

          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Button
                  id="filter-{col.key}"
                  variant="outline"
                  class="w-full justify-between"
                  {...props}
                >
                  {selectedOption ? selectedOption.label : placeholder}
                  <ChevronDown class="ml-2 h-4 w-4" />
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content class="w-full">
              <DropdownMenu.Item
                onclick={() => updateTempFilterValue(col.key, null)}
              >
                {placeholder}
              </DropdownMenu.Item>
              {#each options as option}
                <DropdownMenu.Item
                  onclick={() => updateTempFilterValue(col.key, option.key)}
                >
                  {option.label}
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {:else if renderFilterInput(col).type === 'date-dropper'}
          <DateDropper
            bind:value={dateDropperValues[col.key]}
          />
        {:else}
          {@const filterConfig = renderFilterInput(col)}
          {@const inputType = filterConfig.inputType}
          {@const placeholder = filterConfig.placeholder}
          {@const value = filterConfig.value}

          <Input
            id="filter-{col.key}"
            type={inputType}
            placeholder={placeholder}
            value={value}
            oninput={(e) => updateTempFilterValue(col.key, e.currentTarget.value)}
            class="w-full"
          />
        {/if}
      </div>
    {/each}
    
    {#if filterableColumns.length === 0}
      <div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <p class="text-sm">{$t("entities.list.noFilterableFields")}</p>
      </div>
    {/if}
  </div>
</div>
