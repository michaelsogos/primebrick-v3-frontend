<script lang="ts">
  /**
   * (app) catch-all — dynamic realization of census-declared pages.
   *
   * Static routes always win over `[...path]`, so this page only ever
   * mounts: (a) REMOTE pages — module-owned `component_url` decls resolved
   * by `resolvePageForPath` and mounted through `RemotePageMount`; and
   * (b) the shared error surfaces. Redirects (bare prefixes, part_of
   * roots) and denied/not-found paths are settled in `+page.ts` load.
   *
   * `ctx.components.params` carries the decl-template `[name]` params —
   * the live channel remote chunks read (emailsender `[uuid]` precedent).
   */
  import { page as appPage } from '$app/state';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { fetchModules } from '$lib/api';
  import RemotePageMount from '$lib/components/remote-page/RemotePageMount.svelte';
  import EntityFormPage from '$lib/entity-form/EntityFormPage.svelte';
  import RemotePageErrorPanel from '$lib/components/remote-page/RemotePageErrorPanel.svelte';
  import { Button } from '@primebrick/ui';
  import { resolvePageForPath, type ResolvedPage } from '$lib/navigation/page-resolver';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { LoaderCircle } from '@primebrick/ui/vendor/lucide';

  let { data } = $props();

  // The route matches every dynamic path — the same component instance is
  // reused across navigations, so resolution derives from `data` (load
  // output, re-run per navigation); `retry_resolved` is the local retry
  // override, reset whenever the pathname changes.
  let retry_resolved = $state<ResolvedPage | null>(null);
  const resolved = $derived(retry_resolved ?? data.resolved);

  $effect(() => {
    // Reading pathname here is the tracking — the effect re-runs on every
    // navigation and drops the retry override so the fresh `data` wins.
    if (appPage.url.pathname) {
      retry_resolved = null;
    }
  });

  const components: Record<string, unknown> = {
    Button,
    // Live params channel — evaluated each time the remote reads
    // ctx.components.params, never a mount-time snapshot.
    get params() {
      return resolved.kind === 'remote' ? resolved.params : {};
    },
  };

  // Retry re-runs the same resolution the load used — fresh census fetch,
  // fresh sha256 → the rebuild-remount path the loader guarantees.
  async function retry() {
    try {
      retry_resolved = resolvePageForPath(
        appPage.url.pathname,
        (await fetchModules(get(uiLang))).modules,
      );
    } catch (e) {
      retry_resolved = {
        kind: 'error',
        error_kind: 'network',
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }
</script>

<svelte:head>
  {#if resolved.kind === 'remote' && resolved.decl.chrome === 'remote' && resolved.decl.label_key}
    <title>{$t(resolved.decl.label_key)} · Primebrick</title>
  {/if}
</svelte:head>

{#if resolved.kind === 'remote'}
  {#key appPage.url.pathname}
    <RemotePageMount decl={resolved.decl} {components} />
  {/key}
{:else if resolved.kind === 'archetype'}
  {#key appPage.url.pathname}
    <EntityFormPage decl={resolved.decl} modules={data.modules} />
  {/key}
{:else if resolved.kind === 'error'}
  <RemotePageErrorPanel
    kind={resolved.error_kind}
    detail={resolved.detail}
    on_retry={() => void retry()}
  />
{:else}
  <div class="flex flex-1 flex-col gap-3 p-6" data-testid="catchall-page-resolving" aria-busy="true">
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle class="size-4 animate-spin" />
      {$t('app.remote_page.loading')}
    </div>
    <Skeleton class="h-8 w-1/3" />
    <Skeleton class="h-4 w-full" />
    <Skeleton class="h-4 w-2/3" />
  </div>
{/if}
