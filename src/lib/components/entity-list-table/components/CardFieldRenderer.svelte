<script lang="ts" generics="TRow extends Record<string, unknown>">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { cn } from '$lib/utils.js';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { TableCell } from '../table';
  import { Ban } from 'lucide-svelte';
  import { datetimeIanaCardFieldHighlightClass, isDatetimeIanaRecordMode } from '../utils/cell-styling';
  import { isCardFieldEmpty } from '../utils/cell-formatting';
  import { formatDatetimeCellDisplay } from '$lib/entity-list';
  import { formatListCellValue } from '$lib/i18n/date-format';
  import { stickyCardFieldChromeClass } from '../utils/card-styling';
  import type { MetaColumn } from '$lib/entity-list/types';

  let {
    row,
    column,
    rowSelected,
    rowDeleted,
    rowSelectionEnabled,
    stickyColumnsGroup,
    datetimeIanaModeByKey,
    datetimeIanaRenderTick,
    cell,
    viewMode
  }: {
    row: TRow;
    column: MetaColumn;
    rowSelected: boolean;
    rowDeleted: boolean;
    rowSelectionEnabled: boolean;
    stickyColumnsGroup: MetaColumn[];
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    datetimeIanaRenderTick: number;
    cell?: Snippet<[{ row: TRow; column: MetaColumn }]>;
    viewMode: 'cards_list' | 'cards_grid';
  } = $props();
</script>

<div
  class={cn(
    'flex flex-col gap-0.5',
    viewMode === 'cards_list' ? 'min-w-36 max-w-[24rem] shrink-0' : 'min-w-0'
  )}
>
  <div class="text-xs font-medium text-muted-foreground">{$t(column.labelKey)}</div>
  <div
    class={cn(
      'min-w-0 text-sm',
      (!isCardFieldEmpty(row, column, $uiLang, datetimeIanaModeByKey, cell, formatDatetimeCellDisplay, formatListCellValue, isDatetimeIanaRecordMode)
        ? datetimeIanaCardFieldHighlightClass(column, rowSelectionEnabled && rowSelected, datetimeIanaModeByKey)
        : undefined) ?? (rowDeleted
          ? stickyCardFieldChromeClass(column, rowSelectionEnabled && rowSelected, true, stickyColumnsGroup)
          : stickyCardFieldChromeClass(column, rowSelectionEnabled && rowSelected, false, stickyColumnsGroup))
    )}
  >
    {#if isCardFieldEmpty(row, column, $uiLang, datetimeIanaModeByKey, cell, formatDatetimeCellDisplay, formatListCellValue, isDatetimeIanaRecordMode)}
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
    {:else}
      <TableCell
        row={row}
        column={column}
        datetimeIanaModeByKey={datetimeIanaModeByKey}
        datetimeIanaRenderTick={datetimeIanaRenderTick}
      />
    {/if}
  </div>
</div>
