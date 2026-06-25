<script lang="ts">
  import TableFooter from './TableFooter.svelte';

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
  }: EntityListTableFooterProps = $props();

  type EntityListTableFooterProps = {
    footerRangeTotal: number;
    footerRangeStart: number;
    footerRangeEnd: number;
    footerPage: number;
    footerTotalPages: number;
    footerUsesClientPaging: boolean;
    clientSelectedPage?: number;
    rowSelectionEnabled: boolean;
    selectionCount: number;
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;
    selectionPastParticipleKey: string;
    showSelectedOnly?: boolean;
    pageSize: number;
    pageSizeOptions: number[];
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  };
</script>

<TableFooter
  footerRangeTotal={footerRangeTotal}
  footerRangeStart={footerRangeStart}
  footerRangeEnd={footerRangeEnd}
  footerPage={footerPage}
  footerTotalPages={footerTotalPages}
  footerUsesClientPaging={footerUsesClientPaging}
  bind:clientSelectedPage={clientSelectedPage}
  rowSelectionEnabled={rowSelectionEnabled}
  selectionCount={selectionCount}
  selectionLabelKey={selectionLabelKey}
  selectionLabelSingularKey={selectionLabelSingularKey}
  selectionLabelText={selectionLabelText}
  selectionLabelSingularText={selectionLabelSingularText}
  selectionPastParticipleKey={selectionPastParticipleKey}
  bind:showSelectedOnly={showSelectedOnly}
  pageSize={pageSize}
  pageSizeOptions={pageSizeOptions}
  page={page}
  totalPages={totalPages}
  onPageChange={onPageChange}
  onPageSizeChange={onPageSizeChange}
/>
