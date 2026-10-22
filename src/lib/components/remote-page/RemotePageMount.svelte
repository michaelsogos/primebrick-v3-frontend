<script lang="ts">
  /**
   * RemotePageMount — mounts a module-owned page delivered as a precompiled
   * ESM chunk (`component_format: 'esm-mount'`).
   *
   * The host shell is NEVER torn down: every failure mode (service offline,
   * asset 404/400, integrity mismatch, mount throw) renders a localized
   * in-content error panel with a retry action, while header/sidebar/nav keep
   * working. The remote chunk emits bare imports for the closed vendor list
   * (resolved via the document import map to `/vendor/*.js`) — the loader
   * verifies the chunk's `vendor_requires` against `vendor-manifest.json`
   * before importing. It receives a plain-values `ModulePageHost` ctx.
   */
  import { mount, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { useMfaStepUp } from '$lib/composables/useMfaStepUp.svelte';
  import MfaStepUpDialog from '$lib/components/auth/MfaStepUpDialog.svelte';
  import RemotePageErrorPanel from './RemotePageErrorPanel.svelte';
  import PageSectionSlot from './PageSectionSlot.svelte';
  import { buildHostComponents } from './host-bridges';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import type { EntityMeta, ModulePageHost, PageRouteDeclaration } from '@primebrick/ui';
  import {
    RemoteLoadError,
    deriveStylesheetUrl,
    disposeMounted,
    ensureStylesheet,
    loadRemoteModule,
    mountHostComponent,
    parseWsServiceCode,
    resolveMountable,
    type RemoteErrorKind,
    type RemoteModule,
  } from './remote-loader';
  import { layoutGridStyle } from './section-layout';

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
  // Section mode state — the loaded chunk + host ctx shared by every cell.
  let remote_mod = $state<RemoteModule | null>(null);
  let page_ctx = $state<ModulePageHost | null>(null);
  // Stale-load guard — an older in-flight load must never touch state once a
  // newer attempt (retry / url change / destroy) has started.
  let generation = 0;

  // Host-side step-up MFA driver — the `mfaStepUp` ctx bridge delegates here;
  // the dialog lives in this component's own markup (host runtime).
  const stepUp = useMfaStepUp();

  const service_code = $derived(
    service ?? (decl.component_url ? parseWsServiceCode(decl.component_url) : undefined),
  );

  /**
   * Section mode — `page_props.layout.sections` composes the page from
   * mountable blocks instead of a single `mountPage`. A sectioned decl may
   * carry NO `component_url` at all: all-`host:` pages render from the
   * registry alone (descriptor page — zero remote bytes).
   */
  const layout = $derived(decl.page_props?.layout);
  const is_sectioned = $derived((layout?.sections.length ?? 0) > 0);

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
      // Built-in bridges (mfaStepUp/openSheet) merged into the caller record —
      // the same object keeps the `components.remote` back-channel intact.
      components: buildHostComponents(stepUp, components),
      mount_host: mountHostComponent,
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
    remote_mod = null;
    page_ctx = null;
    if (!url && !is_sectioned) {
      setError('contract', null, 'route declaration has no component_url');
      return;
    }
    phase = 'loading';
    error_kind = null;
    error_status = null;
    error_detail = null;

    // CSS first — stylesheet and JS fetch in parallel, page never unstyled.
    if (url) ensureStylesheet(css_url ?? deriveStylesheetUrl(url));

    try {
      if (is_sectioned) {
        // Descriptor page — no chunk to load; remote:* cells self-classify.
        if (!url) {
          page_ctx = buildCtx();
          phase = 'mounted';
          return;
        }
        const { mod, dispose_source } = await loader(url, decl.integrity);
        if (gen !== generation) {
          dispose_source?.();
          return;
        }
        if (components) components.remote = mod;
        remote_mod = mod;
        page_ctx = buildCtx();
        dispose_source?.();
        phase = 'mounted';
        return;
      }
      const { mod, dispose_source } = await loader(url!, decl.integrity);
      if (gen !== generation) {
        dispose_source?.();
        return;
      }
      // Publish the module namespace under `components.remote` — the shim's
      // host-side snippets reach additional chunk exports (e.g. `cell_mount`)
      // through it. Mutating the shim's components record is the documented
      // back-channel; ctx sees the same object.
      if (components) components.remote = mod;
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
        // Mount failures are unexpected — keep the stack in the console for
        // diagnostics; the user still sees the classified in-content panel.
        console.error('[remote-page] mount failed', e);
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
    <RemotePageErrorPanel
      kind={error_kind ?? 'mount'}
      status={error_status}
      detail={error_detail}
      on_retry={() => void load()}
    />
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
  {#if !is_sectioned}
    <div
      bind:this={mountEl}
      class="min-h-0 flex-1 flex-col"
      class:flex={phase === 'mounted'}
      class:hidden={phase !== 'mounted'}
      data-testid="remote-page-content"
    ></div>
  {/if}
  {#if is_sectioned && phase === 'mounted' && page_ctx && layout}
    <!-- Section grid — #key on the chunk so a re-load remounts every cell. -->
    {#key remote_mod}
      <div
        class="min-h-0 min-w-0 flex-1"
        style={layoutGridStyle(layout)}
        data-testid="remote-page-sections"
      >
        {#each layout.sections as s (s.id)}
          <PageSectionSlot section={s} mod={remote_mod} ctx={page_ctx} />
        {/each}
      </div>
    {/key}
  {/if}
  <!-- Step-up MFA dialog — host-rendered; driven by the ctx `mfaStepUp`
       bridge (remote ops never see the dialog, only the final Response). -->
  <MfaStepUpDialog
    bind:open={stepUp.dialogOpen}
    action={stepUp.pendingAction}
    target_resource={stepUp.pendingTargetResource}
    onauthorized={stepUp.handleAuthorized}
  />
</div>
