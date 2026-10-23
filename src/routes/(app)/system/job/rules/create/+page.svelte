<script lang="ts">
  /**
   * /system/job/rules/create — module-owned REMOTE page (rule creation form).
   *
   * Same esm-mount contract as /system/job/job-schedules/create: the job service ships this page's
   * UI inside its precompiled chunk (mountPage dispatches on ctx.nav.route);
   * the route resolves the declaration from the routes census and mounts it
   * via RemotePageMount. The list page it belongs to (/system/job/rules) is a
   * host-rendered EntityTablePage archetype declared kind:"list".
   *
   * components.AppPageBreadcrumb / Button / moduleBreadcrumbSegments → host surface
   * mounted as separate roots via ctx.mount_host. NO snippets cross the
   * bundle boundary. Resolution failures render an in-content error panel.
   */
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { fetchModules, routesCensusFromModules, type CensusRoute } from '$lib/api';
  import RemotePageMount from '$lib/components/remote-page/RemotePageMount.svelte';
  import RemotePageErrorPanel from '$lib/components/remote-page/RemotePageErrorPanel.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { Button } from '$lib/components/ui/button';
  import { moduleBreadcrumbSegments } from '$lib/breadcrumb/module-breadcrumb';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { LoaderCircle } from '@primebrick/ui/vendor/lucide';

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
      const routes = routesCensusFromModules(await fetchModules());
      const found = routes.find(
        (r) => r.route === '/system/job/rules/create' && r.component_url
      );
      if (found) {
        decl = found;
        return;
      }
      decl = null;
      resolve_error = {
        kind: 'contract',
        detail: 'route /system/job/rules/create is not declared for remote delivery',
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
  <title>{$t('job.jobs.ruleForm.title')} · Primebrick</title>
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
