<script lang="ts">
  import { browser } from "$app/environment";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Sheet from "$lib/components/ui/sheet";
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuItemWithSelectedClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { Badge } from "$lib/components/ui/badge";
  import { DropdownMenuCheckboxItem } from "$lib/components/ui/dropdown-menu";
  import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
  } from "$lib/components/ui/tabs/index.js";
  import { t } from "$lib/i18n";
  import { uiLang } from "$lib/i18n/store.svelte";
  import { closeSheet } from "$lib/shell/sheets/sheet-manager.svelte";
  import SheetHeader from "$lib/shell/sheets/SheetHeader.svelte";
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import Play from '@lucide/svelte/icons/play'
  import Pencil from '@lucide/svelte/icons/pencil'
  import FunnelX from '@lucide/svelte/icons/funnel-x'
  import X from '@lucide/svelte/icons/x';
import Switch from "$lib/components/ui/switch/switch.svelte";
  import type { MetaColumn, AdvancedFilter, FilterOperator } from "$lib/entity-list/types";
  import { getOperatorsForColumnType } from "$lib/entity-list/types";
  import DateWheelPicker from "$lib/components/date-dropper/date-wheel-picker.svelte";
  import { CalendarDate, CalendarDateTime, parseDate, parseDateTime, DateFormatter, getLocalTimeZone } from "@internationalized/date";
  import { badgeClassesFromToken } from "$lib/colors/badge";
  import { cn } from "$lib/utils";
  import { onMount } from "svelte";
  import { crossfade } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";
  import { getResolvedIanaTimeZone } from "$lib/browser-iana-timezone";

  interface $$Props {
    content: any;
    filterableColumns?: MetaColumn[];
    filterValues?: Record<string, any>;
    onFilterValuesChange?: (values: Record<string, any>) => void;
    onResetFilters?: () => void;
    modal?: boolean;
    advancedFilters?: AdvancedFilter[];
    onAdvancedFiltersChange?: (filters: AdvancedFilter[], connector: 'AND' | 'OR') => void;
  }

  let {
    content,
    filterableColumns = [],
    filterValues = {},
    onFilterValuesChange,
    onResetFilters,
    modal = true,
    advancedFilters = [],
    onAdvancedFiltersChange,
  }: $$Props = $props();

  // Temporary filter values (being edited by user)
  let tempFilterValues = $state<Record<string, any>>({});

  // Local state for DateDropper values (CalendarDate or CalendarDateTime objects)
  let dateDropperValues: Record<string, CalendarDate | CalendarDateTime | null> = $state({});
  let timezoneValues: Record<string, string> = $state({});
  let browserTimezone = $state<string | null>(null);

  onMount(() => {
    if (!browser) return;
    browserTimezone = getResolvedIanaTimeZone();
  });

  // Advanced filters state
  let tempAdvancedFilters: AdvancedFilter[] = $state([]);
  let globalConnector: 'AND' | 'OR' = $state('AND');

  // New filter being created
  let newFilterField = $state<string>(""); 
  let newFilterOperator = $state<FilterOperator>("="); 
  let newFilterValue = $state<any | any[] | { start: any; end: any }>("");

  // BETWEEN operator state
  let newFilterStartDate = $state<any>("");
  let newFilterEndDate = $state<any>("");

  // Edit mode state
  let editingFilterId = $state<string | null>(null);

  // Tab state
  let tabValue = $state("standard");

  const [send, receive] = crossfade({
    duration: 300,
    easing: cubicInOut,
    fallback(node, params) {
      return {
        duration: 300,
        easing: cubicInOut,
        css: (t) => `opacity: ${t}`
      };
    }
  });

  // Initialize temp values when component loads
  onMount(() => {
    tempFilterValues = { ...filterValues };
    tempAdvancedFilters = [...advancedFilters];
    // Sync date dropper values
    for (const col of filterableColumns) {
      if (col.type === "date" || col.type === "datetime") {
        const tz = timezoneValues[col.key] || browserTimezone || "UTC";
        dateDropperValues[col.key] = isoToCalendarDate(filterValues[col.key], col.type, tz);
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
    // Sync date dropper values to temp filter values before applying
    for (const col of filterableColumns) {
      if (
        (col.type === "date" || col.type === "datetime") &&
        dateDropperValues[col.key] !== undefined
      ) {
        const dateValue = dateDropperValues[col.key] as CalendarDate | CalendarDateTime | null;
        // Only send value and timezone if date is actually selected
        if (dateValue) {
          const tz = timezoneValues[col.key] || browserTimezone || "UTC";
          // Always convert to UTC using the selected timezone
          const utcIso = calendarDateToUtcIso(dateValue, tz);
          tempFilterValues = { ...tempFilterValues, [col.key]: utcIso };

          // Store timezone in local state for UI restoration (not sent to BE)
          timezoneValues[col.key] = tz;

          // Only send IANA field if:
          // 1. Column has datetimeIanaToggle (has IANA field in DB)
          // 2. Selected timezone differs from browser timezone
          if (col.datetimeIanaToggle && tz !== browserTimezone) {
            const ianaField = col.datetimeIanaToggle.recordIanaField;
            tempFilterValues = { ...tempFilterValues, [ianaField]: tz };
          }
        } else {
          // Clear timezone from local state if date is cleared
          timezoneValues[col.key] = browserTimezone || "UTC";
        }
      }
    }
    onFilterValuesChange?.(tempFilterValues);
    applyAdvancedFilters();
  }

  function getBadgeOptions(col: MetaColumn) {
    if (col.type !== "badge" || !col.badge?.values) return [];
    return Object.entries(col.badge.values).map(([key, value]) => ({
      key,
      label:
        value.labelText ||
        $t(value.labelKey || `entities.customer.status.${key}`),
      color: value.color,
    }));
  }

  // Format ISO date string for display in advanced filter preview
  function formatFilterDateValue(isoString: string): string {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;

      // Detect if string is datetime (has T and time) or just date
      const isDateTime = isoString.includes('T') || isoString.includes(':');
      const options: Intl.DateTimeFormatOptions = isDateTime
        ? { dateStyle: "long", timeStyle: "medium" }
        : { dateStyle: "long" };

      return new Intl.DateTimeFormat($uiLang, options).format(date);
    } catch {
      return isoString;
    }
  }

  // Check if a string looks like an ISO date
  function isIsoDateString(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(value);
  }

  // Conversione da stringa ISO a CalendarDate o CalendarDateTime
  function isoToCalendarDate(
    isoString: string | null | undefined,
    type: "date" | "datetime" = "date",
    timezone: string = "UTC",
  ): CalendarDate | CalendarDateTime | null {
    if (!isoString) return null;
    try {
      if (type === "datetime") {
        // For UTC strings (with 'Z'), convert to the specified timezone
        if (isoString.endsWith('Z')) {
          const date = new Date(isoString);
          // Get date parts in the specified timezone using Intl
          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          });
          const parts = formatter.formatToParts(date);
          const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value || '0', 10);
          let hour = get('hour');
          if (hour === 24) hour = 0;
          return new CalendarDateTime(get('year'), get('month'), get('day'), hour, get('minute'), get('second'));
        }
        return parseDateTime(isoString);
      }
      return parseDate(isoString);
    } catch {
      return null;
    }
  }

  // Conversione da CalendarDate o CalendarDateTime a stringa ISO UTC
  function calendarDateToUtcIso(date: CalendarDate | CalendarDateTime | null, timezone: string): string | null {
    if (!date) return null;
    if (date instanceof CalendarDate) {
      // For dates without time, just return the date string
      return date.toString();
    }
    // For CalendarDateTime, convert to UTC using the specified timezone
    // CalendarDateTime is timezone-naive, so we need to convert it using the timezone
    const year = date.year;
    const month = date.month;
    const day = date.day;
    const hour = date.hour;
    const minute = date.minute;
    const second = date.second;

    // Create a Date object in the specified timezone and convert to UTC ISO string
    const dateInTimezone = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    // Adjust for timezone offset
    const offset = getTimezoneOffset(timezone);
    const utcDate = new Date(dateInTimezone.getTime() - offset * 60 * 1000);
    return utcDate.toISOString();
  }

  // Get timezone offset in minutes from UTC
  function getTimezoneOffset(timezone: string): number {
    const date = new Date();
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
  }

  function renderFilterInput(col: MetaColumn) {
    if (col.type === "badge" && col.badge?.values) {
      // ... (rest of the code remains the same)
      const options = getBadgeOptions(col);
      const selectedKeys = (tempFilterValues[col.key] as string[]) || [];

      return {
        type: "multiselect" as const,
        options,
        selectedKeys,
        placeholder: $t(`entities.list.filterPlaceholder`),
      };
    }

    // For date types - use DateDropper
    if (col.type === "date" || col.type === "datetime") {
      return {
        type: "date-dropper" as const,
      };
    }

    // For text types - use text input
    return {
      type: "input" as const,
      inputType: "text",
      placeholder: $t(`entities.list.filterPlaceholder`),
      value: tempFilterValues[col.key] || "",
    };
  }

  function toggleBadgeSelection(colKey: string, optionKey: string) {
    const currentSelection = (tempFilterValues[colKey] as string[]) || [];
    const newSelection = currentSelection.includes(optionKey)
      ? currentSelection.filter((k) => k !== optionKey)
      : [...currentSelection, optionKey];
    tempFilterValues = {
      ...tempFilterValues,
      [colKey]: newSelection.length > 0 ? newSelection : undefined,
    };
  }
  function resetAllFilters() {
    // Clear temporary filter values (inputs in panel)
    tempFilterValues = {};
    // Clear date dropper values
    for (const col of filterableColumns) {
      if (col.type === "date" || col.type === "datetime") {
        dateDropperValues[col.key] = null;
      }
    }
    // Clear advanced filters
    tempAdvancedFilters = [];
    newFilterField = "";
    newFilterOperator = "=";
    newFilterValue = "";
    editingFilterId = null;
    // Reset actual applied filters
    onResetFilters?.();
  }

  function addAdvancedFilter() {
    if (!newFilterField) return;

    const selectedColumn = filterableColumns.find((c) => c.key === newFilterField);
    let value: any | any[] | { start: any; end: any } = newFilterValue;

    // Handle BETWEEN operator
    if (newFilterOperator === "BETWEEN") {
      if (!newFilterStartDate || !newFilterEndDate) return;
      // Convert date/datetime values to ISO strings
      if (selectedColumn?.type === "datetime") {
        const tz = browserTimezone || "UTC";
        const startUtc = calendarDateToUtcIso(newFilterStartDate as CalendarDate | CalendarDateTime, tz);
        const endUtc = calendarDateToUtcIso(newFilterEndDate as CalendarDate | CalendarDateTime, tz);
        value = { start: startUtc, end: endUtc };
      } else if (selectedColumn?.type === "date") {
        // Convert date values to ISO strings
        const startIso = (newFilterStartDate as CalendarDate)?.toString();
        const endIso = (newFilterEndDate as CalendarDate)?.toString();
        value = { start: startIso, end: endIso };
      } else {
        value = { start: newFilterStartDate, end: newFilterEndDate };
      }
    } else if (Array.isArray(newFilterValue)) {
      if (newFilterValue.length === 0) return;
    } else if (!newFilterValue) {
      return;
    } else if (selectedColumn?.type === "datetime") {
      // Convert single datetime value to UTC
      const tz = browserTimezone || "UTC";
      value = calendarDateToUtcIso(newFilterValue as CalendarDate | CalendarDateTime, tz);
    } else if (selectedColumn?.type === "date") {
      // Convert single date value to ISO string
      value = (newFilterValue as CalendarDate)?.toString();
    }

    if (editingFilterId) {
      // Update existing filter
      tempAdvancedFilters = tempAdvancedFilters.map((filter) =>
        filter.id === editingFilterId
          ? { ...filter, field: newFilterField, operator: newFilterOperator, value }
          : filter
      );
      editingFilterId = null;
    } else {
      // Add new filter
      const newFilter: AdvancedFilter = {
        id: crypto.randomUUID(),
        field: newFilterField,
        operator: newFilterOperator,
        value,
      };
      tempAdvancedFilters = [...tempAdvancedFilters, newFilter];
    }

    // Reset form
    newFilterField = "";
    newFilterOperator = "=";
    newFilterValue = "";
    newFilterStartDate = "";
    newFilterEndDate = "";
  }

  function editAdvancedFilter(filter: AdvancedFilter) {
    newFilterField = filter.field;
    newFilterOperator = filter.operator;
    editingFilterId = filter.id;

    const selectedColumn = filterableColumns.find((c) => c.key === filter.field);

    // Handle BETWEEN operator
    if (filter.operator === "BETWEEN" && typeof filter.value === "object" && "start" in filter.value && "end" in filter.value) {
      // Convert ISO strings back to CalendarDate/CalendarDateTime using existing helper
      if (selectedColumn?.type === "datetime" || selectedColumn?.type === "date") {
        newFilterStartDate = isoToCalendarDate(filter.value.start as string, selectedColumn.type, browserTimezone || "UTC");
        newFilterEndDate = isoToCalendarDate(filter.value.end as string, selectedColumn.type, browserTimezone || "UTC");
      } else {
        newFilterStartDate = filter.value.start;
        newFilterEndDate = filter.value.end;
      }
      newFilterValue = "";
    } else {
      // Convert ISO string back to CalendarDate/CalendarDateTime using existing helper
      if (selectedColumn?.type === "datetime" || selectedColumn?.type === "date") {
        newFilterValue = isoToCalendarDate(filter.value as string, selectedColumn.type, browserTimezone || "UTC");
      } else {
        newFilterValue = filter.value;
      }
      newFilterStartDate = "";
      newFilterEndDate = "";
    }
  }

  function cancelEditAdvancedFilter() {
    editingFilterId = null;
    newFilterField = "";
    newFilterOperator = "=";
    newFilterValue = "";
    newFilterStartDate = "";
    newFilterEndDate = "";
  }

  function toggleBadgeFilterValue(key: string) {
    const currentSelection = Array.isArray(newFilterValue) ? newFilterValue : (newFilterValue ? [newFilterValue] : []);
    const newSelection = currentSelection.includes(key)
      ? currentSelection.filter((k) => k !== key)
      : [...currentSelection, key];
    newFilterValue = newSelection.length > 0 ? newSelection : "";
  }

  function removeAdvancedFilter(id: string) {
    tempAdvancedFilters = tempAdvancedFilters.filter((f) => f.id !== id);
  }

  function updateAdvancedFilter(id: string, updates: Partial<AdvancedFilter>) {
    tempAdvancedFilters = tempAdvancedFilters.map((f) =>
      f.id === id ? { ...f, ...updates } : f
    );
  }

  function applyAdvancedFilters() {
    // Apply filters with global connector
    onAdvancedFiltersChange?.(tempAdvancedFilters, globalConnector);
  }
