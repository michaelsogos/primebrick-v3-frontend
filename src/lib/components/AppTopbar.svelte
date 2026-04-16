<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import LangSelect from '$lib/components/LangSelect.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { t } from '$lib/i18n';
  import { Bell, Menu, TriangleAlert, X } from 'lucide-svelte';
  import XIcon from '@lucide/svelte/icons/x';
  import { appErrors, clearAppErrors } from '$lib/errors/app-errors';

  interface $$Props {
    onBurgerClick?: () => void;
    burgerOpen?: boolean;
    unreadNotifications?: number;
  }

  let { onBurgerClick, burgerOpen = false, unreadNotifications = 3 }: $$Props = $props();

  let search = $state('');
  let errorsOpen = $state(false);
</script>

<header class="sticky top-0 z-30 border-b border-border/40 bg-[hsl(var(--topbar-chrome))] text-[hsl(var(--topbar-chrome-foreground))] shadow-sm">
  <div class="flex h-14 items-center gap-3 px-3 sm:px-4">
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="shrink-0"
      aria-label={$t('shell.nav.open')}
      onclick={() => onBurgerClick?.()}
    >
      <span class="relative inline-flex size-5 items-center justify-center">
        <Menu
          class={burgerOpen
            ? 'absolute size-5 rotate-90 scale-75 opacity-0 transition-all duration-200 ease-out'
            : 'absolute size-5 rotate-0 scale-100 opacity-100 transition-all duration-200 ease-out'}
        />
        <X
          class={burgerOpen
            ? 'absolute size-5 rotate-0 scale-100 opacity-100 transition-all duration-200 ease-out'
            : 'absolute size-5 -rotate-90 scale-75 opacity-0 transition-all duration-200 ease-out'}
        />
      </span>
    </Button>

    <div class="mx-auto w-full max-w-xs sm:max-w-sm">
      <div class="relative">
        <span
          class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded-sm bg-background/70 px-1 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          \
        </span>
        <Input
          bind:value={search}
          placeholder={$t('shell.search.placeholder')}
          aria-label={$t('shell.search.aria')}
          class="h-8 bg-background/60 pl-8 text-sm"
        />
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <LangSelect />

      <Sheet.Root bind:open={errorsOpen}>
        <Sheet.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              type="button"
              variant="ghost"
              size="icon"
              class="relative"
              aria-label={$t('shell.errors.aria')}
              title={$t('shell.errors.aria')}
            >
              <TriangleAlert class="size-4" />
              {#if $appErrors.length > 0}
                <Badge class="absolute -right-1 -top-1 h-4 min-w-4 justify-center border-transparent bg-destructive px-1 text-[10px] text-destructive-foreground">
                  {$appErrors.length > 99 ? '99+' : $appErrors.length}
                </Badge>
              {/if}
            </Button>
          {/snippet}
        </Sheet.Trigger>
        <Sheet.Content side="right" class="w-[420px] p-0" showClose={false}>
          <div class="flex h-full flex-col">
            <div class="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div class="text-sm font-medium">{$t('shell.errors.title')}</div>
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={$appErrors.length === 0}
                  onclick={() => clearAppErrors()}
                >
                  {$t('shell.errors.clear')}
                </Button>
                <Sheet.Close
                  class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
                  title={$t('shell.errors.close')}
                >
                  <XIcon class="size-4" />
                </Sheet.Close>
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-auto p-2">
              {#if $appErrors.length === 0}
                <div class="p-3 text-sm text-muted-foreground">{$t('shell.errors.empty')}</div>
              {:else}
                <div class="space-y-2">
                  {#each $appErrors as e (e.id)}
                    <div class="rounded-md border bg-background p-3">
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                          {#if e.scope}
                            <div class="text-[11px] font-medium text-muted-foreground">{e.scope}</div>
                          {/if}
                          <div class="text-sm font-medium text-foreground">{e.message}</div>
                          {#if e.detail}
                            <div class="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{e.detail}</div>
                          {/if}
                        </div>
                        <div class="shrink-0 text-[11px] text-muted-foreground">
                          {new Date(e.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </Sheet.Content>
      </Sheet.Root>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="relative"
        aria-label={$t('shell.notifications.aria')}
      >
        <Bell class="size-4" />
        {#if unreadNotifications > 0}
          <Badge class="absolute -right-1 -top-1 h-4 min-w-4 justify-center border-transparent bg-info px-1 text-[10px] text-info-foreground">
            {unreadNotifications > 99 ? '99+' : unreadNotifications}
          </Badge>
        {/if}
      </Button>

      <ThemeToggle />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button {...props} type="button" variant="ghost" size="icon" aria-label={$t('shell.userMenu.aria')}>
              <Avatar class="size-8">
                <AvatarFallback class="text-xs font-semibold">PB</AvatarFallback>
              </Avatar>
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          <DropdownMenu.Label>{$t('shell.userMenu.title')}</DropdownMenu.Label>
          <DropdownMenu.Separator />
          <DropdownMenu.Item disabled>{$t('shell.userMenu.accountSoon')}</DropdownMenu.Item>
          <DropdownMenu.Item disabled>{$t('shell.userMenu.signOutSoon')}</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  </div>
</header>

