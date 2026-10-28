<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { t } from '$lib/i18n';
  import { formatListCellValue } from '@primebrick/ui';
  import { formatDatetimeCellDisplay } from '$lib/entity-list';
  import { Badge } from '@primebrick/ui';
  import { badgeClassesFromToken } from '@primebrick/ui';
  import type { MetaColumn } from '$lib/entity-list/types';
  import type { Snippet } from 'svelte';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { CircleCheck } from '@primebrick/ui/vendor/lucide'
  import { CircleX } from '@primebrick/ui/vendor/lucide';
  import { Tooltip } from '@primebrick/ui';
  import { getAuditFieldValue } from '../utils/cell-formatting';
  import { getAuditColumnsContext } from '../context';
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
      ? (sparklineData?.[column.key]?.by_key?.[String(row[column.sparkline.row_key] ?? '')] as
          | { bucket_start: string; [k: string]: string | number }[]
          | undefined)
      : undefined
  );

  function isDatetimeIanaRecordMode(col: MetaColumn, modeByKey: Record<string, 'browser' | 'record'>): boolean {
    return col.type === 'datetime' && !!col.datetime_iana_toggle && (modeByKey[col.key] ?? 'browser') === 'record';
  }
</script>

{#if cellSnippet}
  {@render cellSnippet({ row, column })}
{:else if column.type === 'boolean'}
  {#if value === true}
    <Tooltip.Root>
      <Tooltip.Trigger>
        <CircleCheck class="size-4 text-green-600 shrink-0" />
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{$t(`system.entities.user_profile.fields.${column.key}`)}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  {:else if value === false}
    <Tooltip.Root>
      <Tooltip.Trigger>
        <CircleX class="size-4 text-muted-foreground shrink-0" />
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{$t(`system.entities.user_profile.fields.${column.key}_false`)}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  {:else}
    <span class="min-w-0 truncate">-</span>
  {/if}
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