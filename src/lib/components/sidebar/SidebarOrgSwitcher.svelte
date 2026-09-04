<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { dropdownMenuSelectedItemClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { apiFetch } from '$lib/api';
  import { onMount } from 'svelte';
  import ImageOff from '@lucide/svelte/icons/image-off';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';

  let { collapsed }: { collapsed: boolean } = $props();

  /** API-backed org switcher. */
  type ActiveOrg = { uuid: string; idp_code: string; idp_name: string; display_name: string; avatar: string | null };
  let activeOrgs: ActiveOrg[] = $state([]);
  let selectedOrgId = $state<string>('');
  const selectedOrg = $derived(activeOrgs.find((o) => o.idp_code === selectedOrgId));
  const selectedOrgLabel = $derived(selectedOrg?.display_name ?? '');

  onMount(async () => {
    try {
      const res = await apiFetch('/api/v1/system/organizations/active');
      if (res.ok) {
        const data = await res.json();
        activeOrgs = data.organizations ?? [];
        if (activeOrgs.length > 0 && !selectedOrgId) {
          selectedOrgId = activeOrgs[0].idp_code;
        }
      }
    } catch (e) {
      console.error('Failed to load active organizations', e);
    }
  });
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
            title={selectedOrgLabel}
            aria-label={$t('app.org.switcherAria')}
          >
            <div
              class="flex size-8 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground"
            >
              {#if selectedOrg?.avatar}
                <Avatar class="size-8 rounded-md">
                  <img src={selectedOrg.avatar} alt={selectedOrg.display_name} class="size-8 rounded-md object-cover" />
                </Avatar>
              {:else}
                <ImageOff class="size-4 opacity-90 text-muted-foreground" aria-hidden="true" />
              {/if}
            </div>
            {#if !collapsed}
              <div class="grid min-w-0 flex-1 text-left leading-tight">
                <span class="truncate text-sm font-semibold">{selectedOrgLabel}</span>
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
        {#each activeOrgs as org (org.idp_code)}
          <DropdownMenu.Item
            class={cn('gap-2', dropdownMenuSelectedItemClass(selectedOrgId === org.idp_code))}
            closeOnSelect={true}
            onSelect={() => {
              selectedOrgId = org.idp_code;
            }}
          >
            <Avatar class="size-6 rounded-none">
              {#if org.avatar}
                <img src={org.avatar} alt={org.display_name} class="size-6 rounded-none object-cover" />
              {:else}
                <AvatarFallback class="rounded-none flex items-center justify-center">
                  <ImageOff class="size-3.5 text-muted-foreground" />
                </AvatarFallback>
              {/if}
            </Avatar>
            <span class="min-w-0 flex-1 truncate">{org.display_name}</span>
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
