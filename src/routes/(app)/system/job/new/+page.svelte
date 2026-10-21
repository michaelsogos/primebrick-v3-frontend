<script lang="ts">
  /**
   * /system/job/new — module-owned REMOTE page (manual schedule creation).
   *
   * The job service ships this page's UI as a precompiled ESM chunk; the
   * route only resolves the declaration from the routes census and mounts
   * it via RemotePageMount. It's the module's one custom surface — the
   * list pages (/system/job, /system/job/runs, /system/job/rules) are host-rendered
   * EntityTablePage archetypes declared kind:"list" by the same service.
   *
   * components.AppPageBreadcrumb / Button / moduleBreadcrumbSegments /
   * moduleBreadcrumbSegments → host surface mounted as separate roots via
   * ctx.mount_host. NO snippets cross the bundle boundary.
   * Resolution failures render an in-content error panel — the shell stays.
   */
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { fetchRoutesCensus, type CensusRoute } from '$lib/api';
  import RemotePageMount from '$lib/components/remote-page/RemotePageMount.svelte';
  import RemotePageErrorPanel from '$lib/components/remote-page/RemotePageErrorPanel.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { Button } from '$lib/components/ui/button';
  import { moduleBreadcrumbSegments } from '$lib/breadcrumb/module-breadcrumb';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';

  type ResolveError = { kind: 'network' | 'contract'; detail: string | null };

  let decl = $state<CensusRoute | null>(null);
  let resolve_error = $state<ResolveError | null>(null);

  const components: Record<string, unknown> = {
    AppPageBreadcrumb,
    Button,
    moduleBreadcrumbSegments,
  };

  async function resolveDecl() {
    resolve_error = null;
    try {
      const routes = await fetchRoutesCensus();
      const found = routes.find((r) => r.route === '/system/job/new' && r.component_url);
      if (found) {
        decl = found;
        return;
      }
      decl = null;
      resolve_error = {
        kind: 'contract',
        detail: 'route /system/job/new is not declared for remote delivery',
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
  <title>{$t('job.jobs.scheduleDialog.title')} · Primebrick</title>
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
