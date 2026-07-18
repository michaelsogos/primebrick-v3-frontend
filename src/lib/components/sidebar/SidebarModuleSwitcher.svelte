<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import DynamicIcon from '$lib/components/ui/dynamic-icon/DynamicIcon.svelte';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';

  let { collapsed }: { collapsed: boolean } = $props();

  const selectedModule = $derived(
    shellNav.modules.find((m) => m.id === shellNav.selectedModuleId) ?? shellNav.modules[0]
  );
  const selectedLabel = $derived(selectedModule?.name ?? '');
  const selectedIcon = $derived(selectedModule?.icon ?? 'layout-grid');
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
            aria-label={$t('shell.nav.module')}
          >
            <div
              class="flex size-8 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground"
            >
              <DynamicIcon name={selectedIcon} size={16} />
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
        {#each shellNav.modules as m (m.id)}
          <DropdownMenu.Item
            class={cn('gap-2', dropdownMenuSelectedItemClass(shellNav.selectedModuleId === m.id))}
            closeOnSelect={true}
            onSelect={() => {
              void shellNav.selectModule(m.id);
            }}
          >
            <div class="flex size-6 shrink-0 items-center justify-center">
              <DynamicIcon name={m.icon ?? 'layout-grid'} size={16} />
            </div>
            <span class="min-w-0 flex-1 truncate">{m.name}</span>
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
