<script lang="ts">
  /**
   * /system/ai/console — module-owned REMOTE page (the AI console).
   *
   * Same mount contract as /system/ai/docs-index — the ai-pages chunk
   * dispatches on ctx.nav.route. The module ROOT /system/ai is a
   * namespace, never a page: the root shim redirects here because
   * `console` is the declared `default` leaf.
   */
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { fetchModules, routesCensusFromModules, type CensusRoute } from '$lib/api';
  import RemotePageMount from '$lib/components/remote-page/RemotePageMount.svelte';
  import RemotePageErrorPanel from '$lib/components/remote-page/RemotePageErrorPanel.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { moduleBreadcrumbSegments } from '$lib/breadcrumb/module-breadcrumb';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { LoaderCircle } from '@primebrick/ui/vendor/lucide';

  type ResolveError = { kind: 'network' | 'contract'; detail: string | null };

  let decl = $state<CensusRoute | null>(null);
  let resolve_error = $state<ResolveError | null>(null);

  const components: Record<string, unknown> = {
    AppPageBreadcrumb,
    moduleBreadcrumbSegments,
  };

  async function resolveDecl() {
    resolve_error = null;
    try {
      const routes = routesCensusFromModules(await fetchModules());
      const found = routes.find(
        (r) => r.route === '/system/ai/console' && r.component_url
      );
      if (found) {
        decl = found;
        return;
      }
      decl = null;
      resolve_error = {
        kind: 'contract',
        detail: 'route /system/ai/console is not declared for remote delivery',
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
  <title>{$t('ai.console.title')} · Primebrick</title>
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
  <div class="flex flex-1 flex-col gap-3 p-6" data-testid="ai-console-page-resolving" aria-busy="true">
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle class="size-4 animate-spin" />
      {$t('app.remote_page.loading')}
    </div>
    <Skeleton class="h-8 w-1/3" />
    <Skeleton class="h-4 w-full" />
    <Skeleton class="h-4 w-2/3" />
  </div>
{/if}
