<script lang="ts" generics="TRow extends Record<string, unknown>">
  /**
   * JobEntityTable — thin wrapper around EntityListTable that binds the
   * useEntityList state machine and renders the `run_stats_sparkline`
   * virtual column (fed by the job-run-stats action).
   */
  import { t } from '$lib/i18n';
  import { EntityListTable, TableCell } from '$lib/components/entity-list-table';
  import { isSnakeCaseSingular } from '$lib/entity-list';
  import RunStatsSparkline, { type RunStatsBucket } from './RunStatsSparkline.svelte';
  import type { EntityListState } from '$lib/composables/useEntityList.svelte';
  import type { Snippet } from 'svelte';

  /** Scalable UoM: 312ms → "312ms", 67000 → "1m 07s", 7.4e6 → "2h 03m". */
  function humanizeMs(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  }

  let {
    list,
    runStats,
    bucketUnit
  }: {
    list: EntityListState<TRow>;
    runStats?: Record<string, RunStatsBucket[]>;
    bucketUnit?: string;
  } = $props();

  // Local mirrors — EntityListTable two-way binds these for IANA datetime
  // mode; the list composable is the source of truth for reads.
  let datetimeIanaModeByKey = $state<Record<string, 'browser' | 'record'>>({});
  let datetimeIanaRenderTick = $state(0);
  $effect(() => { list.datetimeIanaModeByKey = datetimeIanaModeByKey; });
  $effect(() => { list.datetimeIanaRenderTick = datetimeIanaRenderTick; });

  const meta = $derived(list.meta);
</script>

{#if meta}
  <EntityListTable
    entity={meta.entity}
    translationKey={meta.translation_key && isSnakeCaseSingular(meta.translation_key) ? meta.translation_key : meta.entity}
    bind:datetimeIanaModeByKey
    bind:datetimeIanaRenderTick
    uid={meta.uid ?? 'uuid'}
    columnOrderStorageKey={list.columnOrderStorageKey}
    columns={list.columns}
    entityActions={meta.actions}
    rows={list.rows}
    total={list.total}
    metaLoading={list.metaLoading}
    rowsLoading={list.rowsLoading}
    error={list.error}
    page={list.page}
    pageSize={list.pageSize}
    onPageChange={list.onPageChange}
    onPageSizeChange={list.onPageSizeChange}
    search={list.search}
    onSearchInput={list.onSearchInput}
    searchInKeys={list.searchInKeys}
    onSearchInKeysChange={list.onSearchInKeysChange}
    sortKey={list.sortKey}
    sortDir={list.sortDir}
    onSortChange={list.onSortChange}
    visibleKeys={list.visibleKeys}
    onVisibleKeysChange={list.onVisibleKeysChange}
    onResetColumnVisibility={list.onResetColumnVisibility}
    selectedKeys={list.selectedKeys}
    onSelectedKeysChange={list.onSelectedKeysChange}
    defaultView={list.viewMode}
    defaultSort={meta.table?.default_sort}
    pageSizeOptions={meta.table?.page_size_options}
    filtersOpen={list.filtersOpen}
    filterValues={list.filterValues}
    advancedFilters={list.advancedFilters}
    onFilterValuesChange={list.onFilterValuesChange}
    onAdvancedFiltersChange={list.onAdvancedFiltersChange}
    onResetFilters={list.onResetFilters}
    onRefresh={() => void list.refreshRows()}
    selectionLabelSingularKey={`system.entities.${meta.translation_key}.singular`}
    selectionLabelKey={`system.entities.${meta.translation_key}.plural`}
  >
    {#snippet cell({ row, column }: { row: TRow; column: { key: string; type?: string } & Record<string, unknown> })}
      {#if column.type === 'run_stats_sparkline'}
        <RunStatsSparkline
          buckets={runStats?.[String(row.schedule_subject ?? '')]}
          {bucketUnit}
        />
      {:else if column.key === 'duration_ms'}
        {@const ms = Number(row.duration_ms ?? NaN)}
        <span class="min-w-0 truncate">{Number.isFinite(ms) ? humanizeMs(ms) : '—'}</span>
      {:else}
        <TableCell
          {row}
          column={column as never}
          {datetimeIanaModeByKey}
          {datetimeIanaRenderTick}
        />
      {/if}
    {/snippet}
  </EntityListTable>
{:else}
  <div class="text-muted-foreground py-8 text-center text-sm">
    {list.error ?? $t('app.common.loading')}
  </div>
{/if}
