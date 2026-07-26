<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { SelectionCounter } from '../toolbar';
  import { cn } from '$lib/utils.js';
  import ChevronsLeft from '@lucide/svelte/icons/chevrons-left'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import ChevronsRight from '@lucide/svelte/icons/chevrons-right';

  let {
    footerRangeTotal,
    footerRangeStart,
    footerRangeEnd,
    footerPage,
    footerTotalPages,
    footerUsesClientPaging,
    clientSelectedPage = $bindable(1),
    rowSelectionEnabled,
    selectionCount,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    selectionPastParticipleKey,
    showSelectedOnly = $bindable(false),
    pageSize,
    pageSizeOptions,
    page,
    totalPages,
    onPageChange,
    onPageSizeChange
  }: {
    footerRangeTotal: number;
    footerRangeStart: number;
    footerRangeEnd: number;
    footerPage: number;
    footerTotalPages: number;
    footerUsesClientPaging: boolean;
    clientSelectedPage: number;
    rowSelectionEnabled: boolean;
    selectionCount: number;
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;
    selectionPastParticipleKey: string;
    showSelectedOnly: boolean;
    pageSize: number;
    pageSizeOptions: number[];
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  } = $props();
</script>

<div
  class={cn(
    'flex items-center justify-between gap-3 border-t bg-background px-3 py-2',
    'text-xs'
  )}
>
  <!-- Left side: Row range + Selection Counter -->
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
    <div class="text-muted-foreground">
      {#if footerRangeTotal === 0}
        0
      {:else}
        {footerRangeStart}-{footerRangeEnd} / {footerRangeTotal}
      {/if}
    </div>
    {#if rowSelectionEnabled && selectionCount > 0}
      <SelectionCounter
        selectionCount={selectionCount}
        selectionLabelKey={selectionLabelKey}
        selectionLabelSingularKey={selectionLabelSingularKey}
        selectionLabelText={selectionLabelText}
        selectionLabelSingularText={selectionLabelSingularText}
        selectionPastParticipleKey={selectionPastParticipleKey}
        showSelectedOnly={showSelectedOnly}
        onShowSelectedOnlyChange={(show: boolean) => { showSelectedOnly = show; if (show) clientSelectedPage = 1; }}
      />
    {/if}
  </div>

  <!-- Right side: Page size + Pagination controls -->
  <div class="flex items-center gap-2">
    <span class="text-muted-foreground">{$t('entities.list.pageSize')}</span>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button variant="soft" size="xs" {...props}>
            {pageSize}
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start">
        {#each pageSizeOptions as opt (opt)}
          <DropdownMenu.Item
            class={dropdownMenuSelectedItemClass(opt === pageSize)}
            onSelect={() => {
              onPageSizeChange(opt);
            }}
          >
            {opt}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <div class="mx-1 h-6 w-px divider-primary-gradient" aria-hidden="true"></div>

    <div class="flex items-center gap-2">
      <Button
        variant="soft"
        size="xs"
        disabled={footerPage <= 1}
        onclick={() => {
          if (footerUsesClientPaging) clientSelectedPage = 1;
          else onPageChange(1);
        }}
        aria-label={$t('entities.list.firstPage')}
        title={$t('entities.list.firstPage')}
      >
        <ChevronsLeft class="size-4" />
      </Button>
      <Button
        variant="soft"
        size="xs"
        disabled={footerPage <= 1}
        onclick={() => {
          if (footerUsesClientPaging) clientSelectedPage = Math.max(1, clientSelectedPage - 1);
          else onPageChange(Math.max(1, page - 1));
        }}
        aria-label={$t('entities.list.previousPage')}
        title={$t('entities.list.previousPage')}
      >
        <ChevronLeft class="size-4" />
      </Button>
      <div class="whitespace-nowrap px-0.5 text-center tabular-nums text-muted-foreground">
        {$t('entities.list.paginationStatus')
          .replace('{page}', String(footerPage))
          .replace('{total}', String(footerTotalPages))}
      </div>
      <Button
        variant="soft"
        size="xs"
        disabled={footerPage >= footerTotalPages}
        onclick={() => {
          if (footerUsesClientPaging) clientSelectedPage = Math.min(footerTotalPages, clientSelectedPage + 1);
          else onPageChange(Math.min(totalPages, page + 1));
        }}
        aria-label={$t('entities.list.nextPage')}
        title={$t('entities.list.nextPage')}
      >
        <ChevronRight class="size-4" />
      </Button>
      <Button
        variant="soft"
        size="xs"
        disabled={footerPage >= footerTotalPages}
        onclick={() => {
          if (footerUsesClientPaging) clientSelectedPage = footerTotalPages;
          else onPageChange(totalPages);
        }}
        aria-label={$t('entities.list.lastPage')}
        title={$t('entities.list.lastPage')}
      >
        <ChevronsRight class="size-4" />
      </Button>
    </div>
  </div>
</div>
