<script lang="ts">
  import { t } from '$lib/i18n';
  import { formatListCellValue } from '$lib/i18n/date-format';
  import { formatDatetimeCellDisplay } from '$lib/entity-list';
  import { Badge } from '$lib/components/ui/badge';
  import { badgeClassesFromToken } from '$lib/colors/badge';
  import type { MetaColumn } from '$lib/entity-list/types';
  import { uiLang } from '$lib/i18n/store.svelte';
  import CircleCheck from '@lucide/svelte/icons/circle-check'
  import CircleX from '@lucide/svelte/icons/circle-x'
  import Ban from '@lucide/svelte/icons/ban';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils.js';
  import TableCell from '../table/TableCell.svelte';

  let {
    row,
    column,
    rowSelected,
    rowDeleted,
    datetimeIanaModeByKey,
    viewMode,
    cell,
    datetimeIanaRenderTick
  }: {
    row: Record<string, unknown>;
    column: MetaColumn;
    rowSelected: boolean;
    rowDeleted: boolean;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    viewMode?: 'cards_grid' | 'cards_list';
    cell?: any;
    datetimeIanaRenderTick?: number;
  } = $props();

  const value = $derived(row[column.key]);
  const isIanaRecordMode = $derived(
    column.type === 'datetime' && !!column.datetimeIanaToggle && (datetimeIanaModeByKey[column.key] ?? 'browser') === 'record'
  );

  function isDatetimeIanaRecordMode(col: MetaColumn, modeByKey: Record<string, 'browser' | 'record'>): boolean {
    return col.type === 'datetime' && !!col.datetimeIanaToggle && (modeByKey[col.key] ?? 'browser') === 'record';
  }

  function isCardFieldEmpty(): boolean {
    if (cell) return false;
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  }
</script>

<div
  class={cn(
    'flex flex-col gap-0.5',
    viewMode === 'cards_list' ? 'min-w-36 max-w-[24rem] shrink-0' : 'min-w-0'
  )}
>
  <span class="text-xs font-medium text-muted-foreground">{$t(column.labelKey)}</span>
  <div class="min-w-0 text-sm">
    {#if isCardFieldEmpty()}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button
              type="button"
              {...props}
              data-pb-card-cta
              class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground"
              aria-label={$t('entities.list.clear')}
            >
              <Ban class="size-4" />
            </button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{$t('entities.list.emptyField')}</Tooltip.Content>
      </Tooltip.Root>
    {:else if cell}
      {@render cell({ row, column })}
    {:else}
      <TableCell 
        row={row} 
        column={column} 
        datetimeIanaModeByKey={datetimeIanaModeByKey} 
        datetimeIanaRenderTick={datetimeIanaRenderTick ?? 0} 
      />
    {/if}
  </div>
</div>