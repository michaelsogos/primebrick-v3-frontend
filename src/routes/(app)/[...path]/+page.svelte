<script lang="ts">
  /**
   * (app) catch-all — dynamic realization of census-declared pages.
   *
   * Static routes always win over `[...path]`, so this page only ever
   * mounts: (a) REMOTE pages — module-owned `component_url` decls resolved
   * by `resolvePageForPath` and mounted through `RemotePageMount`;
   * (b) ARCHETYPE pages — host-rendered entity forms (`EntityFormPage`);
   * and (c) the shared error surfaces. Redirects (bare prefixes, part_of
   * roots) and denied/not-found paths are settled here, client-side.
   *
   * Resolution runs in the component (see `resolve()`), NOT in `load()` —
   * an enqueued-by-session-expiry request inside `load()` deadlocks the
   * entire mount (the SessionExpiredDialog itself could never render).
   *
   * `ctx.components.params` carries the decl-template `[name]` params —
   * the live channel remote chunks read (emailsender `[uuid]` precedent).
   */
  import { page as appPage } from '$app/state';
  import { goto } from '$app/navigation';
  import { error } from '@sveltejs/kit';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { fetchModules } from '$lib/api';
  import type { ModuleInfo } from '$lib/api-types';
  import RemotePageMount from '$lib/components/remote-page/RemotePageMount.svelte';
  import EntityFormPage from '$lib/entity-form/EntityFormPage.svelte';
  import RemotePageErrorPanel from '$lib/components/remote-page/RemotePageErrorPanel.svelte';
  import { Button } from '@primebrick/ui';
  import { resolvePageForPath, type ResolvedPage } from '$lib/navigation/page-resolver';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { LoaderCircle } from '@primebrick/ui/vendor/lucide';

  // The route matches every dynamic path — the same component instance is
  // reused across navigations, so resolution is driven by an $effect on
  // the pathname. `resolved === null` = resolution in flight (skeleton).
  let resolved = $state<ResolvedPage | null>(null);
  let modules = $state<ModuleInfo[]>([]);
  let gen = 0;

  // Runs the same resolution the old load() used — fresh census fetch,
  // fresh sha256 → the rebuild-remount path the loader guarantees. When
  // fetchModules is enqueued by the session-expired flow the await simply
  // stays pending behind the dialog; the drain retries it after re-login.
  async function resolve() {
    const g = ++gen;
    try {
      const fetched = (await fetchModules(get(uiLang))).modules;
      if (g !== gen) return;
      modules = fetched;
      const r = resolvePageForPath(appPage.url.pathname, modules);
      if (r.kind === 'redirect') {
        void goto(r.href, { replaceState: true });
        return;
      }
      resolved = r;
    } catch (e) {
      if (g !== gen) return;
      resolved = {
        kind: 'error',
        error_kind: 'network',
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }

  $effect(() => {
    // Tracking the pathname re-runs resolution on every navigation to a
    // catch-all path (including the initial mount).
    void appPage.url.pathname;
    resolved = null;
    void resolve();
  });

  // denied/not-found map to the SvelteKit error boundary — `error()` must
  // be thrown synchronously in the component lifecycle, not inside the
  // async resolver (a promise rejection would bypass +error.svelte).
  $effect(() => {
    if (resolved?.kind === 'denied') error(403, `Access denied — ${resolved.detail}`);
    if (resolved?.kind === 'not-found')
      error(404, `The page '${appPage.url.pathname}' does not exist`);
  });

  const components: Record<string, unknown> = {
    Button,
    // Live params channel — evaluated each time the remote reads
    // ctx.components.params, never a mount-time snapshot.
    get params() {
      return resolved?.kind === 'remote' ? resolved.params : {};
    },
  };
</script>

<svelte:head>
  {#if resolved?.kind === 'remote' && resolved.decl.chrome === 'remote' && resolved.decl.label_key}
    <title>{$t(resolved.decl.label_key)} · Primebrick</title>
  {/if}
</svelte:head>

{#if resolved?.kind === 'remote'}
  {#key appPage.url.pathname}
    <RemotePageMount decl={resolved.decl} {components} />
  {/key}
{:else if resolved?.kind === 'archetype'}
  {#key appPage.url.pathname}
    <EntityFormPage decl={resolved.decl} {modules} />
  {/key}
{:else if resolved?.kind === 'error'}
  <RemotePageErrorPanel
    kind={resolved.error_kind}
    detail={resolved.detail}
    on_retry={() => void resolve()}
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
