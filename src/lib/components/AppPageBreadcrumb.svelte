<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { isMenuSegment, type AppBreadcrumbSegment, type AppBreadcrumbMenuSegment } from '$lib/breadcrumb/types';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { defaultLeafHref, shellNav } from '$lib/shell/modules-shell.svelte';
  import { APP_ROOT_ICON } from '$lib/shell/app-icons';
  import { ChevronDown } from '@primebrick/ui/vendor/lucide';
  import { DynamicIcon } from '@primebrick/ui';

  /** Ancestor segments only (current page title is shown separately, e.g. in `h1`). A trailing `/` is always rendered after the last segment. */
  let {
    segments
  }: {
    segments: AppBreadcrumbSegment[];
  } = $props();

  /**
   * Root-level segment — the ROUTE's root (`/system/crm/pipeline` shows
   * 'System', not 'CRM'), menu across sibling roots (each item navigates
   * to that root's declared default module's default leaf). Single source
   * of truth:
   * every page gets `root / module / …` without per-page wiring.
   */
  const rootSegment = $derived.by((): AppBreadcrumbMenuSegment | null => {
    const roots = shellNav.roots;
    if (roots.length === 0) return null;
    const current = shellNav.rootForRoute(page.url.pathname);
    return {
      kind: 'menu',
      label: $t(`app.nav.roots.${current}`),
      icon: APP_ROOT_ICON,
      menuAriaLabel: $t('app.nav.rootLevel'),
      items: roots.map((r) => ({
        label: $t(`app.nav.roots.${r}`),
        icon: APP_ROOT_ICON,
        // The root's default module → its declared `default` leaf under
        // this root (post access-filter — first accessible leaf wins).
        href: (defaultLeafHref(shellNav.defaultModuleForRoot(r) ?? {}, r) ?? '/') as '/',
        current: r === current
      }))
    };
  });
  const allSegments = $derived(rootSegment ? [rootSegment, ...segments] : segments);
</script>

{#if allSegments.length > 0}
  <Breadcrumb.Root class="text-xs sm:text-sm">
    <Breadcrumb.List class="gap-x-1.5 gap-y-0.5">
      {#each allSegments as seg, i (i)}
        {#if i > 0}
          <Breadcrumb.Separator class="text-muted-foreground/60">
            <span aria-hidden="true">/</span>
          </Breadcrumb.Separator>
        {/if}
        <Breadcrumb.Item class="max-w-full min-w-0">
          {#if isMenuSegment(seg)}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                class={cn(
                  'inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm border-0 bg-transparent p-0 text-left',
                  'text-muted-foreground hover:text-foreground',
                  'outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                )}
                aria-label={seg.menuAriaLabel ?? seg.label}
              >
                {#if seg.icon}
                  <DynamicIcon name={seg.icon} size={14} class="shrink-0 opacity-70" />
                {/if}
                <span class="truncate">{seg.label}</span>
                <ChevronDown class="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start" class="min-w-48">
                {#each seg.items as item (item.href)}
                  <DropdownMenu.Item
                    class={cn(dropdownMenuSelectedItemClass(item.current), 'flex items-center gap-2')}
                    onSelect={() => {
                      if (!item.current) void goto(resolve(item.href as '/'));
                    }}
                  >
                    {#if item.icon}
                      <DynamicIcon name={item.icon} size={14} class="shrink-0 opacity-70" />
                    {/if}
                    {item.label}
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {:else if seg.href}
            <Breadcrumb.Link href={seg.href} class="inline-flex items-center gap-1 truncate hover:underline">
              {#if seg.icon}
                <DynamicIcon name={seg.icon} size={14} class="shrink-0 opacity-70" />
              {/if}
              <span class="truncate">{seg.label}</span>
            </Breadcrumb.Link>
          {:else}
            <span class="inline-flex items-center gap-1 truncate">
              {#if seg.icon}
                <DynamicIcon name={seg.icon} size={14} class="shrink-0 opacity-70" />
              {/if}
              <span class="truncate">{seg.label}</span>
            </span>
          {/if}
        </Breadcrumb.Item>
      {/each}
      <Breadcrumb.Separator class="text-muted-foreground/60" aria-hidden="true">
        <span>/</span>
      </Breadcrumb.Separator>
    </Breadcrumb.List>
  </Breadcrumb.Root>
{/if}
