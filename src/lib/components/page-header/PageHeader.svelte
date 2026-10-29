<script lang="ts">
  /**
   * PageHeader — THE page header chrome, rendered once by `AppShell` above
   * every `(app)` page body. FIXED anatomy (no open extras/actions slots —
   * deferred until a real consumer needs them with proper semantics):
   *
   *   breadcrumb (auto from census/nav) · ★ favorite toggle · h1 (decl
   *   label/title) · route description (`description_key`) · presence area
   *
   * Nothing in a `+page.svelte` can produce or suppress this chrome — the
   * ONLY opt-out is the declaration's `chrome: 'remote'` flag for remote
   * pages that intentionally own their complete chrome.
   *
   * Presence area: the reserved right-side zone the collaboration feature
   * renders into (avatars/status) — the first sanctioned consumer.
   */
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { moduleBreadcrumbSegments } from '$lib/breadcrumb/module-breadcrumb';
  import { useRouteDecl } from '$lib/composables/useRouteDecl.svelte';
  import { userPreferences } from '$lib/composables/useUserPreferences.svelte';
  import { entityApiBase } from '$lib/api';
  import { fetchEntityMeta } from '$lib/entity-list/meta-cache';
  import { entityPageTitle } from '$lib/utils/entity-meta';
  import type { EntityMeta } from '$lib/entity-list/types';
  import { flattenNavLeaves, shellNav } from '$lib/shell/modules-shell.svelte';
  import { GradientIcon } from '$lib/components/ui/gradient-icon';
  import { Star } from '@primebrick/ui/vendor/lucide';
  import PresenceAvatars from '$lib/components/collaboration/PresenceAvatars.svelte';

  const { decl } = useRouteDecl();
  const routeDecl = $derived(decl());

  /** Decl opt-out — remote pages may own their complete chrome. */
  const hostChrome = $derived(routeDecl?.chrome !== 'remote');

  /**
   * Entity-meta — needed for the title fallback AND for the presence mount
   * (`collaboration.enabled`). Meta-cache dedupes against the archetype's
   * own fetch, so resolving it here costs nothing on entity pages.
   */
  let meta = $state<EntityMeta | null>(null);
  $effect(() => {
    const entity = routeDecl?.entity;
    meta = null;
    if (!entity || (routeDecl?.label_key && routeDecl?.kind !== 'detail')) return;
    let cancelled = false;
    void fetchEntityMeta(entityApiBase(entity))
      .then((m) => {
        if (!cancelled) meta = m;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  });

  /**
   * Title resolution — `decl.label_key` → nav-link `label_key` (href match
   * on the selected module's flattened nav) → `entityPageTitle(meta)` for
   * entity-bound decls. The nav leaf only matches list/custom hrefs;
   * create/detail fall through to the entity template (meta-cached).
   */
  const routePath = $derived(page.url.pathname);
  const title = $derived.by((): string | null => {
    if (!routeDecl) return null;
    if (routeDecl.label_key) return $t(routeDecl.label_key);
    const leaf = flattenNavLeaves(shellNav.moduleNav?.nav ?? []).find(
      (l) => l.href === routePath,
    );
    if (leaf) return $t(leaf.label_key);
    if (routeDecl.entity && meta) {
      const kind =
        routeDecl.kind === 'create' ? 'create' : routeDecl.kind === 'detail' ? 'edit' : 'list';
      return entityPageTitle(meta, kind, $t);
    }
    return null;
  });

  const description = $derived(
    routeDecl?.description_key ? $t(routeDecl.description_key) : null,
  );

  /**
   * Presence mount — update surfaces only (`kind: 'detail'` holding a record
   * uuid) with `collaboration.enabled` meta. Create/list/other archetypes
   * render nothing (see ai-plans/collaboration-visual-merge archetype scope).
   * The uuid is the pathname segment matching the decl's `[param]` slot.
   */
  const presence = $derived.by((): { entity: string; uuid: string } | null => {
    const entity = routeDecl?.entity;
    if (!entity || routeDecl?.kind !== 'detail' || !meta?.collaboration?.enabled) return null;
    const p = routeDecl!.route.split('/').filter(Boolean);
    const u = page.url.pathname.split('/').filter(Boolean);
    const idx = p.findIndex((s) => s.startsWith('[') && s.endsWith(']'));
    const uuid = idx >= 0 ? u[idx] : undefined;
    return uuid ? { entity, uuid } : null;
  });

  const segments = $derived(
    moduleBreadcrumbSegments({ pathname: page.url.pathname, t: (key) => $t(key) }),
  );

  /**
   * Favorites store the CONCRETE pathname — a detail-page favorite
   * remembers its row, a create favorite is a shortcut to the form.
   */
  const favorite = $derived(routeDecl !== null && userPreferences.isFavorite(routePath));
  let starBusy = $state(false);

  async function toggleFavorite() {
    if (starBusy || !routeDecl) return;
    starBusy = true;
    try {
      await userPreferences.toggleFavorite(routePath);
    } finally {
      starBusy = false;
    }
  }

  // Lucide `star` path — stroked empty or gradient-filled when favorite.
  const starPaths = [
    'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
  ];
  const amberStops = ['#fbbf24', '#fb923c', '#fbbf24'];
</script>

<svelte:head>
  {#if hostChrome && title}
    <title>{title} · Primebrick</title>
  {/if}
</svelte:head>

{#if hostChrome}
  <header
    class="flex shrink-0 items-end justify-between gap-3 p-2 pb-2 sm:px-3 sm:pt-3 sm:pb-1"
    data-testid="page-header"
  >
    <div class="min-w-0 space-y-2">
      <AppPageBreadcrumb {segments} />
      {#if title}
        <div class="flex items-center gap-1.5">
          {#if routeDecl}
            <button
              type="button"
              class="inline-flex shrink-0 items-center justify-center rounded-sm p-0.5 outline-hidden transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              aria-label={favorite ? $t('app.favorites.remove') : $t('app.favorites.add')}
              aria-pressed={favorite}
              title={favorite ? $t('app.favorites.remove') : $t('app.favorites.add')}
              disabled={starBusy}
              data-testid="page-header-favorite-toggle"
              onclick={() => void toggleFavorite()}
            >
              {#if favorite}
                <GradientIcon size={18} paths={starPaths} stops={amberStops} filled stroke_width={1.5} />
              {:else}
                <Star size={18} class="text-muted-foreground" />
              {/if}
            </button>
          {/if}
          <h1 class="truncate text-xl font-semibold leading-tight" data-testid="page-header-title">
            {title}
          </h1>
        </div>
      {/if}
      {#if description}
        <p class="text-sm text-muted-foreground" data-testid="page-header-description">
          {description}
        </p>
      {/if}
    </div>
    <!-- Presence area — the reserved collaboration zone (avatars/status).
         The presence consumer renders here; nothing else may. -->
    <div class="flex shrink-0 items-center gap-2" data-testid="page-header-presence">
      {#if presence}
        <!-- #key remounts on record change → LEAVE old entity + READING new. -->
        {#key `${presence.entity}:${presence.uuid}`}
          <PresenceAvatars entity={presence.entity} uuid={presence.uuid} />
        {/key}
      {/if}
    </div>
  </header>
{/if}
