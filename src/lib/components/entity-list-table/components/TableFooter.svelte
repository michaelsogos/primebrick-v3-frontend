<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { ButtonGroup, Toolbar, KeyboardHints, Tooltip } from '@primebrick/ui';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { SelectionCounter } from '../toolbar';
  import { ChevronsLeft } from '@primebrick/ui/vendor/lucide'
  import { ChevronLeft } from '@primebrick/ui/vendor/lucide'
  import { ChevronRight } from '@primebrick/ui/vendor/lucide'
  import { ChevronsRight } from '@primebrick/ui/vendor/lucide';
  import { Keyboard } from '@primebrick/ui/vendor/lucide';

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
    onPageSizeChange,
    create_label_key
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
    /** Label key of the toolbar NEW CTA — when a create action exists the
     *  legend mirrors it verbatim (Ins = same target). */
    create_label_key?: string;
  } = $props();
</script>

<Toolbar card={false} class="gap-3 rounded-t-none border-t text-xs">
  {#snippet left()}
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
  {/snippet}

  {#snippet center()}
  <!-- Centered keyboard-legend trigger — the ELT bindings from
       useKeyboardNavigation live in the tooltip it opens (too many
       hints for an inline legend); the Toolbar collision guard still
       hides the trigger when the footer physically cannot host it. -->
  <Tooltip.Root>
    <Tooltip.Trigger
      data-testid="elt-kbd-legend"
      class="hidden items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
    >
      <Keyboard class="size-3.5" />
      {$t('system.entities.list.keyboardCommands')}
    </Tooltip.Trigger>
    <Tooltip.PriorityContent
      priority="HINT"
      title={$t('system.entities.list.keyboardCommands')}
      side="top"
      sideOffset={8}
      data-testid="elt-kbd-legend-panel"
    >
      <KeyboardHints
        tone="inverted"
        class="flex-col items-start gap-2 text-xs text-background"
        hints={[
          { keys: ['↑', '↓', '←', '→'], size: 'key-lg' as const, label: $t('system.entities.list.keys.move') },
          ...(rowSelectionEnabled
            ? [{ keys: ['Space'], size: 'modifier-lg' as const, label: $t('system.entities.list.keys.select') }]
            : []),
          { keys: ['Enter'], size: 'modifier-lg' as const, label: $t('system.entities.list.keys.actions') },
          ...(create_label_key ? [{ keys: ['Ins'], size: 'modifier-lg' as const, label: $t(create_label_key) }] : []),
          { keys: ['Esc'], size: 'modifier-lg' as const, label: $t('app.common.close') },
          { keys: [{ label: 'Pag.', glyph: '↑' }, { label: 'Pag.', glyph: '↓' }], size: 'modifier-lg' as const, label: $t('system.entities.list.keys.page') },
          { keys: [{ label: 'Home', glyph: '↖' }, { label: 'End', glyph: '↘' }], size: 'modifier-lg' as const, label: $t('system.entities.list.keys.firstLast') },
        ]}
      />
    </Tooltip.PriorityContent>
  </Tooltip.Root>
  {/snippet}

  <!-- Right side: Page size + Pagination controls -->
  <div class="flex items-center gap-2">
    <span class="text-muted-foreground">{$t('system.entities.list.pageSize')}</span>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button variant="ghost" size="sm" {...props}>
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
      <ButtonGroup segmented aria-label={$t('system.entities.list.pagination.firstPage')}>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={footerPage <= 1}
          onclick={() => {
            if (footerUsesClientPaging) clientSelectedPage = 1;
            else onPageChange(1);
          }}
          aria-label={$t('system.entities.list.pagination.firstPage')}
          title={$t('system.entities.list.pagination.firstPage')}
        >
          <ChevronsLeft class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={footerPage <= 1}
          onclick={() => {
            if (footerUsesClientPaging) clientSelectedPage = Math.max(1, clientSelectedPage - 1);
            else onPageChange(Math.max(1, page - 1));
          }}
          aria-label={$t('system.entities.list.pagination.previousPage')}
          title={$t('system.entities.list.pagination.previousPage')}
        >
          <ChevronLeft class="size-4" />
        </Button>
      </ButtonGroup>
      <div
        class="whitespace-nowrap px-0.5 text-center tabular-nums text-muted-foreground"
        data-testid="elt-pagination-status"
      >
        {$t('system.entities.list.paginationStatus')
          .replace('{page}', String(footerPage))
          .replace('{total}', String(footerTotalPages))}
      </div>
      <ButtonGroup segmented aria-label={$t('system.entities.list.pagination.nextPage')}>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={footerPage >= footerTotalPages}
          onclick={() => {
            if (footerUsesClientPaging) clientSelectedPage = Math.min(footerTotalPages, clientSelectedPage + 1);
            else onPageChange(Math.min(totalPages, page + 1));
          }}
          aria-label={$t('system.entities.list.pagination.nextPage')}
          title={$t('system.entities.list.pagination.nextPage')}
        >
          <ChevronRight class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={footerPage >= footerTotalPages}
          onclick={() => {
            if (footerUsesClientPaging) clientSelectedPage = footerTotalPages;
            else onPageChange(totalPages);
          }}
          aria-label={$t('system.entities.list.pagination.lastPage')}
          title={$t('system.entities.list.pagination.lastPage')}
        >
          <ChevronsRight class="size-4" />
        </Button>
      </ButtonGroup>
    </div>
  </div>
</Toolbar>