</script>

{#snippet headerActions()}
  <Button
    variant="ghost"
    size="sm"
    class="mr-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary gap-2"
    onclick={applyFilters}
    title={$t("common.apply")}
  >
    <Play class="size-4" />
    <span>{$t("common.apply")}</span>
  </Button>

  <Button
    variant="ghost"
    size="sm"
    class="mr-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
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
    <X class="size-4" />
  </Sheet.Close>
{/snippet}

{#snippet headerTitle()}
  {$t("entities.list.filters")}
{/snippet}

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <Tabs bind:value={tabValue} class="flex-1 flex flex-col h-full  overflow-hidden">
    <TabsList
      class="relative w-full h-10 py-1 px-4 bg-gray-100 dark:bg-input flex-shrink-0 rounded-none"
    >
      <TabsTrigger
        value="standard"
        class="relative z-10 rounded-full bg-transparent transition-colors data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:ring-0"
      >
        {#if tabValue === "standard"}
          <div
            in:receive={{ key: "active-pill" }}
            out:send={{ key: "active-pill" }}
            class="absolute inset-0 z-[-1] rounded-full border border-neutral-300 bg-white shadow-sm dark:border-neutral-600 dark:bg-background dark:shadow-white/10"
          ></div>
        {/if}
        <span class="relative z-20">{$t("entities.list.standardFilters")}</span>
      </TabsTrigger>
      <TabsTrigger
        value="advanced"
        class="relative z-10 rounded-full bg-transparent transition-colors data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:ring-0"
      >
        {#if tabValue === "advanced"}
          <div
            in:receive={{ key: "active-pill" }}
            out:send={{ key: "active-pill" }}
            class="absolute inset-0 z-[-1] rounded-full border border-neutral-300 bg-white shadow-sm dark:border-neutral-600 dark:bg-background dark:shadow-white/10"
          ></div>
        {/if}
        <span class="relative z-20">{$t("entities.list.advancedFilters")}</span>
      </TabsTrigger>
    </TabsList>

    <TabsContent value="standard" class="flex-1 overflow-y-auto p-4 transition-all duration-400 ease-in-out data-[state=active]:animate-in data-[state=active]:slide-in-from-left data-[state=active]:fade-in data-[state=inactive]:animate-out data-[state=inactive]:slide-out-to-left data-[state=inactive]:fade-out">
      {#each filterableColumns as col (col.key)}
        <div class="mb-4">
          <div class="mb-2">
            <label
              for="filter-{col.key}"
              class="text-xs font-normal text-foreground"
            >
              {$t(col.labelKey)}
            </label>
          </div>

          {#if renderFilterInput(col).type === "multiselect"}
            {@const filterConfig = renderFilterInput(col)}
            {@const options = filterConfig.options}
            {@const selectedKeys = filterConfig.selectedKeys || []}
            {@const placeholder = filterConfig.placeholder}

            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button
                    id="filter-{col.key}"
                    variant="outline"
                    class="h-9 w-full justify-between font-normal"
                    {...props}
                  >
                    <span
                      class={selectedKeys.length > 0
                        ? "text-foreground"
                        : "text-muted-foreground/70 text-xs"}
                    >
                      {selectedKeys.length > 0
                        ? `${selectedKeys.length} ${$t("entities.list.selected")}`
                        : placeholder}
                    </span>
                    <div class="flex items-center gap-1">
                      {#if selectedKeys.length > 0}
                        <button
                          type="button"
                          class="flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
                          <X class="size-3" />
                        </button>
                      {/if}
                      <ChevronDown class="h-4 w-4 shrink-0" />
                    </div>
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content
                align="start"
                class="w-full max-h-96 overflow-auto"
              >
                {#each options as option}
                  {@const badgeColors = badgeClassesFromToken(
                    option.color ?? null,
                  )}
                  <DropdownMenuCheckboxItem
                    checked={selectedKeys.includes(option.key)}
                    onCheckedChange={() =>
                      toggleBadgeSelection(col.key, option.key)}
                    closeOnSelect={false}
                  >
                    <Badge
                      class="shadow-none"
                      style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
                    >
                      {option.label}
                    </Badge>
                  </DropdownMenuCheckboxItem>
                {/each}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {:else if renderFilterInput(col).type === "date-dropper"}
            <div class="relative">
              <DateWheelPicker
                bind:value={dateDropperValues[col.key]}
                bind:timezone={timezoneValues[col.key]}
                placeholder={$t("entities.list.filterPlaceholder")}
                includeTime={col.type === "datetime"}
              />
              {#if dateDropperValues[col.key]}
                <button
                  type="button"
                  class="absolute right-8 top-1/2 -translate-y-1/2 flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onclick={() => clearTempFilter(col.key)}
                  title={$t("common.clear")}
                >
                  <X class="size-3" />
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
                {placeholder}
                {value}
                oninput={(e) =>
                  updateTempFilterValue(col.key, e.currentTarget.value)}
                class="w-full placeholder:text-muted-foreground/70 placeholder:text-xs pr-8"
              />
              {#if value}
                <button
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onclick={() => clearTempFilter(col.key)}
                  title={$t("common.clear")}
                >
                  <X class="size-3" />
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/each}

      {#if filterableColumns.length === 0}
        <div
          class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground"
        >
          <p class="text-sm">{$t("entities.list.noFilterableFields")}</p>
        </div>
      {/if}
    </TabsContent>

    <TabsContent value="advanced" class="flex-1 overflow-y-auto p-4 transition-all duration-400 ease-in-out data-[state=active]:animate-in data-[state=active]:slide-in-from-right data-[state=active]:fade-in data-[state=inactive]:animate-out data-[state=inactive]:slide-out-to-right data-[state=inactive]:fade-out">
      <div class="flex justify-center items-center mb-4">
        <div class="flex items-center gap-3">
          <span class="text-xs font-medium {globalConnector === 'AND' ? 'font-bold text-foreground' : 'text-muted-foreground'}">
            {$t('entities.list.allCriteria')}
          </span>
          <Switch
            checked={globalConnector === 'OR'}
            onCheckedChange={(checked) => globalConnector = checked ? 'OR' : 'AND'}
            aria-label={$t('entities.list.connector')}
          >
            {#snippet thumbIcons({ checked })}
              <span class="size-4 flex items-center justify-center rounded-full {checked ? 'bg-amber-200/85 dark:bg-amber-900/55' : 'bg-sky-200/80 dark:bg-sky-900/55'}"></span>
            {/snippet}
          </Switch>
          <span class="text-xs font-medium {globalConnector === 'OR' ? 'font-bold text-foreground' : 'text-muted-foreground'}">
            {$t('entities.list.atLeastOneCriteria')}
          </span>
        </div>
      </div>
      {#if tempAdvancedFilters.length > 0}
        <div class="space-y-3 mb-4">
          {#each tempAdvancedFilters as filter (filter.id)}
            {@const column = filterableColumns.find((c) => c.key === filter.field)}
            <div class="flex items-center gap-2 p-3 bg-muted/30 rounded-md border">
              <div class="flex-1 min-w-0">
                <div class="text-xs flex flex-wrap items-center gap-1">
                  <span class="font-bold text-foreground">
                    {column ? $t(column.labelKey) : filter.field}
                  </span>
                  <span class="text-primary">
                    {$t(`entities.list.operators.${filter.operator}`)}
                  </span>
                  <span class="italic text-muted-foreground">
                    {Array.isArray(filter.value)
                      ? filter.value.map((v) =>
                          column?.badge?.values?.[v]?.labelText ||
                          $t(column?.badge?.values?.[v]?.labelKey || `entities.customer.status.${v}`)
                        ).join(", ")
                      : filter.operator === "BETWEEN" && typeof filter.value === "object" && "start" in filter.value && "end" in filter.value
                      ? (() => {
                          const startFormatted = formatFilterDateValue(String(filter.value.start));
                          const endFormatted = formatFilterDateValue(String(filter.value.end));
                          return `${startFormatted} e ${endFormatted}`;
                        })()
                      : formatFilterDateValue(String(filter.value))}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onclick={() => editAdvancedFilter(filter)}
                  title={$t("common.edit")}
                >
                  <Pencil class="size-3" />
                </button>
                <button
                  type="button"
                  class="flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onclick={() => removeAdvancedFilter(filter.id)}
                  title={$t("common.remove")}
                >
                  <FunnelX class="size-3" />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <div class="border-t pt-4">
        <div class="space-y-3">
          <div>
            <label class="text-xs font-normal text-foreground mb-1 block" for="advanced-field">
              {$t("entities.list.field")}
            </label>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button
                    variant="outline"
                    class="h-9 w-full justify-between font-normal"
                    {...props}
                  >
                    <span
                      class={newFilterField
                        ? "text-foreground"
                        : "text-muted-foreground/70 text-xs"}
                    >
                      {newFilterField
                        ? (filterableColumns.find((c) => c.key === newFilterField)
                            ? $t(filterableColumns.find((c) => c.key === newFilterField)!.labelKey)
                            : newFilterField)
                        : $t("entities.list.selectField")}
                    </span>
                    <ChevronDown class="h-4 w-4 shrink-0" />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start" class="w-full max-h-96 overflow-auto">
                {#each filterableColumns as col}
                  <DropdownMenu.Item
                    onSelect={() => {
                      newFilterField = col.key;
                      editingFilterId = null;
                      newFilterValue = "";
                      newFilterStartDate = "";
                      newFilterEndDate = "";
                      const columnType = col.type;
                      const operators = getOperatorsForColumnType(columnType);
                      if (!operators.includes(newFilterOperator)) {
                        newFilterOperator = operators[0];
                      }
                    }}
                    closeOnSelect={true}
                    class={dropdownMenuItemWithSelectedClass('', newFilterField === col.key)}
                  >
                    {$t(col.labelKey)}
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>

          {#if newFilterField}
            {@const selectedColumn = filterableColumns.find((c) => c.key === newFilterField)}
            {@const availableOperators = selectedColumn
              ? getOperatorsForColumnType(selectedColumn.type)
              : []}
            <div>
              <label class="text-xs font-normal text-foreground mb-1 block" for="advanced-operator">
                {$t("entities.list.operator")}
              </label>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}
                    <Button
                      variant="outline"
                      class="h-9 w-full justify-between font-normal"
                      {...props}
                    >
                      <span class="text-foreground">
                        {newFilterOperator ? $t(`entities.list.operators.${newFilterOperator}`) : ''}
                      </span>
                      <ChevronDown class="h-4 w-4 shrink-0" />
                    </Button>
                  {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="start" class="w-full">
                  {#each availableOperators as op}
                    <DropdownMenu.Item
                      onSelect={() => {
                        newFilterOperator = op as FilterOperator;
                        newFilterStartDate = "";
                        newFilterEndDate = "";
                      }}
                      closeOnSelect={true}
                      class={dropdownMenuItemWithSelectedClass('', newFilterOperator === op)}
                    >
                      {$t(`entities.list.operators.${op}`)}
                    </DropdownMenu.Item>
                  {/each}
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </div>

            <div>
              <label class="text-xs font-normal text-foreground mb-1 block" for="advanced-value">
                {$t("entities.list.value")}
              </label>
              {#if selectedColumn?.type === "badge" && selectedColumn.badge?.values}
                {@const selectedBadgeKeys = Array.isArray(newFilterValue) ? newFilterValue : (newFilterValue ? [newFilterValue] : [])}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props })}
                      <Button
                        variant="outline"
                        class="h-9 w-full justify-between font-normal"
                        {...props}
                      >
                        <span
                          class={selectedBadgeKeys.length > 0
                            ? "text-foreground"
                            : "text-muted-foreground/70 text-xs"}
                        >
                          {selectedBadgeKeys.length > 0
                            ? `${selectedBadgeKeys.length} ${$t("entities.list.selected")}`
                            : $t("entities.list.selectValue")}
                        </span>
                        <ChevronDown class="h-4 w-4 shrink-0" />
                      </Button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="start" class="w-full max-h-96 overflow-auto">
                    {#each Object.entries(selectedColumn.badge?.values || {}) as [key, value]}
                      {@const badgeColors = badgeClassesFromToken(value.color ?? null)}
                      <DropdownMenuCheckboxItem
                        checked={selectedBadgeKeys.includes(key)}
                        onCheckedChange={() => toggleBadgeFilterValue(key)}
                        closeOnSelect={false}
                      >
                        <Badge
                          class="shadow-none"
                          style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
                        >
                          {value.labelText ||
                            $t(value.labelKey || `entities.customer.status.${key}`)}
                        </Badge>
                      </DropdownMenuCheckboxItem>
                    {/each}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              {:else if selectedColumn?.type === "date" || selectedColumn?.type === "datetime"}
                {#if newFilterOperator === "BETWEEN"}
                  <div class="space-y-2">
                    <DateWheelPicker
                      bind:value={newFilterStartDate}
                      placeholder={$t("entities.list.selectValue")}
                      includeTime={selectedColumn?.type === "datetime"}
                    />
                    <DateWheelPicker
                      bind:value={newFilterEndDate}
                      placeholder={$t("entities.list.selectValue")}
                      includeTime={selectedColumn?.type === "datetime"}
                    />
                  </div>
                {:else}
                  <DateWheelPicker
                    bind:value={newFilterValue}
                    placeholder={$t("entities.list.selectValue")}
                    includeTime={selectedColumn?.type === "datetime"}
                  />
                {/if}
              {:else}
                <Input
                  placeholder={$t("entities.list.filterPlaceholder")}
                  value={newFilterValue}
                  oninput={(e) => (newFilterValue = e.currentTarget.value)}
                  class="w-full placeholder:text-muted-foreground/70 placeholder:text-xs"
                />
              {/if}
            </div>

            {#if editingFilterId}
              <div class="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1"
                  onclick={cancelEditAdvancedFilter}
                >
                  {$t("common.cancel")}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  class="flex-1"
                  onclick={addAdvancedFilter}
                  disabled={!newFilterField || (
                    newFilterOperator === "BETWEEN" ? (!newFilterStartDate || !newFilterEndDate) :
                    Array.isArray(newFilterValue) ? newFilterValue.length === 0 :
                    !newFilterValue
                  )}
                >
                  {$t("common.edit")}
                </Button>
              </div>
            {:else}
              <Button
                variant="default"
                size="sm"
                class="w-full"
                onclick={addAdvancedFilter}
                disabled={!newFilterField || (
                  newFilterOperator === "BETWEEN" ? (!newFilterStartDate || !newFilterEndDate) :
                  Array.isArray(newFilterValue) ? newFilterValue.length === 0 :
                  !newFilterValue
                )}
              >
                {$t("entities.list.addFilter")}
              </Button>
            {/if}
          {/if}
        </div>
      </div>

      {#if filterableColumns.length === 0}
        <div
          class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground"
        >
          <p class="text-sm">{$t("entities.list.noFilterableFields")}</p>
        </div>
      {/if}
    </TabsContent>
  </Tabs>
</div>
