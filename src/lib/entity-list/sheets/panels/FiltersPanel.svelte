<script lang="ts">
  /**
   * FiltersPanel — the entity-list filters sheet. EVERY field control is
   * resolved by `FormFieldDispatcher surface="filter"` from the column
   * contract (`type`/`format`/`options_source`/`ref`) — the panel owns no
   * control anatomy of its own: badges are `display="badge"` multi
   * ComboSelects, census subjects the detailed multi combo, booleans the
   * tri-state, entity refs the paged server combobox, write-only editor
   * widgets degrade to text.
   *
   * Standard tab = one criterion per filterable column (quick filters).
   * Advanced tab = explicit {field, operator, value} criteria rows — the
   * value slot renders the SAME dispatcher (operator-aware: BETWEEN shows
   * a pair; array-producing controls feed IN/NOT IN through the core
   * serializer).
   *
   * Apply is draft-commit: the sheet stays open (sheets.md semantics —
   * commit closes only for form panels).
   */
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import {
    Button,
    ButtonGroup,
    ComboSelect,
    PrimeField,
    SearchInput,
    SheetPanelLayout,
    DynamicIcon,
    formatListCellValue,
    getResolvedIanaTimeZone,
  } from '@primebrick/ui';
  import SheetHeaderAction from '$lib/shell/sheets/SheetHeaderAction.svelte';
  import FormFieldDispatcher from '$lib/entity-form/FormFieldDispatcher.svelte';
  import { useCensusSubjectOptions } from '$lib/entity-form/use-census-subject-options.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import {
    Funnel,
    Eraser,
    Play,
    Pencil,
    X as XIcon,
  } from '@primebrick/ui/vendor/lucide';
  import {
    CalendarDate,
    CalendarDateTime,
    parseDate,
    parseDateTime,
  } from '@internationalized/date';
  import type {
    MetaColumn,
    AdvancedFilter,
    FilterOperator,
  } from '$lib/entity-list/types';
  import {
    getOperatorsForColumnType,
    FILTER_OPERATOR_ICON,
  } from '$lib/entity-list/types';

  interface Props {
    /** Entity being filtered — feeds `options_source:"audit.actors"`
     *  columns through `{entity}/audit-actors`. */
    entity?: string;
    filterableColumns?: MetaColumn[];
    filterValues?: Record<string, unknown>;
    onFilterValuesChange?: (values: Record<string, unknown>) => void;
    onResetFilters?: () => void;
    advancedFilters?: AdvancedFilter[];
    onAdvancedFiltersChange?: (filters: AdvancedFilter[], connector: 'AND' | 'OR') => void;
  }

  let {
    entity,
    filterableColumns = [],
    filterValues = {},
    onFilterValuesChange,
    onResetFilters,
    advancedFilters = [],
    onAdvancedFiltersChange,
  }: Props = $props();

  // Census subject vocabularies — same derivation the form surface uses.
  const census = useCensusSubjectOptions(() => shellNav.modules);

  // Draft state — committed only by Apply (see applyFilters).
  let tempFilterValues = $state<Record<string, unknown>>({});
  let timezoneValues = $state<Record<string, string>>({});
  let browserTimezone = $state<string | null>(null);

  let tempAdvancedFilters = $state<AdvancedFilter[]>([]);
  let globalConnector = $state<'AND' | 'OR'>('AND');

  let newFilterField = $state<string>('');
  let newFilterOperator = $state<FilterOperator>('=');
  let newFilterValue = $state<unknown>('');
  let newFilterStart = $state<unknown>(null);
  let newFilterEnd = $state<unknown>(null);
  let advancedTimezone = $state<string>('');
  let editingFilterId = $state<string | null>(null);

  let tabValue = $state<'standard' | 'advanced'>('standard');

  // Standard vs advanced surfaces: `datetime` columns are ADVANCED-ONLY —
  // a same-instant equality quick-filter is noise (ranges/`BETWEEN` live
  // in the advanced criteria). `date` stays standard (day-precision
  // equality is meaningful). The advanced field combo gets the FULL set.
  const standardColumnsBase = $derived(filterableColumns.filter((c) => c.type !== 'datetime'));
  const fieldOptionsColumns = $derived(filterableColumns);

  // Field-name search — standard tab only (the advanced field combo has
  // its own internal search; a shared box there filters nothing it sees).
  let fieldSearch = $state('');
  const filteredColumns = $derived.by(() => {
    const q = fieldSearch.trim().toLowerCase();
    if (!q) return standardColumnsBase;
    return standardColumnsBase.filter(
      (c) =>
        c.key.toLowerCase().includes(q) ||
        c.label_key.toLowerCase().includes(q) ||
        $t(c.label_key).toLowerCase().includes(q),
    );
  });

  onMount(() => {
    if (!browser) return;
    browserTimezone = getResolvedIanaTimeZone();
    advancedTimezone = browserTimezone || 'UTC';
    tempAdvancedFilters = [...advancedFilters];
    const initial = { ...filterValues };
    for (const col of filterableColumns) {
      if (col.type === 'date' || col.type === 'datetime') {
        const tz = browserTimezone || 'UTC';
        timezoneValues[col.key] = tz;
        const raw = initial[col.key];
        if (typeof raw === 'string' && raw) {
          initial[col.key] = isoToCalendarDate(raw, col.type, tz);
        }
      }
    }
    tempFilterValues = initial;
  });

  // ISO string → CalendarDate/CalendarDateTime (draft restore for the
  // date_dropper filter control).
  function isoToCalendarDate(
    isoString: string | null | undefined,
    type: 'date' | 'datetime' = 'date',
    timezone: string = 'UTC',
  ): CalendarDate | CalendarDateTime | null {
    if (!isoString) return null;
    try {
      if (type === 'datetime') {
        if (isoString.endsWith('Z')) {
          const date = new Date(isoString);
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
          const get = (p: string) => parseInt(parts.find((x) => x.type === p)?.value || '0', 10);
          let hour = get('hour');
          if (hour === 24) hour = 0;
          return new CalendarDateTime(
            get('year'),
            get('month'),
            get('day'),
            hour,
            get('minute'),
            get('second'),
          );
        }
        return parseDateTime(isoString);
      }
      return parseDate(isoString);
    } catch {
      return null;
    }
  }

  // CalendarDate/CalendarDateTime → wire value: `date` keeps the plain
  // date string; `datetime` converts through the picker's timezone to a
  // UTC ISO instant.
  function calendarDateToUtcIso(
    date: CalendarDate | CalendarDateTime | null,
    timezone: string,
  ): string | null {
    if (!date) return null;
    if (date instanceof CalendarDate) return date.toString();
    const utcBase = new Date(
      Date.UTC(date.year, date.month - 1, date.day, date.hour, date.minute, date.second),
    );
    const utcDate = new Date(utcBase.getTime() - getTimezoneOffset(timezone) * 60 * 1000);
    return utcDate.toISOString();
  }

  function getTimezoneOffset(timezone: string): number {
    const date = new Date();
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
  }

  function applyFilters() {
    const next = { ...tempFilterValues };
    for (const col of filterableColumns) {
      if (col.type !== 'date' && col.type !== 'datetime') continue;
      const ianaField = col.datetime_iana_toggle?.record_iana_field;
      const v = next[col.key];
      if (v instanceof CalendarDateTime) {
        const tz = timezoneValues[col.key] || browserTimezone || 'UTC';
        next[col.key] = calendarDateToUtcIso(v, tz);
        if (ianaField) {
          if (tz !== browserTimezone) next[ianaField] = tz;
          else delete next[ianaField];
        }
      } else if (v instanceof CalendarDate) {
        next[col.key] = v.toString();
        if (ianaField) delete next[ianaField];
      } else if (ianaField) {
        delete next[ianaField];
      }
    }
    tempFilterValues = next;
    onFilterValuesChange?.(next);
    onAdvancedFiltersChange?.(tempAdvancedFilters, globalConnector);
  }

  function resetAllFilters() {
    tempFilterValues = {};
    timezoneValues = {};
    tempAdvancedFilters = [];
    newFilterField = '';
    newFilterOperator = '=';
    newFilterValue = '';
    newFilterStart = null;
    newFilterEnd = null;
    editingFilterId = null;
    onResetFilters?.();
  }

  // ── Advanced tab ────────────────────────────────────────────────────

  const selectedColumn = $derived(filterableColumns.find((c) => c.key === newFilterField));
  const availableOperators = $derived(
    selectedColumn ? getOperatorsForColumnType(selectedColumn.type) : [],
  );
  const fieldOptions = $derived(
    fieldOptionsColumns.map((c) => ({ value: c.key, label: $t(c.label_key), _icon: c.icon ?? '' })),
  );
  const operatorOptions = $derived(
    availableOperators.map((op) => ({
      value: op,
      label: $t(`system.entities.list.operators.${op}`),
      _icon: FILTER_OPERATOR_ICON[op],
    })),
  );

  // Field-change side effect (ComboSelect has no change callback): a new
  // field resets the draft value and re-clamps the operator. Setting
  // `prevField` first makes editAdvancedFilter a no-op here.
  let prevField = $state('');
  $effect(() => {
    const f = newFilterField;
    if (f === prevField) return;
    prevField = f;
    editingFilterId = null;
    newFilterValue = '';
    newFilterStart = null;
    newFilterEnd = null;
    const col = filterableColumns.find((c) => c.key === f);
    const ops = col ? getOperatorsForColumnType(col.type) : [];
    if (ops.length && !ops.includes(newFilterOperator)) newFilterOperator = ops[0];
  });

  // Dispatcher output → wire value: CalendarDateTime needs the timezone
  // conversion, CalendarDate keeps its string, everything else passes.
  function criterionValue(raw: unknown): unknown {
    if (raw instanceof CalendarDateTime) {
      return calendarDateToUtcIso(raw, advancedTimezone || browserTimezone || 'UTC');
    }
    if (raw instanceof CalendarDate) return raw.toString();
    return raw;
  }

  function addAdvancedFilter() {
    if (!newFilterField) return;
    let value: AdvancedFilter['value'];
    if (newFilterOperator === 'BETWEEN') {
      const start = criterionValue(newFilterStart);
      const end = criterionValue(newFilterEnd);
      if (start == null || start === '' || end == null || end === '') return;
      value = { start, end };
    } else {
      const v = criterionValue(newFilterValue);
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return;
      value = v;
    }

    if (editingFilterId) {
      tempAdvancedFilters = tempAdvancedFilters.map((f) =>
        f.id === editingFilterId
          ? { ...f, field: newFilterField, operator: newFilterOperator, value: value as AdvancedFilter['value'] }
          : f,
      );
      editingFilterId = null;
    } else {
      tempAdvancedFilters = [
        ...tempAdvancedFilters,
        {
          id: crypto.randomUUID(),
          field: newFilterField,
          operator: newFilterOperator,
          value: value as AdvancedFilter['value'],
        },
      ];
    }

    newFilterField = '';
    newFilterValue = '';
    newFilterStart = null;
    newFilterEnd = null;
  }

  function editAdvancedFilter(filter: AdvancedFilter) {
    const col = filterableColumns.find((c) => c.key === filter.field);
    prevField = filter.field; // mark before assigning — the watcher no-ops
    newFilterField = filter.field;
    newFilterOperator = filter.operator;
    editingFilterId = filter.id;
    const restore = (raw: unknown) =>
      col?.type === 'datetime' || col?.type === 'date'
        ? isoToCalendarDate(raw as string, col.type, browserTimezone || 'UTC')
        : raw;
    const v = filter.value;
    if (
      filter.operator === 'BETWEEN' &&
      typeof v === 'object' &&
      v !== null &&
      'start' in v &&
      'end' in v
    ) {
      newFilterStart = restore(v.start);
      newFilterEnd = restore(v.end);
      newFilterValue = '';
    } else {
      newFilterValue = restore(v);
      newFilterStart = null;
      newFilterEnd = null;
    }
  }

  function cancelEditAdvancedFilter() {
    editingFilterId = null;
    newFilterField = '';
    newFilterOperator = '=';
    newFilterValue = '';
    newFilterStart = null;
    newFilterEnd = null;
  }

  function removeAdvancedFilter(id: string) {
    tempAdvancedFilters = tempAdvancedFilters.filter((f) => f.id !== id);
  }

  // Summary line for a committed criterion — badge values resolve through
  // the column's declared `badge.values` (label_text/label_key), never an
  // entity-specific fallback; booleans read the tri-state vocabulary.
  function badgeLabel(col: MetaColumn | undefined, key: unknown): string {
    const decl = col?.badge?.values?.[key as string];
    return decl?.label_text ?? (decl?.label_key ? $t(decl.label_key) : String(key));
  }

  function summaryValue(col: MetaColumn | undefined, filter: AdvancedFilter): string {
    const v = filter.value;
    if (Array.isArray(v)) return v.map((x) => badgeLabel(col, x)).join(', ');
    if (col?.type === 'boolean' || col?.pg_type === 'boolean') {
      return v === 'true' || v === true
        ? $t('system.entities.list.booleanTrue')
        : $t('system.entities.list.booleanFalse');
    }
    if (
      filter.operator === 'BETWEEN' &&
      typeof v === 'object' &&
      v !== null &&
      'start' in v &&
      'end' in v
    ) {
      return col
        ? `${formatListCellValue(col, v.start, $uiLang)} – ${formatListCellValue(col, v.end, $uiLang)}`
        : `${String(v.start)} – ${String(v.end)}`;
    }
    return col ? formatListCellValue(col, v, $uiLang) : String(v);
  }

  const addDisabled = $derived(
    !newFilterField ||
      (newFilterOperator === 'BETWEEN'
        ? newFilterStart == null || newFilterStart === '' || newFilterEnd == null || newFilterEnd === ''
        : newFilterValue == null ||
          newFilterValue === '' ||
          (Array.isArray(newFilterValue) && newFilterValue.length === 0)),
  );
