<script lang="ts">
  import { t } from '$lib/i18n';
  import { formatListCellValue } from '$lib/i18n/date-format';
  import { Badge } from '$lib/components/ui/badge';
  import { badgeClassesFromToken } from '$lib/colors/badge';
  import type { MetaColumn } from '$lib/entity-list/types';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { CircleCheck, CircleX } from 'lucide-svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';

  let {
    row,
    column,
    rowSelected,
    rowDeleted,
    datetimeIanaModeByKey
  }: {
    row: Record<string, unknown>;
    column: MetaColumn;
    rowSelected: boolean;
    rowDeleted: boolean;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
  } = $props();

  const value = $derived(row[column.key]);
  const isIanaRecordMode = $derived(
    column.type === 'datetime' && column.datetimeIanaToggle && (datetimeIanaModeByKey[column.key] ?? 'browser') === 'record'
  );
</script>

<div class="flex flex-col gap-1 rounded-md p-2 hover:bg-accent min-w-0 {isIanaRecordMode ? 'border border-amber-200/70 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950' : ''}">
  <span class="text-xs font-semibold text-primary break-words">{$t(column.labelKey)}</span>
  {#if column.type === 'badge' && column.badge?.values && value}
    {@const badgeValue = value as string}
    {@const badgeColors = badgeClassesFromToken(column.badge.values[badgeValue]?.color ?? null)}
    <Badge
      class="shadow-none"
      style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
    >
      {column.badge.values[badgeValue]?.labelText ?? $t(column.badge.values[badgeValue]?.labelKey ?? `entities.customer.status.${badgeValue}`)}
    </Badge>
  {:else if column.type === 'datetime' && column.datetimeIanaToggle}
    {@const mode = datetimeIanaModeByKey[column.key] ?? 'browser'}
    {@const parts = formatListCellValue(column, value, $uiLang)}
    {#if isIanaRecordMode && typeof parts === 'string' && parts.includes('(')}
      {@const textEnd = parts.lastIndexOf('(')}
      {@const text = parts.substring(0, textEnd).trim()}
      {@const iana = parts.substring(textEnd + 1, parts.length - 1).trim()}
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-sm font-medium break-words">{text}</span>
        <Badge
          variant="outline"
          class="w-fit max-w-fit border-amber-300/90 bg-amber-100 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-950 shadow-none dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          {iana}
        </Badge>
      </div>
    {:else}
      <span class="text-sm font-medium break-words">{parts}</span>
    {/if}
  {:else if column.type === 'boolean'}
    {#if value === true}
      <Tooltip.Root>
        <Tooltip.Trigger>
          <CircleCheck class="size-4 text-green-600" />
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>{$t(`entities.userProfile.fields.${column.key}`)}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    {:else if value === false}
      <Tooltip.Root>
        <Tooltip.Trigger>
          <CircleX class="size-4 text-muted-foreground" />
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>{$t(`entities.userProfile.fields.${column.key}_false`)}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    {:else}
      <span class="text-sm font-medium break-words">-</span>
    {/if}
  {:else if column.type === 'color' && value}
    <Tooltip.Root>
      <Tooltip.Trigger>
        <div
          class="w-5 h-5 rounded-full border shadow-sm"
          style="background-color: {value};"
        ></div>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{value}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  {:else}
    <span class="text-sm font-medium break-words">{formatListCellValue(column, value, $uiLang)}</span>
  {/if}
</div>
