<script lang="ts">
  import { t } from '$lib/i18n';
  import { Toolbar, KeyboardHints, Tooltip } from '@primebrick/ui';
  import { SelectionCounter } from '../toolbar';
  import PaginationControls from './PaginationControls.svelte';
  import RangeLabel from './RangeLabel.svelte';
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
    <RangeLabel start={footerRangeStart} end={footerRangeEnd} total={footerRangeTotal} />
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
      {$t('system.entities.list.keyboard_commands')}
    </Tooltip.Trigger>
    <Tooltip.PriorityContent
      priority="HINT"
      title={$t('system.entities.list.keyboard_commands')}
      side="top"
      sideOffset={8}
      data-testid="elt-kbd-legend-panel"
    >
      <KeyboardHints
        tone="inverted"
        layout="median"
        class="flex-col items-stretch gap-2 text-xs text-background min-w-56"
        hints={[
          { keys: ['↑', '↓', '←', '→'], size: 'key-lg' as const, label: $t('system.entities.list.keys.move') },
          ...(rowSelectionEnabled
            ? [{ keys: ['Space'], size: 'modifier-lg' as const, label: $t('system.entities.list.keys.select') }]
            : []),
          { keys: ['Enter'], size: 'modifier-lg' as const, label: $t('system.entities.list.keys.actions') },
          ...(create_label_key ? [{ keys: ['Ins'], size: 'modifier-lg' as const, label: $t(create_label_key) }] : []),
          { keys: ['Esc'], size: 'modifier-lg' as const, label: $t('app.common.close') },
          { keys: [{ label: 'Pag.', glyph: '↑' }, { label: 'Pag.', glyph: '↓' }], size: 'modifier-lg' as const, label: $t('system.entities.list.keys.page') },
          { keys: [{ label: 'Home', glyph: '↖' }, { label: 'End', glyph: '↘' }], size: 'modifier-lg' as const, label: $t('system.entities.list.keys.first_last') },
        ]}
      />
    </Tooltip.PriorityContent>
  </Tooltip.Root>
  {/snippet}

  <!-- Right side: the shared pager cluster — `onPageChange` resolves the
       client-vs-server route once (selected-rows client paging vs server
       paging), the control itself stays branch-free. -->
  <PaginationControls
    page={footerPage}
    totalPages={footerTotalPages}
    pageSize={pageSize}
    pageSizeOptions={pageSizeOptions}
    onPageChange={(p) => {
      if (footerUsesClientPaging) clientSelectedPage = p;
      else onPageChange(p);
    }}
    onPageSizeChange={onPageSizeChange}
    test_id_prefix="elt"
  />
</Toolbar>
