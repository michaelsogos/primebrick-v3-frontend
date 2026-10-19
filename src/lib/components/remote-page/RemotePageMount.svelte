<script lang="ts">
  /**
   * RemotePageMount — mounts a module-owned page delivered as a precompiled
   * ESM chunk (`component_format: 'esm-mount'`).
   *
   * The host shell is NEVER torn down: every failure mode (service offline,
   * asset 404/400, integrity mismatch, mount throw) renders a localized
   * in-content error panel with a retry action, while header/sidebar/nav keep
   * working. The remote chunk is self-contained (bundles its own svelte +
   * `@primebrick/ui`) and receives a plain-values `ModulePageHost` ctx.
   */
  import { mount, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import { Button } from '$lib/components/ui/button';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import type { EntityMeta, ModulePageHost, PageRouteDeclaration } from '@primebrick/ui';
  import {
    RemoteLoadError,
    deriveStylesheetUrl,
    disposeMounted,
    ensureStylesheet,
    loadRemoteModule,
    parseWsServiceCode,
    resolveMountable,
    type RemoteErrorKind,
  } from './remote-loader';

  let {
    decl,
    meta = undefined,
    components = undefined,
    service = undefined,
    css_url = undefined,
    loader = loadRemoteModule,
  }: {
    /** This page's route declaration — carries component_url/integrity. */
    decl: PageRouteDeclaration;
    /** Entity metadata when the route is entity-bound. */
    meta?: EntityMeta;
    /** Optional host-coupled components (plain values only — no rune state). */
    components?: Record<string, unknown>;
    /** Owning service code; derived from `/ws/<code>/` when omitted. */
    service?: string;
    /** Stylesheet override; defaults to `<component_url>` with .css extension. */
    css_url?: string;
    /** Loader override — tests inject fakes. */
    loader?: typeof loadRemoteModule;
  } = $props();

  type Phase = 'loading' | 'mounted' | 'error';

  let phase = $state<Phase>('loading');
  let error_kind = $state<RemoteErrorKind | null>(null);
  let error_status = $state<number | null>(null);
  let error_detail = $state<string | null>(null);
  let mountEl = $state<HTMLDivElement>();
  let mounted: unknown = null;
  // Stale-load guard — an older in-flight load must never touch state once a
  // newer attempt (retry / url change / destroy) has started.
  let generation = 0;

  const service_code = $derived(
    service ?? (decl.component_url ? parseWsServiceCode(decl.component_url) : undefined),
  );

  function buildCtx(): ModulePageHost {
    const base = service_code ? `/ws/${service_code}` : '';
    return {
      host_version: 1,
      nav: decl,
      ...(meta ? { meta } : {}),
      api: (path, init) =>
        apiFetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, init),
      // Evaluated per call — locale switches propagate without remounting.
      i18n: {
        t: (key, params) => get(t)(key, params),
        get locale() {
          return get(uiLang);
        },
      },
      notify: (input) => {
        pushNotification(input);
      },
      ...(components ? { components } : {}),
    };
  }

  function setError(kind: RemoteErrorKind, status: number | null, detail: string) {
    phase = 'error';
    error_kind = kind;
    error_status = status;
    error_detail = detail;
  }

  async function load() {
    const gen = ++generation;
    const url = decl.component_url;
    if (mounted != null) {
      const prev = mounted;
      mounted = null;
      await disposeMounted(prev).catch(() => undefined);
    }
    mountEl?.replaceChildren();
    if (!url) {
      setError('contract', null, 'route declaration has no component_url');
      return;
    }
    phase = 'loading';
    error_kind = null;
    error_status = null;
    error_detail = null;

    // CSS first — stylesheet and JS fetch in parallel, page never unstyled.
    ensureStylesheet(css_url ?? deriveStylesheetUrl(url));

    try {
      const { mod, dispose_source } = await loader(url, decl.integrity);
      if (gen !== generation) {
        dispose_source?.();
        return;
      }
      try {
        const mode = resolveMountable(mod);
        if (!mode) {
          throw new RemoteLoadError(
            'contract',
            'module exposes neither mountPage() nor a default component export',
          );
        }
        const el = mountEl;
        if (!el) throw new RemoteLoadError('mount', 'mount target not mounted');
        const ctx = buildCtx();
        mounted =
          mode === 'mountPage'
            ? await mod.mountPage!(el, ctx)
            : mount(mod.default as Parameters<typeof mount>[0], {
                target: el,
                props: { ctx },
              });
        dispose_source?.();
      } catch (e) {
        dispose_source?.();
        throw e instanceof RemoteLoadError
          ? e
          : new RemoteLoadError('mount', e instanceof Error ? e.message : String(e));
      }
      if (gen !== generation) {
        const stale = mounted;
        mounted = null;
        await disposeMounted(stale).catch(() => undefined);
        return;
      }
      phase = 'mounted';
    } catch (e) {
      if (gen !== generation) return;
      if (e instanceof RemoteLoadError) {
        setError(e.kind, e.status ?? null, e.message);
      } else {
        setError('mount', null, e instanceof Error ? e.message : String(e));
      }
    }
  }

  $effect(() => {
    // Re-resolve whenever the declaration's URL changes (remote pages are
    // keyed per-route, but the same component instance can outlive a nav hop).
    void decl.component_url;
    void load();
  });

  onMount(() => {
    return () => {
      generation++;
      const prev = mounted;
      mounted = null;
      if (prev != null) void disposeMounted(prev).catch(() => undefined);
    };
  });
</script>

<div class="flex min-h-0 flex-1 flex-col" data-testid="remote-page-mount">
  {#if phase === 'error'}
    <div
      class="flex flex-1 flex-col items-center justify-center p-6"
      data-testid="remote-page-error"
      data-error-kind={error_kind}
    >
      <div class="mx-4 flex max-w-lg flex-col items-center text-center">
        {#if error_kind === 'network'}
          <CloudOff class="size-10 text-muted-foreground/60" />
        {:else}
          <TriangleAlert class="size-10 text-muted-foreground/60" />
        {/if}
        <h2 class="mt-4 text-base font-normal" data-testid="remote-page-error-title">
          {$t('app.remote_page.error.title')}
        </h2>
        <p class="mt-2 text-sm text-muted-foreground" data-testid="remote-page-error-message">
          {$t(`app.remote_page.error.${error_kind}`)}
        </p>
        <p class="mt-3 font-mono text-xs text-muted-foreground/70" data-testid="remote-page-error-detail">
          {#if error_status != null}HTTP {error_status} — {/if}{error_detail}
        </p>
        <Button
          variant="outline"
          size="sm"
          class="mt-6"
          data-testid="remote-page-retry"
          onclick={() => void load()}
        >
          <RefreshCw class="size-3.5" />
          {$t('app.remote_page.retry')}
        </Button>
      </div>
    </div>
  {:else if phase === 'loading'}
    <div
      class="flex flex-1 flex-col gap-3 p-6"
      data-testid="remote-page-loading"
      aria-busy="true"
    >
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle class="size-4 animate-spin" />
        {$t('app.remote_page.loading')}
      </div>
      <Skeleton class="h-8 w-1/3" />
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-2/3" />
    </div>
  {/if}
  <!-- Always in the DOM so mountEl binds before the first import() resolves.
       Hidden (not destroyed) while loading/error overlays are up. -->
  <div
    bind:this={mountEl}
    class="min-h-0 flex-1 flex-col"
    class:flex={phase === 'mounted'}
    class:hidden={phase !== 'mounted'}
    data-testid="remote-page-content"
  ></div>
</div>
