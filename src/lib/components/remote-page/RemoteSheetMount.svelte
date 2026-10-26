<script lang="ts">
  /**
   * RemoteSheetMount — mounts a module-owned sheet panel delivered as a
   * precompiled ESM chunk (`esm-mount`, `nav.sheets[]` declaration).
   *
   * The host owns the sheet ENGINE (SheetHost chrome + sheet-manager state);
   * this component only mounts the service's CONTENT inside the global
   * surface. Same loading discipline as RemotePageMount: vendor-deps
   * handshake, optional integrity verify, stylesheet side-car, classified
   * in-content errors with retry — the shell is never torn down.
   *
   * The sheet ctx is `ModuleSheetHost` = the shared host base + the `sheet`
   * control surface (key/props/close/replace/setExpanded/side/modal). A
   * props change (host `replaceSheet` or ctx `sheet.replace`) remounts the
   * content — remote trees cannot receive prop pushes across the boundary.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { useMfaStepUp } from '$lib/composables/useMfaStepUp.svelte';
  import MfaStepUpDialog from '$lib/components/auth/MfaStepUpDialog.svelte';
  import RemotePageErrorPanel from './RemotePageErrorPanel.svelte';
  import { buildHostComponents } from './host-bridges';
  import { LoaderCircle } from '@primebrick/ui/vendor/lucide';
  import {
    closeSheet,
    setSheetExpanded,
    sheetState,
  } from '$lib/shell/sheets/sheet-manager.svelte';
  import type { ModuleSheetDecl, ModuleSheetHost } from '@primebrick/ui';
  import {
    RemoteLoadError,
    deriveStylesheetUrl,
    disposeMounted,
    ensureStylesheet,
    loadRemoteModuleCached,
    mountHostComponent,
    parseSvcServiceCode,
    type RemoteErrorKind,
  } from './remote-loader';

  let {
    decl,
    props = {},
    loader = loadRemoteModuleCached,
  }: {
    /** The sheet declaration resolved from module discovery. */
    decl: ModuleSheetDecl;
    /** Caller props — forwarded verbatim into `ctx.sheet.props`. */
    props?: Record<string, unknown>;
    /** Loader override — tests inject fakes. */
    loader?: typeof loadRemoteModuleCached;
  } = $props();

  type Phase = 'loading' | 'mounted' | 'error';

  let phase = $state<Phase>('loading');
  let error_kind = $state<RemoteErrorKind | null>(null);
  let error_status = $state<number | null>(null);
  let error_detail = $state<string | null>(null);
  let mountEl = $state<HTMLDivElement>();
  let mounted: unknown = null;
  // Stale-load guard — an older in-flight load must never touch state once
  // a newer attempt (remount / url change / destroy) has started.
  let generation = 0;

  // Host-side step-up MFA driver — remote sheet content reaches it through
  // the same `ctx.components.mfaStepUp` bridge as remote pages.
  const stepUp = useMfaStepUp();

  const service_code = $derived(parseSvcServiceCode(decl.component_url));

  function buildSheetCtx(): ModuleSheetHost {
    const base = service_code ? `/svc/${service_code}` : '';
    return {
      host_version: 1,
      api: (path, init) =>
        apiFetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, init),
      i18n: {
        t: (key, params) => get(t)(key, params),
        get locale() {
          return get(uiLang);
        },
      },
      notify: (input) => {
        pushNotification(input);
      },
      components: buildHostComponents(stepUp),
      mount_host: mountHostComponent,
      sheet: {
        key: decl.key,
        props,
        side: sheetState.side,
        modal: sheetState.modal,
        close: () => closeSheet(),
        replace: (next: Record<string, unknown>) => {
          // Replace semantics — the host swaps the props object and this
          // component's $effect remounts the sheet content.
          sheetState.props = next;
        },
        setExpanded: (expanded: boolean) => setSheetExpanded(expanded),
      },
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
      setError('contract', null, 'sheet declaration has no component_url');
      return;
    }
    phase = 'loading';
    error_kind = null;
    error_status = null;
    error_detail = null;

    // CSS first — stylesheet and JS fetch in parallel, sheet never unstyled.
    ensureStylesheet(deriveStylesheetUrl(url));

    try {
      const { mod, dispose_source } = await loader(url, decl.integrity);
      if (gen !== generation) {
        dispose_source?.();
        return;
      }
      try {
        if (typeof mod.mountSheet !== 'function') {
          throw new RemoteLoadError(
            'contract',
            `module chunk '${decl.key}' does not export mountSheet(el, ctx)`,
          );
        }
        const el = mountEl;
        if (!el) throw new RemoteLoadError('mount', 'mount target not mounted');
        mounted = await mod.mountSheet(el, buildSheetCtx());
        dispose_source?.();
      } catch (e) {
        dispose_source?.();
        // Mount failures are unexpected — keep the stack in the console for
        // diagnostics; the user still sees the classified in-content panel.
        console.error('[remote-sheet] mount failed', e);
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
    // Remount when the declaration target changes (another remote sheet on
    // the same surface) or the props object is replaced (`sheet.replace` /
    // host `replaceSheet`) — remote trees cannot receive live prop pushes.
    void decl.component_url;
    void props;
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

<div class="flex min-h-0 flex-1 flex-col" data-testid="remote-sheet-mount">
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
      data-testid="remote-sheet-loading"
      aria-busy="true"
    >
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle class="size-4 animate-spin" />
        {$t('app.remote_page.loading')}
      </div>
      <Skeleton class="h-8 w-1/3" />
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
    data-testid="remote-sheet-content"
  ></div>
  <!-- Step-up MFA dialog — host-rendered; driven by the ctx `mfaStepUp`
       bridge (remote ops never see the dialog, only the final Response). -->
  <MfaStepUpDialog
    bind:open={stepUp.dialogOpen}
    action={stepUp.pendingAction}
    target_resource={stepUp.pendingTargetResource}
    onauthorized={stepUp.handleAuthorized}
  />
</div>
