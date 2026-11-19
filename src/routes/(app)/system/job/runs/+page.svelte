<script lang="ts">
  /**
   * /system/job/runs — job_run list, HOST-rendered EntityTablePage (standard
   * archetype). Declared by the job service's `endpoints.nav` census
   * (`kind:"list"`, `entity:"job_run"`); api_base resolves via
   * the /api/v1/modules census → /svc/job.
   *
   * `duration_ms` is humanized via the page-level `cell` override;
   * `error_code` keeps its badge anatomy but becomes the affordance into
   * the module's `job.runDetail` remote sheet (the only surface that
   * renders `error_detail` — the column itself stays hidden). Every
   * other column defers to the standard <TableCell>.
   */
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import { TableCell } from '$lib/components/entity-list-table';
  import { entityApiBase } from '$lib/api';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import type { CellArgs } from '$lib/components/entity-list-table/types';

  /** Scalable UoM for `duration_ms` values. */
  function humanizeMs(value: unknown): string {
    const ms = Number(value ?? NaN);
    if (!Number.isFinite(ms)) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  }
</script>

<EntityTablePage
  basePath={entityApiBase('job_run')}
  storageKeyPrefix="pb:jobs:runs:"
  errorScopeKey="app.common.errors.scope.jobsList"
  errorScopeKeyInit="app.common.errors.scope.jobsPageInit"
  deletionFilter={false}
  cell={jobsCell}
>
</EntityTablePage>

{#snippet jobsCell(args: CellArgs<Record<string, unknown>>)}
  {#if args.column.key === 'duration_ms'}
    <span class="min-w-0 truncate">{humanizeMs(args.row.duration_ms)}</span>
  {:else if args.column.key === 'error_code' && args.row.error_code}
    <button
      type="button"
      class="cursor-pointer rounded-sm outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-ring"
      onclick={() => openSheet('job.runDetail', { run_uuid: args.row.uuid })}
    >
      <TableCell
        row={args.row}
        column={args.column}
        datetimeIanaModeByKey={args.datetimeIanaModeByKey ?? {}}
        sparklineData={args.sparklineData}
      />
    </button>
  {:else}
    <TableCell
      row={args.row}
      column={args.column}
      datetimeIanaModeByKey={args.datetimeIanaModeByKey ?? {}}
      sparklineData={args.sparklineData}
    />
  {/if}
{/snippet}
