<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { resolve } from '$app/paths';
  import { routesCensusFromModules } from '$lib/api';
  import { entityRefHref, reverseRefHref, subjectDecl, subjectFieldLabel, filteredEntityListHref } from '$lib/entity-list/entity-links';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import CellAffordance from './CellAffordance.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { t } from '$lib/i18n';
  import { formatListCellValue, toDisplayString, colorCssFromToken, extJsonStringify, FILTER_OPERATOR_KEY } from '@primebrick/ui';
  import { formatDatetimeCellDisplay } from '$lib/entity-list';
  import { Badge } from '@primebrick/ui';
  import { ScheduleSpecCell, DynamicIcon } from '@primebrick/ui';
  import { badgeClassesFromToken } from '@primebrick/ui';
  import type { MetaColumn } from '$lib/entity-list/types';
  import type { Snippet } from 'svelte';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { CircleCheck } from '@primebrick/ui/vendor/lucide'
  import { CircleX } from '@primebrick/ui/vendor/lucide';
  import { ExternalLink } from '@primebrick/ui/vendor/lucide';
  import JsonCellViewer from './JsonCellViewer.svelte';
  import { Tooltip } from '@primebrick/ui';
  import { getAuditFieldValue } from '../utils/cell-formatting';
  import { getAuditColumnsContext, getMetaUidContext } from '../context';
  import { SparklineBars } from '@primebrick/ui';

  let {
    row,
    column,
    datetimeIanaModeByKey,
    sparklineData,
    cellSnippet
  }: {
    row: TRow;
    column: MetaColumn;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    sparklineData?: Record<string, { by_key: Record<string, unknown[]>; bucket_unit?: string }>;
    cellSnippet?: Snippet<[{ row: TRow; column: MetaColumn }]>;
  } = $props();

  const value = $derived(row[column.key]);
  /** DAL auto-join convention: `created_by`/`updated_by`/`deleted_by` (and
   *  any ref-ish column) ship a `<key>_name` sibling holding the resolved
   *  display name. Display paths always prefer it; href builders keep the
   *  raw value (uuid stays the link target). */
  const displayValue = $derived((row[`${column.key}_name`] as unknown) ?? value);
  /** Null-state label contract (`column.null_label`) — contextual
   *  translated text instead of `"-"` when the row matches `when`. */
  const nullLabel = $derived(
    value === null || value === undefined
      ? column.null_label &&
        (column.null_label.when === undefined ||
          (column.null_label.when.equals !== undefined
            ? row[column.null_label.when.field] === column.null_label.when.equals
            : column.null_label.when.not !== undefined
              ? row[column.null_label.when.field] !== column.null_label.when.not
              : true))
        ? column.null_label.label_key
        : undefined
      : undefined
  );

  /** Module route census — resolves `ref`/`reverse_ref` entity names to
   *  real declared routes (FE-owned URLs, never hardcoded in meta). */
  const routeCensus = $derived(routesCensusFromModules(shellNav.modules));
  const metaUid = getMetaUidContext();
  /** `column.color` is a TailwindColorToken (canonical: `colorCssFromToken`
   *  → inline style) — meta strings are invisible to the FE content scan,
   *  so class-based colors silently dead-render. Same mechanism as the
   *  create-form `subject_combo` `_icon_color`. */
  const iconStyle = $derived(column.color ? `color:${colorCssFromToken(column.color)}` : undefined);
  /** `format:"nats_subject"` display name — resolved from the module census
   *  (emits+callables `label_key`), same source as the create form. */
  const subjectLabel = $derived.by(() => {
    if (column.format !== 'nats_subject' || typeof value !== 'string' || !value) return undefined;
    const key = subjectDecl(shellNav.modules, value)?.label_key;
    return key ? $t(key) : undefined;
  });

  /** `type:"sparkline"` — resolve the per-row bucket series from the
   *  batch-loaded `sparklineData` map; series labels resolve `label_key`
   *  through i18n. */
  const sparklineSeries = $derived(
    (column.sparkline?.series ?? []).map((s) => ({
      field: s.field,
      color: s.color,
      label: s.label_key ? $t(s.label_key) : s.field
    }))
  );
  const sparklineBuckets = $derived(
    column.type === 'sparkline' && column.sparkline
      ? (sparklineData?.[column.key]?.by_key?.[toDisplayString(row[column.sparkline.row_key] ?? '')] as
          | { bucket_start: string; [k: string]: string | number }[]
          | undefined)
      : undefined
  );

  function isDatetimeIanaRecordMode(col: MetaColumn, modeByKey: Record<string, 'browser' | 'record'>): boolean {
    return col.type === 'datetime' && !!col.datetime_iana_toggle && (modeByKey[col.key] ?? 'browser') === 'record';
  }

  /** `format:"nats_subject"` drill-down — the module list is the canonical
   *  subject destination until the planned capabilities/events page lands
   *  (keep in sync with the `ref` column contract when it ships). */
  const NATS_SUBJECT_HREF = '/system/settings/modules';

  type JsonCondition = { field: string; op?: string; value?: unknown };
  /** Trigger/filter `{field,op,value}` DSL vocabulary → canonical
   *  `system.entities.list.operators.*` key segments (the same keys the
   *  list FilterBar badges translate through — segments sourced from
   *  `FILTER_OPERATOR_KEY`, never invented glyphs). */
  const OP_I18N_KEY: Record<string, string> = {
    eq: FILTER_OPERATOR_KEY['='],
    neq: FILTER_OPERATOR_KEY['!='],
    gt: FILTER_OPERATOR_KEY['>'],
    gte: FILTER_OPERATOR_KEY['>='],
    lt: FILTER_OPERATOR_KEY['<'],
    lte: FILTER_OPERATOR_KEY['<='],
    contains: FILTER_OPERATOR_KEY.contains,
    exists: 'exists',
  };
  const opLabel = (op?: string) => {
    const key = OP_I18N_KEY[op ?? 'eq'];
    const translated = key ? $t(`system.entities.list.operators.${key}`) : '';
    return translated && !translated.includes('operators.') ? translated : (op ?? '=');
  };
  /** Entity-list link chrome for badge-wrapped links. */
  const CELL_LINK_CLASS = 'text-primary underline underline-offset-2 rounded-sm hover:bg-neutral-200/80 dark:hover:bg-neutral-700/80';
  /** Plain text CTAs in cells (filtered-list links, viewer CTAs): ghost
   *  anatomy — foreground text, ghost `accent` hover bg, underline ON
   *  hover only, standard underline offset. */
  const CELL_TEXT_LINK_CLASS = 'text-foreground underline-offset-2 rounded-sm px-1 py-0.5 hover:bg-accent hover:underline';

  /** `format:"json"` cell content: a `[{field, op, value}]` condition list
   *  renders as prose chips (job trigger `filter` contract); anything else
   *  falls back to truncated JSON text. */
  function jsonCellContent(raw: unknown): { kind: 'conditions'; conditions: JsonCondition[] } | { kind: 'text'; text: string } {
    if (Array.isArray(raw) && raw.length > 0 && raw.every((c) => c !== null && typeof c === 'object' && 'field' in c)) {
      return { kind: 'conditions', conditions: raw as JsonCondition[] };
    }
    const text = toDisplayString(raw);
    return { kind: 'text', text: text.length > 60 ? text.slice(0, 60) + '…' : text };
  }
