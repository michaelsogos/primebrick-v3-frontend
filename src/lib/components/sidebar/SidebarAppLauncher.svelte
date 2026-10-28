<script lang="ts">
  import { Popover, Switch } from '@primebrick/ui';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { Kbd } from '$lib/components/ui/kbd';
  import { menuListSelectedSurfaceDropdownClasses, menuListHoverNeutral } from '@primebrick/ui';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { loadModuleTranslations } from '$lib/i18n/use-module-translations.svelte';
  import { defaultLeafHref, flattenNavLeaves, shellNav } from '$lib/shell/modules-shell.svelte';
  import { resolveModuleLabel } from '$lib/shell/module-label';
  import { routesCensusFromModules } from '$lib/api';
  import { routePatternMatches } from '$lib/navigation/access-guard';
  import { userPreferences } from '$lib/composables/useUserPreferences.svelte';
  import type { ModuleInfo, ModuleNavLink } from '$lib/api-types';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { DynamicIcon } from '@primebrick/ui';
  import { ChevronsUpDown } from '@primebrick/ui/vendor/lucide';
  import { ChevronRight, StarOff } from '@primebrick/ui/vendor/lucide';
  import { GradientIcon } from '$lib/components/ui/gradient-icon';
  import { APP_ROOT_ICON } from '$lib/shell/app-icons';
  import { get } from 'svelte/store';
  import { tick } from 'svelte';

  let { collapsed }: { collapsed: boolean } = $props();

  /**
   * Finder-style app launcher — three columns Apps | Modules | Pages.
   *
   * SELECT vs ACTIVATE semantics (touch + keyboard parity):
   *   selecting a row (tap / click / arrow focus) PREVIEWS the next column;
   *   the goto action lives on the trailing icon-only CTA, or on
   *   Enter/Space for keyboard users (a page row is a leaf — its whole row
   *   IS the goto).
   *
   * Click/keyboard semantics follow the default chain declared in metadata:
   *   app CTA    → is_default module → its first page under that app
   *   module CTA → its first page under the previewed app
   *   page row   → direct navigation
   *
   * The panel never renders below 4 rows tall and grows up to 12 as
   * content arrives — within an open session it only grows (no jarring
   * shrink on preview changes), and height changes animate.
   */

  const ROW_HEIGHT_REM = 2.75; // h-11 rows (44px touch targets)
  const ROWS_MIN = 4;
  const ROWS_MAX = 12;

  let open = $state(false);
  // Previewed (selected) column values — default to the current route's
  // context so the panel always opens on where the user IS.
  let previewApp = $state<string | null>(null);
  let previewModuleId = $state<string | null>(null);
  // Third link of the preview chain — set by col-3 row focus, reset
  // whenever a shallower level changes.
  let previewLeaf = $state<(ModuleNavLink & { hidden?: boolean }) | null>(null);
  // Height ratchet — only grows while the panel is open.
  let shownRows = $state(ROWS_MIN);
  // Reveal switch — when ON, roots/modules/pages the access axis filtered
  // out are rendered DISABLED (visible but never navigable: no row goto,
  // no CTA). Selection/preview stays allowed — that IS the reveal.
  let showAll = $state(false);

  const currentRoot = $derived(shellNav.rootForRoute(page.url.pathname));
  const currentModuleId = $derived(shellNav.selectedModuleId);
  const activeApp = $derived(previewApp ?? currentRoot);

  const modules = $derived(shellNav.modulesForRoot(activeApp));

  /** Pseudo-root sentinel for the favorites surface — the FIRST row of the
   *  Apps column. Selecting it previews `favorite_pages` (user
   *  preferences) in column 2; it has no modules and never navigates. */
  const FAVORITES_ROOT = '__favorites';

  /** Root levels rendered in column 1 — the favorites pseudo-root FIRST,
   *  then navigable roots, then (reveal ON) roots whose every module is
   *  `accessible:false`, marked `hidden`. A hidden root previews its
   *  disabled modules but never activates. */
  const displayRoots = $derived.by((): { root: string; hidden: boolean }[] => {
    const items = [
      { root: FAVORITES_ROOT, hidden: false },
      ...shellNav.roots.map((root) => ({ root, hidden: false })),
    ];
    if (!showAll) return items;
    const navigable = new Set(shellNav.roots);
    const hidden = new Set<string>();
    for (const m of shellNav.modules) {
      if (m.accessible !== false) continue;
      for (const p of m.route_prefixes ?? []) hidden.add(firstSegment(p));
    }
    return [
      ...items,
      ...[...hidden]
        .filter((r) => r && !navigable.has(r))
        .map((root) => ({ root, hidden: true })),
    ];
  });

  /** Favorite pages — resolved LIVE against the route census so labels and
   *  icons never go stale (the preference stores only route paths). A
   *  favorite whose route left the census is `orphan` — rendered muted,
   *  still removable. */
  const favoriteItems = $derived.by(
    (): { href: string; label_key: string | null; icon: string | null; orphan: boolean }[] => {
      const census = routesCensusFromModules(shellNav.modules);
      const leaves = flattenNavLeaves(
        shellNav.modules.flatMap((m) => m.nav ?? []),
      );
      return userPreferences.favorites().map((href) => {
        const decl =
          census.find((r) => r.route === href) ??
          census.find((r) => routePatternMatches(r.route, href));
        const leaf = leaves.find((l) => l.href === href);
        return {
          href,
          label_key: decl?.label_key ?? leaf?.label_key ?? null,
          icon: decl?.icon ?? leaf?.icon ?? null,
          orphan: !decl && !leaf,
        };
      });
    },
  );

  const favoritesActive = $derived(activeApp === FAVORITES_ROOT);

  /** Modules rendered in column 2 — navigable first, then (reveal ON)
   *  `accessible:false` modules claiming this root, marked `hidden`.
   *  Empty under the favorites pseudo-root (column 2 lists favorites). */
  const displayModules = $derived.by((): { m: ModuleInfo; hidden: boolean }[] => {
    if (favoritesActive) return [];
    const items = modules.map((m) => ({ m, hidden: false }));
    if (!showAll) return items;
    return [
      ...items,
      ...shellNav
        .inaccessibleModulesForRoot(activeApp)
        .map((m) => ({ m, hidden: true })),
    ];
  });

  /** The module column's effective selection — the previewed row, else
   *  the current module when it belongs to the previewed app, else the
   *  app's declared default (the target of an app CTA). */
  const activeModuleId = $derived.by(() => {
    const all = displayModules.map((d) => d.m);
    if (previewModuleId && all.some((m) => m.id === previewModuleId)) {
      return previewModuleId;
    }
    if (currentModuleId && all.some((m) => m.id === currentModuleId)) {
      return currentModuleId;
    }
    return shellNav.defaultModuleForRoot(activeApp)?.id ?? null;
  });

  /** Pages of the active module scoped to the previewed app root — a
   *  multi-root module only shows the slice owned by this column's app.
   *  Read straight from the discovery payload (`ModuleInfo.nav`) — it is
   *  already access-filtered server-side and needs no second fetch. With
   *  the reveal ON, `nav_hidden` items append after, marked `hidden`. */
  const previewPages = $derived.by((): (ModuleNavLink & { hidden?: boolean })[] => {
    if (!activeModuleId || favoritesActive) return [];
    const mod = shellNav.modules.find((m) => m.id === activeModuleId);
    const inRoot = (i: ModuleNavLink) =>
      i.href.split('/').filter(Boolean)[0] === activeApp;
    const nav = (mod?.nav ?? []).filter(inRoot);
    if (!showAll) return nav;
    const hidden = (mod?.nav_hidden ?? [])
      .filter(inRoot)
      .map((i) => ({ ...i, hidden: true as const }));
    return [...nav, ...hidden];
  });

  /* Selection (gradient) = ONLY what the user previewed or the route
   * context — never the fallbacks used to populate content. The route
   * rows get the primary dot marker whenever the preview diverges. */
  const onRouteChain = $derived(
    (previewApp == null || previewApp === currentRoot) &&
      (previewModuleId == null || previewModuleId === currentModuleId)
  );
  const selModuleId = $derived(
    previewModuleId ??
      ((previewApp ?? currentRoot) === currentRoot ? currentModuleId : null)
  );
  const selLeafId = $derived.by(() => {
    const leaf = previewLeaf;
    if (leaf && previewPages.some((i) => i.id === leaf.id)) return leaf.id;
    return onRouteChain
      ? (previewPages.find((i) => i.href === page.url.pathname)?.id ?? null)
      : null;
  });
  const previewModule = $derived(
    shellNav.modules.find((m) => m.id === activeModuleId) ?? null
  );

  /** The module's URL under a given root — its declared route_prefix,
   *  NOT the default-leaf resolution (that's a goto target, not a path
   *  segment). Membership guarantees a prefix exists for the root. */
  function modulePathInApp(m: ModuleInfo, root: string): string {
    return (
      m.route_prefixes?.find((p) => firstSegment(p) === root) ?? `/${root}`
    );
  }

  /** The virtual path the user is composing — header line 1 (labels).
   *  Segments appear only for levels actually selected (previewed or
   *  route chain): the path is composed 1-1 with the selection, never
   *  auto-completed by content fallbacks. */
  const selLeaf = $derived(
    previewPages.find((i) => i.id === selLeafId) ?? null
  );
  const selModule = $derived(
    shellNav.modules.find((m) => m.id === selModuleId) ?? null
  );
  const pathLabel = $derived(
    [
      favoritesActive
        ? $t('app.favorites.title')
        : $t(`app.nav.roots.${activeApp ?? currentRoot}`),
      selModule ? resolveModuleLabel(selModule, $t) : null,
      selLeaf ? $t(selLeaf.label_key) : null,
    ]
      .filter(Boolean)
      .join(' › ')
  );
  /** The URL of the composed path — one segment per selected level:
   *  leaf → its href, module → its route_prefix in the root, root →
   *  /root. NOT the goto resolution — the literal path. */
  const previewHref = $derived(
    favoritesActive
      ? null
      : (selLeaf?.href ??
          (selModule
            ? modulePathInApp(selModule, activeApp ?? currentRoot)
            : `/${activeApp ?? currentRoot}`))
  );

  /* Hover preview — mouse-only, display-only. Hovering a row shows ITS
   * composed path in the header without touching selection or
   * navigation (click/keyboard stay the only activation paths). */
  let hoverPath = $state<{ label: string; href: string } | null>(null);

  function moduleHoverPath(m: ModuleInfo): { label: string; href: string } {
    const root = activeApp ?? currentRoot;
    return {
      label: `${$t(`app.nav.roots.${root}`)} › ${resolveModuleLabel(m, $t)}`,
      href: modulePathInApp(m, root),
    };
  }

  function leafHoverPath(item: ModuleNavLink): { label: string; href: string } {
    const root = activeApp ?? currentRoot;
    const parts = [
      $t(`app.nav.roots.${root}`),
      previewModule ? resolveModuleLabel(previewModule, $t) : null,
      $t(item.label_key),
    ];
    return { label: parts.filter(Boolean).join(' › '), href: item.href };
  }

  const shownPath = $derived(
    hoverPath ?? { label: pathLabel, href: previewHref }
  );

  /** Tallest content across the three columns, clamped to the 4..12 band.
   *  Within an open session `shownRows` only ratchets UP — the panel grows
   *  as columns populate but never shrinks under the pointer. */
  const targetRows = $derived(
    Math.min(
      ROWS_MAX,
      Math.max(
        ROWS_MIN,
        displayRoots.length,
        favoritesActive ? favoriteItems.length : displayModules.length,
        previewPages.length
      )
    )
  );
  $effect(() => {
    if (open && targetRows > shownRows) shownRows = targetRows;
  });

  function firstSegment(href: string): string {
    return href.split('/').filter(Boolean)[0] ?? '';
  }

  /** Lazy-load a module's translation dictionary for the Pages column —
   *  nav data itself is already in the discovery payload, no fetch needed. */
  function ensureModuleData(moduleId: string) {
    void loadModuleTranslations(moduleId, get(uiLang));
  }

  /** Row SELECTED (tap/click/focus) — descends into the column, never navigates. */
  function selectApp(root: string) {
    previewApp = root;
    previewModuleId = null;
    previewLeaf = null;
    // The Pages column previews this app's default module — prefetch its
    // meta so column 3 is populated when the pointer reaches it.
    const dflt = shellNav.defaultModuleForRoot(root);
    if (dflt) ensureModuleData(dflt.id);
  }

  function selectModulePreview(m: ModuleInfo) {
    previewModuleId = m.id;
    previewLeaf = null;
    ensureModuleData(m.id);
  }

  /** GOTO(module, root) target — the declared `default` leaf under this
   *  root (access-filtered server-side; first accessible leaf wins when
   *  the default itself is filtered out), else the module's prefix shim
   *  in that root which resolves the same way. */
  function moduleHomeInApp(m: ModuleInfo, root: string): string {
    return (
      defaultLeafHref(m, root) ??
      m.route_prefixes?.find((p) => firstSegment(p) === root) ??
      '/'
    );
  }

  async function activateApp(root: string) {
    const m = shellNav.defaultModuleForRoot(root);
    if (!m) return;
    open = false;
    ensureModuleData(m.id);
    await shellNav.selectModule(m.id);
    void goto(resolve(moduleHomeInApp(m, root) as '/'));
  }

  async function activateModule(m: ModuleInfo) {
    if (m.accessible === false || m.enabled === false) return; // hidden/disabled — reveal only
    const root = activeApp;
    open = false;
    ensureModuleData(m.id);
    await shellNav.selectModule(m.id);
    void goto(resolve(moduleHomeInApp(m, root) as '/'));
  }

  function activatePage(item: ModuleNavLink & { hidden?: boolean }) {
    if (item.hidden) return; // access-filtered — reveal only
    open = false;
    void goto(resolve(item.href as '/'));
  }

  function activateFavorite(item: { href: string }) {
    open = false;
    void goto(resolve(item.href as '/'));
  }

  function removeFavorite(href: string) {
    void userPreferences.toggleFavorite(href);
  }

  /* ---- Keyboard navigation (roving tabindex across the 3 columns) ----
   * Arrows move focus — focus PREVIEWS the next column (the keyboard
   * equivalent of the row's tap/click descend). Enter/Space activates
   * the row's goto CTA (a page row is a leaf — it IS the goto). */

  let panelEl = $state<HTMLDivElement | null>(null);
  // Roving tabindex per column — Tab always re-enters on the last-focused row.
  const colFocusIdx = $state<[number, number, number]>([0, 0, 0]);

  function rowsOf(col: number): HTMLElement[] {
    if (!panelEl) return [];
    return [
      ...panelEl.querySelectorAll<HTMLElement>(
        `[data-launcher-col='${col}'] [data-launcher-row]`
      ),
    ];
  }

  function focusRow(col: number, idx: number) {
    const rows = rowsOf(col);
    if (rows.length === 0) return;
    rows[Math.max(0, Math.min(idx, rows.length - 1))].focus();
  }

  function activateAt(col: number, idx: number) {
    if (col === 0) {
      const d = displayRoots[idx];
      if (d && !d.hidden) void activateApp(d.root);
    } else if (col === 1) {
      if (favoritesActive) {
        const item = favoriteItems[idx];
        if (item) activateFavorite(item);
      } else {
        const d = displayModules[idx];
        if (d && !d.hidden) void activateModule(d.m);
      }
    } else if (col === 2) {
      const item = previewPages[idx];
      if (item) activatePage(item);
    }
  }

  function handleRowKeydown(e: KeyboardEvent, col: number, idx: number) {
    const rows = rowsOf(col);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
      focusRow(col, (next + rows.length) % rows.length); // wrap
    } else if (e.key === 'ArrowRight' && col < 2) {
      e.preventDefault();
      focusRow(col + 1, 0);
    } else if (e.key === 'ArrowLeft' && col > 0) {
      e.preventDefault();
      // Back to the row that produced this column — the app/module row
      // whose selection previews it (focus handlers track colFocusIdx).
      focusRow(col - 1, colFocusIdx[(col - 1) as 0 | 1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activateAt(col, idx);
    }
  }

  function trackFocus(col: number, idx: number) {
    colFocusIdx[col] = idx;
  }

  /** Reset preview to the current route context on every open. The
   *  popover restores focus to the LAST-focused row — without an
   *  explicit re-focus that row's `onfocus` would re-dirty the just-
   *  reset preview with stale state. Focusing the route-context row
   *  makes its `onfocus` produce the correct preview instead. */
  function handleOpenChange(next: boolean) {
    open = next;
    if (next) {
      previewApp = null;
      previewModuleId = null;
      previewLeaf = null;
      hoverPath = null;
      shownRows = Math.max(ROWS_MIN, targetRows);
      if (currentModuleId) ensureModuleData(currentModuleId);
      void tick().then(() => {
        const idx = displayRoots.findIndex((d) => d.root === currentRoot);
        if (idx >= 0) focusRow(0, idx);
      });
    }
  }

  const appLabel = $derived($t(`app.nav.roots.${currentRoot}`));
  const moduleLabel = $derived(
    resolveModuleLabel(
      shellNav.modules.find((m) => m.id === currentModuleId),
      $t
    ) || $t('app.nav.module')
  );
  const triggerLabel = $derived(`${appLabel} / ${moduleLabel}`);

  const rowBase =
    'flex h-11 w-full cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 text-left text-sm outline-hidden select-none touch-manipulation focus-visible:ring-2 focus-visible:ring-ring';
  const ctaBtn =
    'ms-auto flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-hidden hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring';
  /** Lucide `external-link` path data — the "open link" affordance, stroked
   *  with the primary gradient (same convention as the topbar AI/FARO CTAs). */
  const externalLinkPaths = [
    'M15 3h6v6',
    'M10 14 21 3',
    'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'
  ];
  /** Lucide `star` path + amber gradient — the favorites identity marker
   *  (same convention as PageHeader's favorite toggle). */
  const starPaths = [
    'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'
  ];
  const amberStops = ['#fbbf24', '#fb923c', '#fbbf24'];
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <Popover.Root {open} onOpenChange={handleOpenChange}>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuButton
            {...props}
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            title={triggerLabel}
            aria-label={$t('app.nav.rootLevel')}
            data-testid="app-launcher-trigger"
          >
            <div
              class="flex size-8 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground"
            >
              <DynamicIcon name={APP_ROOT_ICON} size={16} />
            </div>
            {#if !collapsed}
              <div class="grid min-w-0 flex-1 text-left leading-tight">
                <span class="truncate text-sm font-semibold">{triggerLabel}</span>
              </div>
              <ChevronsUpDown class="ms-auto size-4 shrink-0 opacity-70" aria-hidden="true" />
            {/if}
          </Sidebar.MenuButton>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content
        class="w-auto max-w-none p-0"
        side="right"
        align="start"
        sideOffset={8}
        data-testid="app-launcher-panel"
      >
        <!-- Virtual path header — the link the preview chain composes.
             Line 1 labels (i18n), line 2 the resolved href == Enter's goto. -->
        <div
          class="border-b border-sidebar-border bg-sidebar-accent px-3 py-1.5 text-sidebar-accent-foreground"
          data-testid="app-launcher-path"
        >
          <div class="truncate text-sm font-medium">{shownPath.label}</div>
          {#if shownPath.href}
            <div class="truncate font-mono text-[11px] text-muted-foreground">{shownPath.href}</div>
          {/if}
        </div>
        <div
          bind:this={panelEl}
          role="presentation"
          class="flex divide-x divide-border"
          style:height={`${shownRows * ROW_HEIGHT_REM}rem`}
          style:transition="height 200ms ease-out"
          onmouseleave={() => (hoverPath = null)}
        >
          <!-- Column 1 — Applications (root levels) -->
          <div
            class="flex min-w-48 max-w-[300px] flex-col overflow-y-auto p-1"
            role="listbox"
            aria-label={$t('app.nav.rootLevel')}
            data-launcher-col="0"
            data-testid="app-launcher-apps"
          >
            {#each displayRoots as d, i (d.root)}
              {@const root = d.root}
              <div
                role="option"
                aria-selected={activeApp === root}
                aria-disabled={d.hidden}
                tabindex={colFocusIdx[0] === i ? 0 : -1}
                data-launcher-row
                data-app-root={root}
                data-hidden={d.hidden || undefined}
                class={cn(
                  rowBase,
                  menuListHoverNeutral,
                  activeApp === root && menuListSelectedSurfaceDropdownClasses,
                  d.hidden && 'opacity-50'
                )}
                onfocus={() => {
                  trackFocus(0, i);
                  selectApp(root);
                }}
                onmouseenter={() =>
                  (hoverPath =
                    root === FAVORITES_ROOT
                      ? { label: $t('app.favorites.title'), href: '' }
                      : { label: $t(`app.nav.roots.${root}`), href: `/${root}` })}
                onclick={() => selectApp(root)}
                onkeydown={(e) => handleRowKeydown(e, 0, i)}
              >
                <div class="flex size-5 shrink-0 items-center justify-center">
                  {#if root === FAVORITES_ROOT}
                    <GradientIcon size={14} paths={starPaths} stops={amberStops} filled stroke_width={1.5} />
                  {:else}
                    <DynamicIcon name={APP_ROOT_ICON} size={14} />
                  {/if}
                </div>
                <span class="min-w-0 flex-1 truncate">
                  {root === FAVORITES_ROOT ? $t('app.favorites.title') : $t(`app.nav.roots.${root}`)}
                </span>
                {#if currentRoot === root && activeApp !== root}
                  <span class="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
                {/if}
                {#if root !== FAVORITES_ROOT}
                  <button
                    type="button"
                    tabindex="-1"
                    class={ctaBtn}
                    aria-label={$t('app.nav.goTo')}
                    data-testid="launcher-cta"
                    disabled={d.hidden}
                    onclick={(e) => {
                      e.stopPropagation();
                      void activateApp(root);
                    }}
                  >
                    <GradientIcon size={16} paths={externalLinkPaths} />
                  </button>
                {/if}
                <ChevronRight class="size-4 shrink-0 opacity-60" aria-hidden="true" />
              </div>
            {/each}
          </div>

          <!-- Column 2 — Modules of the selected app, or the favorites
               list under the Preferiti pseudo-root. -->
          <div
            class="flex min-w-52 max-w-[300px] flex-col overflow-y-auto p-1"
            role="listbox"
            aria-label={favoritesActive ? $t('app.favorites.title') : $t('app.nav.module')}
            data-launcher-col="1"
            data-testid="app-launcher-modules"
          >
            {#if favoritesActive}
              {#each favoriteItems as item, i (item.href)}
                <div
                  role="option"
                  aria-selected={false}
                  aria-disabled={item.orphan}
                  tabindex={colFocusIdx[1] === i ? 0 : -1}
                  data-launcher-row
                  data-favorite-href={item.href}
                  data-orphan={item.orphan || undefined}
                  class={cn(rowBase, menuListHoverNeutral, item.orphan && 'opacity-50')}
                  onfocus={() => trackFocus(1, i)}
                  onmouseenter={() =>
                    (hoverPath = {
                      label: `${$t('app.favorites.title')} › ${item.label_key ? $t(item.label_key) : item.href}`,
                      href: item.href,
                    })}
                  onclick={() => activateFavorite(item)}
                  onkeydown={(e) => handleRowKeydown(e, 1, i)}
                >
                  <div class="flex size-5 shrink-0 items-center justify-center">
                    {#if item.icon}
                      <DynamicIcon name={item.icon} size={14} />
                    {:else}
                      <GradientIcon size={14} paths={starPaths} stops={amberStops} filled stroke_width={1.5} />
                    {/if}
                  </div>
                  <span class="min-w-0 flex-1 truncate">
                    {item.label_key ? $t(item.label_key) : item.href}
                  </span>
                  {#if page.url.pathname === item.href}
                    <span class="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
                  {/if}
                  <button
                    type="button"
                    tabindex="-1"
                    class={ctaBtn}
                    aria-label={$t('app.favorites.remove')}
                    data-testid="launcher-favorite-remove"
                    onclick={(e) => {
                      e.stopPropagation();
                      removeFavorite(item.href);
                    }}
                  >
                    <StarOff size={14} />
                  </button>
                </div>
              {:else}
                <div
                  class="px-2 py-1.5 text-xs text-muted-foreground"
                  data-testid="app-launcher-favorites-empty"
                >
                  {$t('app.favorites.empty')}
                </div>
              {/each}
            {:else}
            {#each displayModules as d, i (d.m.id)}
              {@const m = d.m}
              <div
                role="option"
                aria-selected={selModuleId === m.id}
                aria-disabled={d.hidden || m.enabled === false}
                tabindex={colFocusIdx[1] === i ? 0 : -1}
                data-launcher-row
                data-module-id={m.id}
                data-hidden={d.hidden || undefined}
                class={cn(
                  rowBase,
                  menuListHoverNeutral,
                  selModuleId === m.id && menuListSelectedSurfaceDropdownClasses,
                  (d.hidden || m.enabled === false) && 'opacity-50',
                  m.enabled === false && 'pointer-events-none'
                )}
                onfocus={() => {
                  trackFocus(1, i);
                  selectModulePreview(m);
                }}
                onmouseenter={() => (hoverPath = moduleHoverPath(m))}
                onclick={() => selectModulePreview(m)}
                onkeydown={(e) => handleRowKeydown(e, 1, i)}
              >
                <div class="flex size-5 shrink-0 items-center justify-center">
                  <DynamicIcon name={m.icon ?? 'layout-grid'} size={14} />
                </div>
                <span class="min-w-0 flex-1 truncate">{resolveModuleLabel(m, $t)}</span>
                {#if currentModuleId === m.id && selModuleId !== m.id}
                  <span class="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
                {/if}
                <button
                  type="button"
                  tabindex="-1"
                  class={ctaBtn}
                  aria-label={$t('app.nav.goTo')}
                  data-testid="launcher-cta"
                  disabled={d.hidden}
                  onclick={(e) => {
                    e.stopPropagation();
                    void activateModule(m);
                  }}
                >
                  <GradientIcon size={16} paths={externalLinkPaths} />
                </button>
                <ChevronRight class="size-4 shrink-0 opacity-60" aria-hidden="true" />
              </div>
            {:else}
              <div class="px-2 py-1.5 text-xs text-muted-foreground">—</div>
            {/each}
            {/if}
          </div>

          <!-- Column 3 — Pages of the selected module under the previewed app -->
          <div
            class="flex min-w-52 max-w-[300px] flex-col overflow-y-auto p-1"
            role="listbox"
            aria-label={$t('app.nav.links')}
            data-launcher-col="2"
            data-testid="app-launcher-pages"
          >
            {#each previewPages as item, i (item.id)}
              <div
                role="option"
                aria-selected={selLeafId === item.id}
                aria-disabled={item.hidden}
                tabindex={colFocusIdx[2] === i ? 0 : -1}
                data-launcher-row
                data-hidden={item.hidden || undefined}
                class={cn(
                  rowBase,
                  menuListHoverNeutral,
                  selLeafId === item.id && menuListSelectedSurfaceDropdownClasses,
                  item.hidden && 'pointer-events-none opacity-50'
                )}
                onfocus={() => {
                  trackFocus(2, i);
                  previewLeaf = item;
                }}
                onmouseenter={() => (hoverPath = leafHoverPath(item))}
                onclick={() => activatePage(item)}
                onkeydown={(e) => handleRowKeydown(e, 2, i)}
              >
                <div class="flex size-5 shrink-0 items-center justify-center">
                  <DynamicIcon name={item.icon ?? 'circle'} size={14} />
                </div>
                <span class="min-w-0 flex-1 truncate">{$t(item.label_key)}</span>
                {#if page.url.pathname === item.href && selLeafId !== item.id}
                  <span class="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
                {/if}
              </div>
            {:else}
              <div class="px-2 py-1.5 text-xs text-muted-foreground">—</div>
            {/each}
          </div>
        </div>
        <!-- Keyboard hints footer -->
        <div
          class="flex items-center gap-3 border-t border-border bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground"
          data-testid="app-launcher-footer"
        >
          <span class="inline-flex items-center gap-1">
            <Kbd size="key">↑</Kbd><Kbd size="key">↓</Kbd><Kbd size="key">←</Kbd><Kbd size="key">→</Kbd>
          </span>
          <span class="inline-flex items-center gap-1">
            <Kbd size="key">⏎</Kbd>
            <span>{$t('app.nav.goTo')}</span>
          </span>
          <span class="inline-flex items-center gap-1">
            <Kbd size="modifier">esc</Kbd>
            <span>{$t('app.common.close')}</span>
          </span>
          <label
            class="ms-auto inline-flex cursor-pointer items-center gap-1.5"
            data-testid="app-launcher-show-all"
          >
            <Switch bind:checked={showAll} class="scale-[0.65]" />
            <span>{$t('app.nav.show_all')}</span>
          </label>
        </div>
      </Popover.Content>
    </Popover.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
