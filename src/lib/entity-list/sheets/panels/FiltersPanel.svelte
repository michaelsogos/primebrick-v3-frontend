<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Sheet from "$lib/components/ui/sheet";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Badge } from "$lib/components/ui/badge";
  import { DropdownMenuCheckboxItem } from "$lib/components/ui/dropdown-menu";
  import { t } from "$lib/i18n";
  import { closeSheet } from "$lib/shell/sheets/sheet-manager.svelte";
  import SheetHeader from "$lib/shell/sheets/SheetHeader.svelte";
  import XIcon from "@lucide/svelte/icons/x";
  import { RotateCcw, ChevronDown } from "lucide-svelte";
  import type { MetaColumn } from "$lib/entity-list/types";
  import DateWheelPicker from "$lib/components/date-dropper/date-wheel-picker.svelte";
  import { CalendarDate, parseDate } from "@internationalized/date";
  import { badgeClassesFromToken } from "$lib/colors/badge";
  import { cn } from "$lib/utils";

  interface $$Props {
    content: any;
    filterableColumns?: MetaColumn[];
    filterValues?: Record<string, any>;
    onFilterValuesChange?: (values: Record<string, any>) => void;
    onResetFilters?: () => void;
    modal?: boolean;
  }

  let {
    content,
    filterableColumns = [],
    filterValues = {},
    onFilterValuesChange,
    onResetFilters,
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
      if (col.type === 'date' || col.type === 'datetime') {
        dateDropperValues[col.key] = isoToCalendarDate(filterValues[col.key]);
      }
    }
  });

  // Sync date dropper changes back to temp filter values
  $effect(() => {
    for (const col of filterableColumns) {
      if ((col.type === 'date' || col.type === 'datetime') && dateDropperValues[col.key] !== undefined) {
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
      const selectedKeys = (tempFilterValues[col.key] as string[]) || [];

      return {
        type: 'multiselect' as const,
        options,
        selectedKeys,
        placeholder: $t(`entities.list.filterPlaceholder`)
      };
    }

    // For date types - use DateDropper
    if (col.type === 'date' || col.type === 'datetime') {
      return {
        type: 'date-dropper' as const
      };
    }

    // For text types - use text input
    return {
      type: 'input' as const,
      inputType: 'text',
      placeholder: $t(`entities.list.filterPlaceholder`),
      value: tempFilterValues[col.key] || ''
    };
  }

  function toggleBadgeSelection(colKey: string, optionKey: string) {
    const currentSelection = tempFilterValues[colKey] as string[] || [];
    const newSelection = currentSelection.includes(optionKey)
      ? currentSelection.filter(k => k !== optionKey)
      : [...currentSelection, optionKey];
    tempFilterValues = { ...tempFilterValues, [colKey]: newSelection.length > 0 ? newSelection : undefined };
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
        <div class="mb-2">
          <label for="filter-{col.key}" class="text-xs font-normal text-foreground">
            {$t(col.labelKey)}
          </label>
        </div>
        
        {#if renderFilterInput(col).type === 'multiselect'}
          {@const filterConfig = renderFilterInput(col)}
          {@const options = filterConfig.options}
          {@const selectedKeys = filterConfig.selectedKeys || []}
          {@const placeholder = filterConfig.placeholder}

          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Button
                  id="filter-{col.key}"
                  variant="ghost"
                  class="border-input bg-background selection:bg-primary dark:bg-input/30 selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-colors outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:text-sm hover:border-ring/40 hover:bg-sky-50/45 dark:hover:border-ring/40 dark:hover:bg-input/55 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] justify-between font-normal"
                  {...props}
                >
                  <span class={selectedKeys.length > 0 ? 'text-foreground' : 'text-muted-foreground/70 text-xs'}>
                    {selectedKeys.length > 0
                      ? `${selectedKeys.length} ${$t('entities.list.selected')}`
                      : placeholder
                    }
                  </span>
                  <div class="flex items-center gap-1">
                    {#if selectedKeys.length > 0}
                      <button
                        type="button"
                        class="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        onpointerdown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onclick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          clearTempFilter(col.key);
                        }}
                        title={$t("common.clear")}
                      >
                        <XIcon class="size-3" />
                      </button>
                    {/if}
                    <ChevronDown class="h-4 w-4 shrink-0" />
                  </div>
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" class="w-full max-h-96 overflow-auto">
              {#each options as option}
                <DropdownMenuCheckboxItem
                  checked={selectedKeys.includes(option.key)}
                  onCheckedChange={() => toggleBadgeSelection(col.key, option.key)}
                  closeOnSelect={false}
                >
                  <Badge
                    variant="outline"
                    class={cn(badgeClassesFromToken(option.color ?? null), 'border-0 shadow-none')}
                  >
                    {option.label}
                  </Badge>
                </DropdownMenuCheckboxItem>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {:else if renderFilterInput(col).type === 'date-dropper'}
          <div class="relative">
            <DateWheelPicker
              bind:value={dateDropperValues[col.key]}
              placeholder={$t("entities.list.filterPlaceholder")}
            />
            {#if dateDropperValues[col.key]}
              <button
                type="button"
                class="absolute right-8 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onclick={() => clearTempFilter(col.key)}
                title={$t("common.clear")}
              >
                <XIcon class="size-3" />
              </button>
            {/if}
          </div>
        {:else}
          {@const filterConfig = renderFilterInput(col)}
          {@const inputType = filterConfig.inputType}
          {@const placeholder = filterConfig.placeholder}
          {@const value = filterConfig.value}

          <div class="relative">
            <Input
              id="filter-{col.key}"
              type={inputType}
              placeholder={placeholder}
              value={value}
              oninput={(e) => updateTempFilterValue(col.key, e.currentTarget.value)}
              class="w-full placeholder:text-muted-foreground/70 placeholder:text-xs pr-8"
            />
            {#if value}
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onclick={() => clearTempFilter(col.key)}
                title={$t("common.clear")}
              >
                <XIcon class="size-3" />
              </button>
            {/if}
          </div>
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
