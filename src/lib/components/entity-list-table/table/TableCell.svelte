<script lang="ts">
  import { t } from '$lib/i18n';
  import { formatListCellValue } from '$lib/i18n/date-format';
  import { Badge } from '$lib/components/ui/badge';
  import { badgeClassesFromToken } from '$lib/colors/badge';
  import type { MetaColumn } from '$lib/entity-list/types';
  import { uiLang } from '$lib/i18n/store.svelte';

  let {
    row,
    column,
    datetimeIanaModeByKey,
    datetimeIanaRenderTick,
    cellSnippet
  }: {
    row: Record<string, unknown>;
    column: MetaColumn;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick: number;
    cellSnippet?: any;
  } = $props();

  const value = $derived(row[column.key]);
</script>

{#if cellSnippet}
  {@render cellSnippet({ row, column })}
{:else if column.type === 'badge' && column.badge?.values && value}
  {@const badgeValue = column.badge.values[value as string]}
  {@const color = badgeValue?.color ?? null}
  {@const badgeColors = badgeClassesFromToken(color)}
  <Badge
    class="shadow-none"
    style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
  >
    {badgeValue?.labelText ?? $t(badgeValue?.labelKey ?? `entities.customer.status.${value}`)}
  </Badge>
{:else if column.type === 'datetime' || column.type === 'date'}
  {@const mode = datetimeIanaModeByKey[column.key] ?? 'browser'}
  {formatListCellValue(column, value, $uiLang)}
{:else}
  {formatListCellValue(column, value, $uiLang)}
{/if}
