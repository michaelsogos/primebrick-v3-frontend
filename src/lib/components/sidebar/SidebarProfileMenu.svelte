<script lang="ts">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { avatarFallbackChromeClasses, computeAvatarGradient } from '$lib/avatar-chrome-palette';
  import { goto } from '$app/navigation';
  import type { UserProfile } from '$lib/user-profile-store.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Settings from '@lucide/svelte/icons/settings';

  let {
    user,
    collapsed,
    onLogout
  }: {
    user: UserProfile | null;
    collapsed: boolean;
    onLogout: () => void;
  } = $props();

  const userName = $derived(user?.display_name);
  const userEmail = $derived(user?.email);
  const avatarStyle = $derived.by(() => {
    const color = user?.avatar_color;
    if (!color) return null;
    const g = computeAvatarGradient(color);
    return {
      style: `background: linear-gradient(135deg, ${g.start}, ${g.end}); color: ${g.textColor};`,
      class: 'rounded-none text-xs font-semibold'
    };
  });
  const userAvatarSeed = $derived(user?.avatar_initials);
  const avatarChromeFallbackClass = $derived(avatarFallbackChromeClasses(userAvatarSeed || 'PB'));
</script>

{#if user}
  <Sidebar.Menu>
    <Sidebar.MenuItem>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Sidebar.MenuButton
              {...props}
              size="lg"
              title={userName}
              class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div class={cn('flex items-center', collapsed && 'w-full justify-center')}>
                <Avatar class={cn(collapsed ? 'size-7' : 'size-8', 'rounded-none avatar-hex')}>
                  {#if avatarStyle}
                    <AvatarFallback class={avatarStyle.class} style={avatarStyle.style}>
                      {userAvatarSeed}
                    </AvatarFallback>
                  {:else}
                    <AvatarFallback class={cn('rounded-none text-xs font-semibold', avatarChromeFallbackClass)}>
                      {userAvatarSeed}
                    </AvatarFallback>
                  {/if}
                </Avatar>
              </div>

              {#if !collapsed}
                <div class="grid min-w-0 flex-1 text-left leading-tight">
                  <span class="truncate text-sm font-medium">{userName}</span>
                </div>
              {/if}

              <ChevronsUpDown class="ms-auto size-4 shrink-0 opacity-70 group-data-[collapsible=icon]:hidden" />
            </Sidebar.MenuButton>
          {/snippet}
        </DropdownMenu.Trigger>

        <DropdownMenu.Content
          side="right"
          align="end"
          class="w-(--bits-dropdown-menu-anchor-width) min-w-56"
        >
          <DropdownMenu.Label class="p-0 font-normal">
            <div class="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
              <Avatar class="size-8 rounded-none avatar-hex">
                {#if avatarStyle}
                  <AvatarFallback class={avatarStyle.class} style={avatarStyle.style}>
                    {userAvatarSeed}
                  </AvatarFallback>
                {:else}
                  <AvatarFallback class={cn('rounded-none text-xs font-semibold', avatarChromeFallbackClass)}>
                    {userAvatarSeed}
                  </AvatarFallback>
                {/if}
              </Avatar>
              <div class="grid flex-1 text-left leading-tight">
                <span class="truncate font-medium">{userName}</span>
                <span class="truncate text-xs text-muted-foreground">{userEmail}</span>
              </div>
            </div>
          </DropdownMenu.Label>

          <DropdownMenu.Separator />

          <DropdownMenu.Group>
            <DropdownMenu.Item
              closeOnSelect={true}
              onSelect={() => { void shellNav.selectModule('settings'); void goto('/system/settings/profile'); }}
            >
              <Settings class="size-4 shrink-0" />
              <span>{$t('app.userMenu.itemSettings')}</span>
            </DropdownMenu.Item>
          </DropdownMenu.Group>

          <DropdownMenu.Separator />

          <DropdownMenu.Item variant="destructive" onclick={onLogout}>
            <LogOut />
            <span>{$t('app.userMenu.itemSignOut')}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </Sidebar.MenuItem>
  </Sidebar.Menu>
{/if}
