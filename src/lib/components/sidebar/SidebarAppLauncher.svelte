<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { loadModuleTranslations } from '$lib/i18n/use-module-translations.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { fetchModuleMeta } from '$lib/api';
  import type { ModuleInfo, ModuleNav, ModuleNavLink } from '$lib/api-types';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import DynamicIcon from '$lib/components/ui/dynamic-icon/DynamicIcon.svelte';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import Layers from '@lucide/svelte/icons/layers';
  import Check from '@lucide/svelte/icons/check';
  import { get } from 'svelte/store';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';

  let { collapsed }: { collapsed: boolean } = $props();

  /**
   * Finder-style app launcher — three columns Apps | Modules | Pages.
   *
   * Hover previews the next level (Finder semantics): hovering an app
   * lists its modules, hovering a module lists its pages for THAT app.
   * Click semantics follow the default chain declared in metadata:
   *   app click    → is_default module → its first page under that app
   *   module click → its first page under the previewed app
   *   page click   → direct navigation
   *
   * The current route marks its ancestors in all three columns.
   */

  let open = $state(false);
  // Previewed (hovered/focused) column values — default to the current
  // route's context so the panel always opens on where the user IS.
  let previewApp = $state<string | null>(null);
  let previewModuleId = $state<string | null>(null);

  // Per-module nav cache for the Pages column — `shellNav.moduleNav` only
  // holds the SELECTED module; previewing siblings fetches meta lazily.
  const metaCache = new SvelteMap<string, ModuleNav>();
  const metaLoading = new SvelteSet<string>();

  const currentRoot = $derived(shellNav.rootForRoute(page.url.pathname));
  const currentModuleId = $derived(shellNav.selectedModuleId);
  const activeApp = $derived(previewApp ?? currentRoot);

  const modules = $derived(shellNav.modulesForRoot(activeApp));

  /** The module column's effective selection — the hovered preview, else
   *  the current module when it belongs to the previewed app, else the
   *  app's declared default (the target of an app click). */
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
        // Preview stays empty — the module may be offline; the click path
        // still surfaces the real error via selectModule/moduleNavError.
      })
      .finally(() => {
        metaLoading.delete(moduleId);
      });
    void loadModuleTranslations(moduleId, get(uiLang));
  }

  function handleHoverApp(root: string) {
    previewApp = root;
    previewModuleId = null;
    // The Pages column previews this app's default module — prefetch its
    // meta so column 3 is populated when the pointer reaches it.
    const dflt = shellNav.defaultModuleForRoot(root);
    if (dflt) ensureModuleData(dflt.id);
  }

  function handleHoverModule(m: ModuleInfo) {
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

  async function handleAppClick(root: string) {
    const m = shellNav.defaultModuleForRoot(root);
    if (!m) return;
    open = false;
    ensureModuleData(m.id);
    await shellNav.selectModule(m.id);
    void goto(resolve(moduleHomeInApp(m, root) as '/'));
  }

  async function handleModuleClick(m: ModuleInfo) {
    const root = activeApp;
    open = false;
    ensureModuleData(m.id);
    await shellNav.selectModule(m.id);
    void goto(resolve(moduleHomeInApp(m, root) as '/'));
  }

  function handlePageClick(href: string) {
    open = false;
    void goto(resolve(href as '/'));
  }

  /** Reset preview to the current route context on every open. */
  function handleOpenChange(next: boolean) {
    open = next;
    if (next) {
      previewApp = null;
      previewModuleId = null;
      if (currentModuleId) ensureModuleData(currentModuleId);
    }
  }

  const appLabel = $derived($t(`app.nav.roots.${currentRoot}`));
  const moduleLabel = $derived(
    shellNav.modules.find((m) => m.id === currentModuleId)?.name ?? $t('app.nav.module')
  );
  const triggerLabel = $derived(`${appLabel} / ${moduleLabel}`);

  const itemBase =
    'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground';
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
        <div class="flex divide-x divide-border">
          <!-- Column 1 — Applications (root levels) -->
          <div
            class="flex max-h-80 w-48 flex-col overflow-y-auto p-1"
            role="listbox"
            aria-label={$t('app.nav.rootLevel')}
            data-testid="app-launcher-apps"
          >
            {#each shellNav.roots as root (root)}
              <button
                type="button"
                role="option"
                aria-selected={currentRoot === root}
                class={cn(itemBase, currentRoot === root && 'bg-sidebar-accent/60 font-medium')}
                onmouseenter={() => handleHoverApp(root)}
                onfocus={() => handleHoverApp(root)}
                onclick={() => handleAppClick(root)}
              >
                <div class="flex size-5 shrink-0 items-center justify-center">
                  <Layers class="size-3.5" />
                </div>
                <span class="min-w-0 flex-1 truncate">{$t(`app.nav.roots.${root}`)}</span>
                {#if currentRoot === root}
                  <Check class="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                {/if}
              </button>
            {/each}
          </div>

          <!-- Column 2 — Modules of the previewed app -->
          <div
            class="flex max-h-80 w-52 flex-col overflow-y-auto p-1"
            role="listbox"
            aria-label={$t('app.nav.module')}
            data-testid="app-launcher-modules"
          >
            {#each modules as m (m.id)}
              <button
                type="button"
                role="option"
                aria-selected={currentModuleId === m.id}
                disabled={m.enabled === false}
                class={cn(
                  itemBase,
                  currentModuleId === m.id && 'bg-sidebar-accent/60 font-medium',
                  m.enabled === false && 'cursor-not-allowed opacity-50'
                )}
                onmouseenter={() => handleHoverModule(m)}
                onfocus={() => handleHoverModule(m)}
                onclick={() => handleModuleClick(m)}
              >
                <div class="flex size-5 shrink-0 items-center justify-center">
                  <DynamicIcon name={m.icon ?? 'layout-grid'} size={14} />
                </div>
                <span class="min-w-0 flex-1 truncate">{m.name}</span>
                {#if currentModuleId === m.id}
                  <Check class="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                {/if}
              </button>
            {:else}
              <div class="px-2 py-1.5 text-xs text-muted-foreground">—</div>
            {/each}
          </div>

          <!-- Column 3 — Pages of the active module under the previewed app -->
          <div
            class="flex max-h-80 w-52 flex-col overflow-y-auto p-1"
            role="listbox"
            aria-label={$t('app.nav.links')}
            data-testid="app-launcher-pages"
          >
            {#if pagesLoading}
              <div class="px-2 py-1.5 text-xs text-muted-foreground">
                {$t('app.common.loading')}
              </div>
            {:else}
              {#each previewPages as item (item.id)}
                <button
                  type="button"
                  role="option"
                  aria-selected={page.url.pathname === item.href}
                  class={cn(
                    itemBase,
                    page.url.pathname === item.href && 'bg-sidebar-accent/60 font-medium'
                  )}
                  onclick={() => handlePageClick(item.href)}
                >
                  <div class="flex size-5 shrink-0 items-center justify-center">
                    <DynamicIcon name={item.icon ?? 'circle'} size={14} />
                  </div>
                  <span class="min-w-0 flex-1 truncate">{$t(item.label_key)}</span>
                  {#if page.url.pathname === item.href}
                    <Check class="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                  {/if}
                </button>
              {:else}
                <div class="px-2 py-1.5 text-xs text-muted-foreground">—</div>
              {/each}
            {/if}
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
