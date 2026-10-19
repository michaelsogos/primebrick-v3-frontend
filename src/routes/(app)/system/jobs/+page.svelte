<script lang="ts">
  /**
   * /system/jobs — module-owned page (remote pilot).
   *
   * The job service ships its own page UI as a precompiled ESM chunk; this
   * route only resolves the route declaration from the routes census and
   * mounts it via `RemotePageMount`, passing the host-coupled surface the
   * remote cannot self-render:
   *
   *   components.EntityListTable / AppPageBreadcrumb / Button
   *     → host components, mounted as separate roots via ctx.mount_host
   *   components.jobs_cell
   *     → a HOST snippet forwarded as EntityListTable's `cell` override; it
   *       runs inside host render so it may compose host components — it
   *       routes `run_stats_sparkline` to <RemoteMountSlot> (the remote
   *       mounts its own root via components.remote.cell_mount), humanizes
   *       `duration_ms`, and defers everything else to <TableCell>
   *   components.settingsTabMenuSegment / onConnectivityRestored
   *     → host-state-bound plain functions
   *
   * NO snippets cross the bundle boundary — a snippet invoked under the
   * other bundle's render reads its own `active_effect` (null) and dies;
   * separate roots are the only safe primitive. Resolution failures render
   * an in-content error panel — the shell stays.
   */
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { fetchRoutesCensus, type CensusRoute } from '$lib/api';
  import RemotePageMount from '$lib/components/remote-page/RemotePageMount.svelte';
  import RemotePageErrorPanel from '$lib/components/remote-page/RemotePageErrorPanel.svelte';
  import RemoteMountSlot from '$lib/components/remote-page/RemoteMountSlot.svelte';
  import { EntityListTable, TableCell } from '$lib/components/entity-list-table';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { Button } from '$lib/components/ui/button';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { onConnectivityRestored } from '$lib/app-connectivity-events';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import type { CellArgs } from '$lib/components/entity-list-table/types';

  type ResolveError = { kind: 'network' | 'contract'; detail: string | null };

  let decl = $state<CensusRoute | null>(null);
  let resolve_error = $state<ResolveError | null>(null);

  // Shim-owned components map — RemotePageMount adds `remote` (the loaded
  // module namespace) to this object after the chunk resolves; the jobs_cell
  // snippet reads `components.remote.cell_mount` lazily at render time.
  const components: Record<string, unknown> = {
    EntityListTable,
    AppPageBreadcrumb,
    Button,
    settingsTabMenuSegment,
    onConnectivityRestored,
    jobs_cell: jobsCell,
  };

  /** Scalable UoM for `duration_ms` — mirrors the remote's formatter. */
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

  async function resolveDecl() {
    resolve_error = null;
    try {
      const routes = await fetchRoutesCensus();
      const found = routes.find((r) => r.route === '/system/jobs' && r.component_url);
      if (found) {
        decl = found;
        return;
      }
      decl = null;
      resolve_error = {
        kind: 'contract',
        detail: 'route /system/jobs is not declared for remote delivery',
      };
    } catch (e) {
      decl = null;
      resolve_error = {
        kind: 'network',
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }

  onMount(() => {
    void resolveDecl();
  });
</script>

<svelte:head>
  <title>{$t('system.jobs.title')} · Primebrick</title>
</svelte:head>

{#if decl}
  <RemotePageMount {decl} {components} />
{:else if resolve_error}
  <RemotePageErrorPanel
    kind={resolve_error.kind}
    detail={resolve_error.detail}
    on_retry={() => void resolveDecl()}
  />
{:else}
  <div class="flex flex-1 flex-col gap-3 p-6" data-testid="jobs-page-resolving" aria-busy="true">
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle class="size-4 animate-spin" />
      {$t('app.remote_page.loading')}
    </div>
    <Skeleton class="h-8 w-1/3" />
    <Skeleton class="h-4 w-full" />
    <Skeleton class="h-4 w-2/3" />
  </div>
{/if}

<!-- EntityListTable `cell` override — a HOST snippet (safe: invoked under
     the host table's render). Module-owned cell types route to the remote
     through RemoteMountSlot; everything else is the standard host cell. -->
{#snippet jobsCell(args: CellArgs<Record<string, unknown>>)}
  {#if args.column.type === 'run_stats_sparkline'}
    <RemoteMountSlot
      mount_fn={(components.remote as { cell_mount?: (el: HTMLElement, a: Record<string, unknown>) => unknown } | undefined)?.cell_mount}
      args={{ row: args.row, column: args.column }}
    >
      {#snippet fallback()}
        <TableCell
          row={args.row}
          column={args.column}
          datetimeIanaModeByKey={args.datetimeIanaModeByKey ?? {}}
          datetimeIanaRenderTick={args.datetimeIanaRenderTick ?? 0}
        />
      {/snippet}
    </RemoteMountSlot>
  {:else if args.column.key === 'duration_ms'}
    <span class="min-w-0 truncate">{humanizeMs(args.row.duration_ms)}</span>
  {:else}
    <TableCell
      row={args.row}
      column={args.column}
      datetimeIanaModeByKey={args.datetimeIanaModeByKey ?? {}}
      datetimeIanaRenderTick={args.datetimeIanaRenderTick ?? 0}
    />
  {/if}
{/snippet}
