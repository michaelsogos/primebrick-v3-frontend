<script lang="ts">
  /**
   * /system/emailsender/providers/[uuid] — module-owned REMOTE page
   * (provider edit form). First `kind:"detail"` remote leaf in the
   * platform: the record uuid reaches the chunk through
   * `ctx.components.params` — the host-injected plain-values channel.
   *
   * The route param is exposed as a LIVE getter, not a snapshot:
   * SvelteKit reuses this page across [uuid] → [uuid] navigations and
   * `page.params` mutates in place — the {#key} block remounts
   * RemotePageMount so the chunk re-reads the current uuid at mount time.
   */
  import { onMount } from 'svelte';
  import { page as appPage } from '$app/state';
  import { t } from '$lib/i18n';
  import { fetchModules, routesCensusFromModules, type CensusRoute } from '$lib/api';
  import RemotePageMount from '$lib/components/remote-page/RemotePageMount.svelte';
  import RemotePageErrorPanel from '$lib/components/remote-page/RemotePageErrorPanel.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { Button } from '@primebrick/ui';
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
    // Live params channel — evaluated each time the remote reads
    // ctx.components.params, never a mount-time snapshot.
    get params() {
      return appPage.params;
    },
  };

  async function resolveDecl() {
    resolve_error = null;
    try {
      const routes = routesCensusFromModules(await fetchModules());
      // The census carries the DECLARED route template — match the
      // literal `[uuid]` path, not the concrete URL.
      const found = routes.find(
        (r) => r.route === '/system/emailsender/providers/[uuid]' && r.component_url
      );
      if (found) {
        decl = found;
        return;
      }
      decl = null;
      resolve_error = {
        kind: 'contract',
        detail: 'route /system/emailsender/providers/[uuid] is not declared for remote delivery',
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
  <title>{$t('emailsender.providers.editProvider')} · Primebrick</title>
</svelte:head>

{#if decl}
  {#key appPage.params.uuid}
    <RemotePageMount {decl} {components} />
  {/key}
{:else if resolve_error}
  <RemotePageErrorPanel
    kind={resolve_error.kind}
    detail={resolve_error.detail}
    on_retry={() => void resolveDecl()}
  />
{:else}
  <div class="flex flex-1 flex-col gap-3 p-6" data-testid="providers-page-resolving" aria-busy="true">
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle class="size-4 animate-spin" />
      {$t('app.remote_page.loading')}
    </div>
    <Skeleton class="h-8 w-1/3" />
    <Skeleton class="h-4 w-full" />
    <Skeleton class="h-4 w-2/3" />
  </div>
{/if}
