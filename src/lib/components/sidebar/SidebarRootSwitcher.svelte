<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import Layers from '@lucide/svelte/icons/layers';

  let { collapsed }: { collapsed: boolean } = $props();

  /**
   * Root-level selection — `{part_of}` from service_registry (e.g.
   * 'system', 'crm'). Selecting a level that the current module does not
   * belong to switches to that level's first module home; inside the same
   * level it's a no-op (keep the deep page).
   */
  async function handleSelectRoot(root: string) {
    if (shellNav.selectedRoot === root) return;
    const first = shellNav.modulesForRoot(root)[0];
    if (!first) return;
    await shellNav.selectModule(first.id);
    void goto(resolve((shellNav.moduleNav?.nav?.[0]?.href ?? first.route_prefixes?.[0] ?? '/') as '/'));
  }

  const selectedLabel = $derived($t(`app.nav.roots.${shellNav.selectedRoot}`));
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuButton
            {...props}
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            title={selectedLabel}
            aria-label={$t('app.nav.rootLevel')}
            data-testid="root-switcher-trigger"
          >
            <div
              class="flex size-8 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground"
            >
              <Layers class="size-4" />
            </div>
            {#if !collapsed}
              <div class="grid min-w-0 flex-1 text-left leading-tight">
                <span class="truncate text-sm font-semibold">{selectedLabel}</span>
              </div>
              <ChevronsUpDown class="ms-auto size-4 shrink-0 opacity-70" aria-hidden="true" />
            {/if}
          </Sidebar.MenuButton>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        class="w-(--bits-dropdown-menu-anchor-width) min-w-56"
        side="right"
        align="end"
      >
        {#each shellNav.roots as root (root)}
          <DropdownMenu.Item
            class={cn('gap-2', dropdownMenuSelectedItemClass(shellNav.selectedRoot === root))}
            closeOnSelect={true}
            onSelect={() => handleSelectRoot(root)}
          >
            <div class="flex size-6 shrink-0 items-center justify-center">
              <Layers class="size-4" />
            </div>
            <span class="min-w-0 flex-1 truncate">{$t(`app.nav.roots.${root}`)}</span>
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
