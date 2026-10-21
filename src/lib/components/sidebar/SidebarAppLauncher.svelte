<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { Kbd } from '$lib/components/ui/kbd';
  import {
    menuListSelectedSurfaceDropdownClasses,
    menuListHoverNeutral,
  } from '$lib/components/ui/menu-row-chrome';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { loadModuleTranslations } from '$lib/i18n/use-module-translations.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { resolveModuleLabel } from '$lib/shell/module-label';
  import { fetchModuleMeta } from '$lib/api';
  import type { ModuleInfo, ModuleNav, ModuleNavLink } from '$lib/api-types';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import DynamicIcon from '$lib/components/ui/dynamic-icon/DynamicIcon.svelte';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import Layers from '@lucide/svelte/icons/layers';
  import { get } from 'svelte/store';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';

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
  // Height ratchet — only grows while the panel is open.
  let shownRows = $state(ROWS_MIN);

  // Per-module nav cache for the Pages column — `shellNav.moduleNav` only
  // holds the SELECTED module; previewing siblings fetches meta lazily.
  const metaCache = new SvelteMap<string, ModuleNav>();
  const metaLoading = new SvelteSet<string>();

  const currentRoot = $derived(shellNav.rootForRoute(page.url.pathname));
  const currentModuleId = $derived(shellNav.selectedModuleId);
  const activeApp = $derived(previewApp ?? currentRoot);

  const modules = $derived(shellNav.modulesForRoot(activeApp));

  /** The module column's effective selection — the previewed row, else
   *  the current module when it belongs to the previewed app, else the
   *  app's declared default (the target of an app CTA). */
  const activeModuleId = $derived.by(() => {
    if (previewModuleId && modules.some((m) => m.id === previewModuleId)) {
      return previewModuleId;
    }
    if (currentModuleId && modules.some((m) => m.id === currentModuleId)) {
      return currentModuleId;
    }
    return shellNav.defaultModuleForRoot(activeApp)?.id ?? null;
  });

  /** Pages of the active module scoped to the previewed app root — a
   *  multi-root module only shows the slice owned by this column's app. */
  const previewPages = $derived.by((): ModuleNavLink[] => {
    if (!activeModuleId) return [];
    const meta =
      activeModuleId === currentModuleId
        ? (shellNav.moduleNav ?? metaCache.get(activeModuleId))
        : metaCache.get(activeModuleId);
    if (!meta) return [];
    return meta.nav.filter(
      (i) => i.href.split('/').filter(Boolean)[0] === activeApp
    );
  });

  const pagesLoading = $derived(
    !!activeModuleId && metaLoading.has(activeModuleId) && previewPages.length === 0
  );

  /** Tallest content across the three columns, clamped to the 4..12 band.
   *  Within an open session `shownRows` only ratchets UP — the panel grows
   *  as columns populate but never shrinks under the pointer. */
  const targetRows = $derived(
    Math.min(
      ROWS_MAX,
      Math.max(ROWS_MIN, shellNav.roots.length, modules.length, previewPages.length)
    )
  );
  $effect(() => {
    if (open && targetRows > shownRows) shownRows = targetRows;
  });

  function firstSegment(href: string): string {
    return href.split('/').filter(Boolean)[0] ?? '';
  }

  /** Lazy-fetch a module's nav meta + dictionary for the Pages column —
   *  deduped by cache/loading state; the shell store is untouched (the
   *  preview must not mutate the app's real selection). */
  function ensureModuleData(moduleId: string) {
    if (metaCache.has(moduleId) || metaLoading.has(moduleId)) return;
    metaLoading.add(moduleId);
    void fetchModuleMeta(moduleId)
      .then((meta) => {
        metaCache.set(moduleId, meta);
      })
      .catch(() => {
        // Preview stays empty — the module may be offline; the CTA path
        // still surfaces the real error via selectModule/moduleNavError.
      })
      .finally(() => {
        metaLoading.delete(moduleId);
      });
    void loadModuleTranslations(moduleId, get(uiLang));
  }

  /** Row SELECTED (tap/click/focus) — descends into the column, never navigates. */
  function selectApp(root: string) {
    previewApp = root;
    previewModuleId = null;
    // The Pages column previews this app's default module — prefetch its
    // meta so column 3 is populated when the pointer reaches it.
    const dflt = shellNav.defaultModuleForRoot(root);
    if (dflt) ensureModuleData(dflt.id);
  }

  function selectModulePreview(m: ModuleInfo) {
    previewModuleId = m.id;
    ensureModuleData(m.id);
  }

  /** Home href of a module under a specific app root — first declared nav
   *  link of that slice (nav[0] of the module's own root may live in a
   *  different app), else the module's prefix in that root. */
  function moduleHomeInApp(m: ModuleInfo, root: string): string {
    const nav =
      m.id === currentModuleId
        ? (shellNav.moduleNav ?? metaCache.get(m.id))?.nav
        : metaCache.get(m.id)?.nav;
    return (
      nav?.find((i) => firstSegment(i.href) === root)?.href ??
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
    const root = activeApp;
    open = false;
    ensureModuleData(m.id);
    await shellNav.selectModule(m.id);
    void goto(resolve(moduleHomeInApp(m, root) as '/'));
  }

  function activatePage(href: string) {
    open = false;
    void goto(resolve(href as '/'));
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
    if (col === 0) void activateApp(shellNav.roots[idx]);
    else if (col === 1) {
      const m = modules[idx];
      if (m && m.enabled !== false) void activateModule(m);
    } else if (col === 2) {
      const item = previewPages[idx];
      if (item) activatePage(item.href);
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

  /** Reset preview to the current route context on every open. */
  function handleOpenChange(next: boolean) {
    open = next;
    if (next) {
      previewApp = null;
      previewModuleId = null;
      shownRows = Math.max(ROWS_MIN, targetRows);
      if (currentModuleId) ensureModuleData(currentModuleId);
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
              <Layers class="size-4" />
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
        <div
          bind:this={panelEl}
          class="flex divide-x divide-border"
          style:height={`${shownRows * ROW_HEIGHT_REM}rem`}
          style:transition="height 200ms ease-out"
        >
          <!-- Column 1 — Applications (root levels) -->
          <div
            class="flex w-48 flex-col overflow-y-auto p-1"
            role="listbox"
            aria-label={$t('app.nav.rootLevel')}
            data-launcher-col="0"
            data-testid="app-launcher-apps"
          >
            {#each shellNav.roots as root, i (root)}
              <div
                role="option"
                aria-selected={currentRoot === root}
                tabindex={colFocusIdx[0] === i ? 0 : -1}
                data-launcher-row
                data-app-root={root}
                class={cn(
                  rowBase,
                  menuListHoverNeutral,
                  currentRoot === root && menuListSelectedSurfaceDropdownClasses
                )}
                onfocus={() => {
                  trackFocus(0, i);
                  selectApp(root);
                }}
                onclick={() => selectApp(root)}
                onkeydown={(e) => handleRowKeydown(e, 0, i)}
              >
                <div class="flex size-5 shrink-0 items-center justify-center">
                  <Layers class="size-3.5" />
                </div>
                <span class="min-w-0 flex-1 truncate">{$t(`app.nav.roots.${root}`)}</span>
                <button
                  type="button"
                  tabindex="-1"
                  class={ctaBtn}
                  aria-label={$t('app.nav.goTo')}
                  data-testid="launcher-cta"
                  onclick={(e) => {
                    e.stopPropagation();
                    void activateApp(root);
                  }}
                >
                  <ArrowUpRight class="size-4" />
                </button>
                <ChevronRight class="size-4 shrink-0 opacity-60" aria-hidden="true" />
              </div>
            {/each}
          </div>

          <!-- Column 2 — Modules of the selected app -->
          <div
            class="flex w-52 flex-col overflow-y-auto p-1"
            role="listbox"
            aria-label={$t('app.nav.module')}
            data-launcher-col="1"
            data-testid="app-launcher-modules"
          >
            {#each modules as m, i (m.id)}
              <div
                role="option"
                aria-selected={currentModuleId === m.id}
                aria-disabled={m.enabled === false}
                tabindex={colFocusIdx[1] === i ? 0 : -1}
                data-launcher-row
                data-module-id={m.id}
                class={cn(
                  rowBase,
                  menuListHoverNeutral,
                  currentModuleId === m.id && menuListSelectedSurfaceDropdownClasses,
                  m.enabled === false && 'pointer-events-none opacity-50'
                )}
                onfocus={() => {
                  trackFocus(1, i);
                  selectModulePreview(m);
                }}
                onclick={() => selectModulePreview(m)}
                onkeydown={(e) => handleRowKeydown(e, 1, i)}
              >
                <div class="flex size-5 shrink-0 items-center justify-center">
                  <DynamicIcon name={m.icon ?? 'layout-grid'} size={14} />
                </div>
                <span class="min-w-0 flex-1 truncate">{resolveModuleLabel(m, $t)}</span>
                <button
                  type="button"
                  tabindex="-1"
                  class={ctaBtn}
                  aria-label={$t('app.nav.goTo')}
                  data-testid="launcher-cta"
                  onclick={(e) => {
                    e.stopPropagation();
                    void activateModule(m);
                  }}
                >
                  <ArrowUpRight class="size-4" />
                </button>
                <ChevronRight class="size-4 shrink-0 opacity-60" aria-hidden="true" />
              </div>
            {:else}
              <div class="px-2 py-1.5 text-xs text-muted-foreground">—</div>
            {/each}
          </div>

          <!-- Column 3 — Pages of the selected module under the previewed app -->
          <div
            class="flex w-52 flex-col overflow-y-auto p-1"
            role="listbox"
            aria-label={$t('app.nav.links')}
            data-launcher-col="2"
            data-testid="app-launcher-pages"
          >
            {#if pagesLoading}
              <div class="px-2 py-1.5 text-xs text-muted-foreground">
                {$t('app.common.loading')}
              </div>
            {:else}
              {#each previewPages as item, i (item.id)}
                <div
                  role="option"
                  aria-selected={page.url.pathname === item.href}
                  tabindex={colFocusIdx[2] === i ? 0 : -1}
                  data-launcher-row
                  class={cn(
                    rowBase,
                    menuListHoverNeutral,
                    page.url.pathname === item.href && menuListSelectedSurfaceDropdownClasses
                  )}
                  onfocus={() => trackFocus(2, i)}
                  onclick={() => activatePage(item.href)}
                  onkeydown={(e) => handleRowKeydown(e, 2, i)}
                >
                  <div class="flex size-5 shrink-0 items-center justify-center">
                    <DynamicIcon name={item.icon ?? 'circle'} size={14} />
                  </div>
                  <span class="min-w-0 flex-1 truncate">{$t(item.label_key)}</span>
                  <ArrowUpRight class="size-4 shrink-0 opacity-40" aria-hidden="true" />
                </div>
              {:else}
                <div class="px-2 py-1.5 text-xs text-muted-foreground">—</div>
              {/each}
            {/if}
          </div>
        </div>
        <!-- Keyboard hints footer -->
        <div
          class="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground"
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
        </div>
      </Popover.Content>
    </Popover.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
