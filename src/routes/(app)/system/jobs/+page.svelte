<script lang="ts">
  /**
   * /system/jobs — module-owned page (remote pilot).
   *
   * The job service ships its own page UI as a precompiled ESM chunk; this
   * route only resolves the route declaration from the routes census and
   * mounts it via `RemotePageMount`, passing the host-coupled surface the
   * remote cannot self-render:
   *
   *   components.EntityListTable / AppPageScaffold / AppPageBreadcrumb
   *     → big host trees, mounted via ctx.mount_host (separate Svelte roots)
   *   components.default_cell / host_button
   *     → leaf host snippets, {@render}ed inline by the remote
   *   components.settingsTabMenuSegment / onConnectivityRestored
   *     → host-state-bound plain functions
   *
   * Resolution failures render an in-content error panel — the shell stays.
   */
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { fetchRoutesCensus, type CensusRoute } from '$lib/api';
  import RemotePageMount from '$lib/components/remote-page/RemotePageMount.svelte';
  import RemotePageErrorPanel from '$lib/components/remote-page/RemotePageErrorPanel.svelte';
  import { EntityListTable, TableCell } from '$lib/components/entity-list-table';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { Button } from '$lib/components/ui/button';
  import type { ButtonSize, ButtonVariant } from '$lib/components/ui/button';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { onConnectivityRestored } from '$lib/app-connectivity-events';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import type { CellArgs } from '$lib/components/entity-list-table/types';

  type ResolveError = { kind: 'network' | 'contract'; detail: string | null };

  let decl = $state<CensusRoute | null>(null);
  let resolve_error = $state<ResolveError | null>(null);

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
  <RemotePageMount
    {decl}
    components={{
      EntityListTable,
      AppPageScaffold,
      AppPageBreadcrumb,
      settingsTabMenuSegment,
      onConnectivityRestored,
      default_cell: defaultCell,
      host_button: hostButton,
    }}
  />
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

<!-- Standard cell fallback for remote `cell` overrides — renders the host
     TableCell with the table's live IANA datetime state forwarded via
     CellArgs (see entity-list-table/types.ts). -->
{#snippet defaultCell({
  row,
  column,
  datetimeIanaModeByKey,
  datetimeIanaRenderTick,
}: CellArgs<Record<string, unknown>>)}
  <TableCell
    {row}
    {column}
    datetimeIanaModeByKey={datetimeIanaModeByKey ?? {}}
    datetimeIanaRenderTick={datetimeIanaRenderTick ?? 0}
  />
{/snippet}

<!-- Host button leaf — keeps module CTAs visually identical to app chrome. -->
{#snippet hostButton(args: {
  label: string;
  onclick: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
})}
  <Button
    variant={args.variant ?? 'default'}
    size={args.size ?? 'sm'}
    disabled={args.disabled ?? false}
    onclick={args.onclick}
  >
    {args.label}
  </Button>
{/snippet}
