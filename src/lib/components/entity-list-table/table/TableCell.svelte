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
    -
  {/if}
{:else}
  {formatListCellValue(column, value, $uiLang)}
{/if}
