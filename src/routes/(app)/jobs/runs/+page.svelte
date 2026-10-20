<script lang="ts">
  /**
   * /jobs/runs — job_run list, HOST-rendered EntityTablePage (standard
   * archetype). Declared by the job service's `endpoints.nav` census
   * (`kind:"list"`, `entity:"job_run"`); api_base resolves via
   * ENTITY_SERVICE_MAP → /ws/job.
   *
   * `duration_ms` is humanized via the page-level `cell` override; every
   * other column defers to the standard <TableCell>.
   */
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { moduleMenuSegment } from '$lib/breadcrumb/module-breadcrumb';
  import { TableCell } from '$lib/components/entity-list-table';
  import { page as appPage } from '$app/state';
  import { t } from '$lib/i18n';
  import { entityApiBase } from '$lib/api';
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
  {#snippet breadcrumb()}
    <AppPageBreadcrumb
      segments={[
        moduleMenuSegment({
          pathname: appPage.url.pathname,
          t: (key) => $t(key)
        })
      ]}
    />
  {/snippet}
</EntityTablePage>

{#snippet jobsCell(args: CellArgs<Record<string, unknown>>)}
  {#if args.column.key === 'duration_ms'}
    <span class="min-w-0 truncate">{humanizeMs(args.row.duration_ms)}</span>
  {:else}
    <TableCell
      row={args.row}
      column={args.column}
      datetimeIanaModeByKey={args.datetimeIanaModeByKey ?? {}}
      datetimeIanaRenderTick={args.datetimeIanaRenderTick ?? 0}
      sparklineData={args.sparklineData}
    />
  {/if}
{/snippet}
