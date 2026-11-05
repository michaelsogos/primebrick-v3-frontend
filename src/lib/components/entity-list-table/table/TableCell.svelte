<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { resolve } from '$app/paths';
  import { routesCensusFromModules } from '$lib/api';
  import { entityRefHref, reverseRefHref } from '$lib/entity-list/entity-links';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { t } from '$lib/i18n';
  import { formatListCellValue, toDisplayString } from '@primebrick/ui';
  import { formatDatetimeCellDisplay } from '$lib/entity-list';
  import { Badge } from '@primebrick/ui';
  import { ScheduleSpecCell, DynamicIcon } from '@primebrick/ui';
  import { badgeClassesFromToken } from '@primebrick/ui';
  import type { MetaColumn } from '$lib/entity-list/types';
  import type { Snippet } from 'svelte';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { CircleCheck } from '@primebrick/ui/vendor/lucide'
  import { CircleX } from '@primebrick/ui/vendor/lucide';
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

  /** Module route census — resolves `ref`/`reverse_ref` entity names to
   *  real declared routes (FE-owned URLs, never hardcoded in meta). */
  const routeCensus = $derived(routesCensusFromModules(shellNav.modules));
  const metaUid = getMetaUidContext();

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
  <div class="flex justify-center">
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
    {column.badge.values[badgeValue]?.label_text || $t(column.badge.values[badgeValue]?.label_key || `system.entities.customer.status.${badgeValue}`)}
  </Badge>
{:else if column.format === 'schedule_spec' && typeof value === 'string' && value !== ''}
  <ScheduleSpecCell {value} />
{:else if column.format === 'nats_subject' && value}
  <a
    href={resolve(NATS_SUBJECT_HREF)}
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
    title={toDisplayString(value)}
  >
    <Badge variant="outline" class="gap-1 shadow-none">
      {#if column.icon}<DynamicIcon name={column.icon} size={12} class="shrink-0" />{/if}
      <span class="truncate font-mono text-[11px]">{toDisplayString(value)}</span>
    </Badge>
  </a>
{:else if column.format === 'json'}
  {@const json = jsonCellContent(value)}
  {#if json.kind === 'conditions'}
    <div class="flex min-w-0 flex-wrap gap-1">
      {#each json.conditions as cond (cond.field)}
        <Badge variant="secondary" class="gap-1 font-normal">
          <span class="font-semibold">{cond.field}</span>
          <span class="text-primary">{cond.op ?? 'eq'}</span>
          {#if cond.value !== undefined}<span class="italic text-muted-foreground">{toDisplayString(cond.value)}</span>{/if}
        </Badge>
      {/each}
    </div>
  {:else}
    <span class="min-w-0 truncate font-mono text-[11px]">{json.text || '-'}</span>
  {/if}
{:else if column.type === 'ref' && column.ref && value}
  {@const href = entityRefHref(routeCensus, column.ref, toDisplayString(value))}
  {#if href}
    <a
      href={resolve(href as '/')}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
    >
      <Badge variant="outline" class="gap-1 shadow-none">
        {#if column.icon}<DynamicIcon name={column.icon} size={12} class="shrink-0" />{/if}
        <span class="truncate font-mono text-[11px]">{toDisplayString(value)}</span>
      </Badge>
    </a>
  {:else}
    <span class="min-w-0 truncate font-mono text-[11px]">{toDisplayString(value)}</span>
  {/if}
{:else if column.type === 'ref_count' && column.reverse_ref}
  {@const href = reverseRefHref(routeCensus, column.reverse_ref, metaUid, row)}
  {#if href}
    <a
      href={resolve(href as '/')}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 text-primary hover:underline"
    >
      <Badge variant="secondary" class="gap-1 shadow-none">
        {#if column.icon}<DynamicIcon name={column.icon} size={12} class="shrink-0" />{/if}
        <span>{value !== undefined && value !== null ? toDisplayString(value) : $t(column.label_key)}</span>
      </Badge>
    </a>
  {:else}
    <span class="min-w-0 truncate">{value !== undefined && value !== null ? toDisplayString(value) : '-'}</span>
  {/if}
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
  <span class="min-w-0 truncate">{getAuditFieldValue(row, column, $uiLang, formatListCellValue, getAuditColumnsContext())}</span>
{/if}