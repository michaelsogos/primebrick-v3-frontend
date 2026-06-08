<script lang="ts">
  import { t } from '$lib/i18n';
  import { formatListCellValue } from '$lib/i18n/date-format';
  import { formatDatetimeCellDisplay } from '$lib/entity-list';
  import { Badge } from '$lib/components/ui/badge';
  import { badgeClassesFromToken } from '$lib/colors/badge';
  import type { MetaColumn } from '$lib/entity-list/types';
  import { uiLang } from '$lib/i18n/store.svelte';
  import CircleCheck from '@lucide/svelte/icons/circle-check'
  import CircleX from '@lucide/svelte/icons/circle-x';
  import * as Tooltip from '$lib/components/ui/tooltip';

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

  function isDatetimeIanaRecordMode(col: MetaColumn, modeByKey: Record<string, 'browser' | 'record'>): boolean {
    return col.type === 'datetime' && !!col.datetimeIanaToggle && (modeByKey[col.key] ?? 'browser') === 'record';
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
        <p>{$t(`entities.userProfile.fields.${column.key}`)}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  {:else if value === false}
    <Tooltip.Root>
      <Tooltip.Trigger>
        <CircleX class="size-4 text-muted-foreground shrink-0" />
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{$t(`entities.userProfile.fields.${column.key}_false`)}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  {:else}
    <span class="min-w-0 truncate">-</span>
  {/if}
{:else if column.badge?.values && value}
  {@const badgeValue = value as string}
  {@const badgeColors = badgeClassesFromToken(column.badge.values[badgeValue]?.color ?? null)}
  <Badge
    class="shadow-none"
    style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
  >
    {column.badge.values[badgeValue]?.labelText || $t(column.badge.values[badgeValue]?.labelKey || `entities.customer.status.${badgeValue}`)}
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
  <span class="min-w-0 truncate">{formatListCellValue(column, value, $uiLang)}</span>
{/if}