</script>

{#if cellSnippet}
  {@render cellSnippet({ row, column })}
{:else if column.type === 'boolean'}
  <div class="flex w-full justify-center">
    {#if value === true}
      <Tooltip.Root>
        <Tooltip.Trigger>
          <CircleCheck class="size-4 text-green-600 shrink-0" />
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>{$t(column.tooltip ?? column.label_key)}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    {:else if value === false}
      <Tooltip.Root>
        <Tooltip.Trigger>
          <CircleX class="size-4 text-muted-foreground shrink-0" />
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>{$t(column.tooltip ?? column.label_key)}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    {:else}
      <span class="min-w-0 truncate">-</span>
    {/if}
  </div>
{:else if column.type === 'sparkline' && column.sparkline}
  <SparklineBars
    buckets={sparklineBuckets}
    bucketUnit={sparklineData?.[column.key]?.bucket_unit}
    series={sparklineSeries}
    bucketField={column.sparkline.bucket_field ?? 'bucket_start'}
  />
{:else if column.badge?.values && value}
  {@const badgeValue = value as string}
  {@const badgeColors = badgeClassesFromToken(column.badge.values[badgeValue]?.color ?? null)}
  <Badge
    class="shadow-none"
    style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
  >
    {column.badge.values[badgeValue]?.label_text ?? (column.badge.values[badgeValue]?.label_key ? $t(column.badge.values[badgeValue].label_key!) : String(badgeValue))}
  </Badge>
{:else if column.format === 'schedule_spec' && typeof value === 'string' && value !== ''}
  <ScheduleSpecCell {value} />
{:else if column.format === 'nats_subject' && value}
  <!-- Display name (translated census label_key) renders INSIDE the badge
       when the census resolves it; the raw subject path always lives in
       the tooltip. Without a census match the badge shows the path itself. -->
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <a
          {...props}
          href={resolve(NATS_SUBJECT_HREF)}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex max-w-full rounded-sm"
        >
          <Badge variant="secondary" class="gap-1 shadow-none">
            {#if column.icon}<DynamicIcon name={column.icon} size={12} class="shrink-0" style={iconStyle} />{/if}
            <span class={['truncate text-xs', !subjectLabel && 'font-mono text-[11px]']}>{subjectLabel ?? toDisplayString(value)}</span>
          </Badge>
        </a>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>
      <p class="font-mono text-xs">{toDisplayString(value)}</p>
    </Tooltip.Content>
  </Tooltip.Root>
{:else if column.format === 'json'}
  {@const json = jsonCellContent(value)}
  {#if json.kind === 'conditions'}
    <div class="flex min-w-0 flex-wrap gap-1">
      {#each json.conditions as cond (cond.field)}
        <!-- Canonical black tooltip: the condition's own JSON fragment,
             pretty-printed. -->
        <Tooltip.Root>
          <Tooltip.Trigger>
            <Badge variant="secondary" class="gap-1.5 font-normal">
              <span class="text-xs font-bold text-foreground">{subjectFieldLabel(shellNav.modules, typeof row.event_subject === 'string' ? row.event_subject : undefined, cond.field)}</span>
              <span class="text-xs text-primary">{opLabel(cond.op)}</span>
              {#if cond.value !== undefined}<span class="text-xs italic text-muted-foreground">{toDisplayString(cond.value)}</span>{/if}
            </Badge>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <pre class="max-w-xs overflow-x-auto font-mono text-xs">{extJsonStringify(cond, 2)}</pre>
          </Tooltip.Content>
        </Tooltip.Root>
      {/each}
    </div>
  {:else}
    <!-- Generic JSONB fallback — specific renderers (condition chips above)
         win; everything else gets the standard viewer sheet. -->
    <JsonCellViewer {value} />
  {/if}
{:else if column.type === 'ref' && column.ref && value}
  {#if column.ref.presentation === 'badge'}
    <!-- Opt-in legacy anatomy — badge pill as a single `_blank` link. -->
    {@const href = entityRefHref(routeCensus, column.ref, toDisplayString(value))}
    {#if href}
      <a
        href={resolve(href as '/')}
        target="_blank"
        rel="noopener noreferrer"
        class={['inline-flex max-w-full items-center gap-1', CELL_LINK_CLASS]}
      >
        <Badge variant="outline" class="gap-1 shadow-none">
          {#if column.icon}<DynamicIcon name={column.icon} size={12} class="shrink-0" style={iconStyle} />{/if}
          <span class="truncate font-mono text-[11px]">{toDisplayString(displayValue)}</span>
        </Badge>
      </a>
    {:else}
      <span class="min-w-0 truncate font-mono text-[11px]">{toDisplayString(displayValue)}</span>
    {/if}
  {:else if column.ref.route === 'none'}
    <span class="min-w-0 truncate">{toDisplayString(displayValue)}</span>
  {:else}
    <!-- Default "link" anatomy: medium text (underline on hover) opens
         the record sheet; trailing ExternalLink → filtered /list _blank. -->
    {@const iconHref = filteredEntityListHref(routeCensus, column.ref.entity, [
      { field: column.ref.filter_field ?? metaUid, op: '=', value: toDisplayString(value) },
    ])}
    <CellAffordance
      text={toDisplayString(displayValue)}
      ontextclick={() =>
        openSheet('entity.record', { entity: column.ref!.entity, value, ref: column.ref })}
      href={iconHref ?? undefined}
      icon_title={$t('app.common.open_in_new_tab')}
    >
      {#snippet icon()}
        <ExternalLink class="size-3.5" />
      {/snippet}
    </CellAffordance>
  {/if}
{:else if column.type === 'ref_count' && column.reverse_ref}
  {@const href = reverseRefHref(routeCensus, column.reverse_ref, metaUid, row)}
  {#if href}
    <!-- 1-N convention: a filtered-list link is rendered as a plain link,
         never a badge (badges are for N-1 detail navigation). The count is
         shown when the service decorated it; `ref` without a count stays
         a plain link too. -->
    <a
      href={resolve(href as '/')}
      target="_blank"
      rel="noopener noreferrer"
      class={['inline-flex items-center gap-1', CELL_TEXT_LINK_CLASS]}
    >
      {#if column.icon}<DynamicIcon name={column.icon} size={12} class="shrink-0" style={iconStyle} />{/if}
      <span class="truncate">{value !== undefined && value !== null ? `${toDisplayString(value)} ${$t(column.label_key)}` : $t(column.label_key)}</span>
    </a>
  {:else}
    <span class="min-w-0 truncate">{value !== undefined && value !== null ? toDisplayString(value) : '-'}</span>
  {/if}
{:else if nullLabel}
  <span class="min-w-0 truncate text-xs italic text-destructive">{$t(nullLabel)}</span>
{:else if column.type === 'datetime'}
  {@const mode = datetimeIanaModeByKey[column.key] ?? 'browser'}
  {@const parts = formatDatetimeCellDisplay(
    column,
    row,
    $uiLang,
    mode
  )}
  {#if isDatetimeIanaRecordMode(column, datetimeIanaModeByKey) && parts.iana}
    <div class="flex min-w-0 flex-col gap-1">
      <span class="min-w-0 truncate">{parts.text}</span>
      <Badge
        variant="outline"
        class="w-fit max-w-full shrink truncate border-amber-300/90 bg-amber-100 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-950 shadow-none dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >{parts.iana}</Badge>
    </div>
  {:else}
    <span class="min-w-0 truncate">{parts.text}</span>
  {/if}
{:else}
  <span class="min-w-0 truncate">{displayValue !== value ? toDisplayString(displayValue) : getAuditFieldValue(row, column, $uiLang, formatListCellValue, getAuditColumnsContext())}</span>
{/if}