</script>

<SheetPanelLayout contentClass="p-4" footer={applyFooter}>
  {#snippet icon()}
    <Funnel class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('system.entities.list.filters')}
  {/snippet}
  {#snippet actions()}
    <SheetHeaderAction title={$t('app.common.reset')} onclick={resetAllFilters}>
      <Eraser class="size-4" />
    </SheetHeaderAction>
  {/snippet}
  {#snippet toolbar()}
    <div class="space-y-2">
      <ButtonGroup segmented class="w-full">
        {#each [['standard', 'funnel'], ['advanced', 'hammer']] as [mode, icon] (mode)}
          {@const active = tabValue === mode}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            class="flex-1 {active
              ? 'bg-foreground/10 text-foreground shadow-xs'
              : 'text-muted-foreground'}"
            aria-pressed={active}
            data-testid="filters-mode-{mode}"
            onclick={() => (tabValue = mode as 'standard' | 'advanced')}
          >
            <DynamicIcon name={icon} size={14} class="shrink-0" />
            {$t(`system.entities.list.${mode}Filters`)}
          </Button>
        {/each}
      </ButtonGroup>
      {#if tabValue === 'standard'}
        <SearchInput
          bind:value={fieldSearch}
          placeholder={$t('system.entities.list.searchFields')}
          data_testid="filters-field-search"
        />
      {/if}
    </div>
  {/snippet}

  {#if tabValue === 'standard'}
    {#each filteredColumns as col (col.key)}
      <PrimeField
        label={$t(col.label_key)}
        icon={col.icon}
        help={col}
        help_context="list"
        class="mb-4"
      >
        {#snippet control({ id })}
          <FormFieldDispatcher
            surface="filter"
            column={col}
            filterEntity={entity}
            bind:value={tempFilterValues[col.key]}
            bind:timezone={timezoneValues[col.key]}
            emitsOptions={census.emitsOptions}
            callablesOptions={census.callablesOptions}
            controlProps={{ id }}
          />
        {/snippet}
      </PrimeField>
    {/each}
  {:else}
    <ButtonGroup segmented class="w-full mb-4">
      {#each [['AND', 'ampersand', 'system.entities.list.allCriteria'], ['OR', 'split', 'system.entities.list.atLeastOneCriteria']] as [conn, icon, labelKey] (conn)}
        <Button
          variant="ghost"
          size="sm"
          class="flex-1 {globalConnector === conn
            ? 'bg-foreground/10 text-foreground shadow-xs'
            : 'text-muted-foreground'}"
          aria-pressed={globalConnector === conn}
          data-testid="filters-connector-{conn.toLowerCase()}"
          onclick={() => (globalConnector = conn as 'AND' | 'OR')}
        >
          <DynamicIcon name={icon} size={14} />
          {$t(labelKey)}
        </Button>
      {/each}
    </ButtonGroup>

    {#if tempAdvancedFilters.length > 0}
      <div class="space-y-3 mb-4">
        {#each tempAdvancedFilters as filter (filter.id)}
          {@const column = filterableColumns.find((c) => c.key === filter.field)}
          <div class="flex items-center gap-2 p-3 bg-muted/30 rounded-md border">
            <div class="flex-1 min-w-0">
              <div class="text-xs flex flex-wrap items-center gap-1">
                {#if column?.icon}
                  <DynamicIcon name={column.icon} size={14} class="shrink-0 opacity-70" />
                {/if}
                <span class="font-bold text-foreground">
                  {column ? $t(column.label_key) : filter.field}
                </span>
                <span class="text-primary inline-flex items-center gap-0.5">
                  {#if FILTER_OPERATOR_ICON[filter.operator]}
                    <DynamicIcon name={FILTER_OPERATOR_ICON[filter.operator]} size={12} class="opacity-70" />
                  {/if}
                  {$t(`system.entities.list.operators.${filter.operator}`)}
                </span>
                <span class="italic text-muted-foreground">
                  {summaryValue(column, filter)}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onclick={() => editAdvancedFilter(filter)}
                title={$t('app.common.edit')}
                data-testid="filters-criterion-edit"
              >
                <Pencil class="size-3" />
              </button>
              <button
                type="button"
                class="flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onclick={() => removeAdvancedFilter(filter.id)}
                title={$t('app.common.remove')}
                data-testid="filters-criterion-remove"
              >
                <XIcon class="size-3" />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="border-t pt-4">
      <div class="space-y-3">
        <PrimeField label={$t('system.entities.list.field')}>
          {#snippet control({ id })}
            <ComboSelect
              {id}
              mode="single"
              bind:value={newFilterField}
              options={fieldOptions}
              valueField="value"
              labelField="label"
              iconField="_icon"
              placeholder={$t('system.entities.list.selectField')}
            />
          {/snippet}
        </PrimeField>

        {#if selectedColumn}
          <PrimeField label={$t('system.entities.list.operator')}>
            {#snippet control({ id })}
              <ComboSelect
                {id}
                mode="single"
                bind:value={newFilterOperator}
                options={operatorOptions}
                valueField="value"
                labelField="label"
                iconField="_icon"
              />
            {/snippet}
          </PrimeField>

          <PrimeField label={$t('system.entities.list.value')}>
            {#snippet control({ id })}
              {#if newFilterOperator === 'BETWEEN'}
                <div class="space-y-2">
                  <FormFieldDispatcher
                    surface="filter"
                    column={selectedColumn}
                    filterEntity={entity}
                    bind:value={newFilterStart}
                    bind:timezone={advancedTimezone}
                    controlProps={{ id }}
                  />
                  <FormFieldDispatcher
                    surface="filter"
                    column={selectedColumn}
                    filterEntity={entity}
                    bind:value={newFilterEnd}
                    bind:timezone={advancedTimezone}
                  />
                </div>
              {:else}
                <FormFieldDispatcher
                  surface="filter"
                  column={selectedColumn}
                  filterEntity={entity}
                  bind:value={newFilterValue}
                  bind:timezone={advancedTimezone}
                  emitsOptions={census.emitsOptions}
                  callablesOptions={census.callablesOptions}
                  controlProps={{ id }}
                />
              {/if}
            {/snippet}
          </PrimeField>

          {#if editingFilterId}
            <div class="flex gap-2">
              <Button variant="outline" size="sm" class="flex-1" onclick={cancelEditAdvancedFilter}>
                {$t('app.common.cancel')}
              </Button>
              <Button
                variant="default"
                size="sm"
                class="flex-1"
                onclick={addAdvancedFilter}
                disabled={addDisabled}
              >
                {$t('app.common.edit')}
              </Button>
            </div>
          {:else}
            <Button
              variant="default"
              size="sm"
              class="w-full"
              onclick={addAdvancedFilter}
              disabled={addDisabled}
              data-testid="filters-add-criterion"
            >
              {$t('system.entities.list.addFilter')}
            </Button>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  {#if filterableColumns.length === 0}
    <div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
      <p class="text-sm">{$t('system.entities.list.noFilterableFields')}</p>
    </div>
  {/if}
</SheetPanelLayout>

<!-- Primary CTA lives in FOOT (form-panel convention), not in HEAD. -->
{#snippet applyFooter()}
  <div class="p-3">
    <Button
      type="button"
      variant="default"
      class="w-full"
      onclick={applyFilters}
      data-testid="filters-apply"
    >
      <Play class="size-4" />
      {$t('app.common.apply')}
    </Button>
  </div>
{/snippet}
