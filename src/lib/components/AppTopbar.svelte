<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import LangSelect from '$lib/components/LangSelect.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Bell, Menu, TriangleAlert, X, ThumbsUp, AlertOctagon, AlertTriangle, Info, CircleX, Trash2 } from 'lucide-svelte';
  import XIcon from '@lucide/svelte/icons/x';
  import { appErrors, clearAppErrors } from '$lib/errors/app-errors';

  type ImpactLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

  function impactRank(i: ImpactLevel): number {
    switch (i) {
      case 'CRITICAL':
        return 4;
      case 'HIGH':
        return 3;
      case 'MEDIUM':
        return 2;
      case 'LOW':
        return 1;
    }
  }

  function maxImpact(xs: Array<{ impact?: ImpactLevel }>): ImpactLevel {
    let best: ImpactLevel = 'LOW';
    for (const x of xs) {
      const imp = (x.impact ?? 'MEDIUM') as ImpactLevel;
      if (impactRank(imp) > impactRank(best)) best = imp;
    }
    return best;
  }

  function impactBadgeClass(i: ImpactLevel): string {
    switch (i) {
      case 'CRITICAL':
        return 'bg-red-600 text-white';
      case 'HIGH':
        return 'bg-amber-500 text-black';
      case 'MEDIUM':
        return 'bg-sky-500 text-white';
      case 'LOW':
        return 'bg-emerald-500 text-white';
    }
  }

  function impactCardRing(i: ImpactLevel): string {
    switch (i) {
      case 'CRITICAL':
        return 'border-red-500/30';
      case 'HIGH':
        return 'border-amber-500/30';
      case 'MEDIUM':
        return 'border-sky-500/25';
      case 'LOW':
        return 'border-emerald-500/25';
    }
  }

  function impactIcon(i: ImpactLevel) {
    switch (i) {
      case 'CRITICAL':
        return AlertOctagon;
      case 'HIGH':
        return AlertTriangle;
      case 'MEDIUM':
        return Info;
      case 'LOW':
        return CircleX;
    }
  }

  function impactIconClass(i: ImpactLevel): string {
    switch (i) {
      case 'CRITICAL':
        return 'size-4 text-red-600';
      case 'HIGH':
        return 'size-4 text-amber-600';
      case 'MEDIUM':
        return 'size-4 text-sky-600';
      case 'LOW':
        return 'size-4 text-emerald-600';
    }
  }

  interface $$Props {
    onBurgerClick?: () => void;
    burgerOpen?: boolean;
    unreadNotifications?: number;
  }

  let { onBurgerClick, burgerOpen = false, unreadNotifications = 3 }: $$Props = $props();

  let commandPaletteOpen = $state(false);
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
      <button
        type="button"
        class="relative flex h-8 w-full cursor-pointer items-center rounded-md border border-input bg-background/60 text-left text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent/40 hover:text-accent-foreground"
        aria-haspopup="dialog"
        aria-expanded={commandPaletteOpen}
        aria-label={$t('shell.search.aria')}
        onclick={() => (commandPaletteOpen = true)}
      >
        <span
          class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded-sm bg-background/70 px-1 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          \
        </span>
        <span class="block w-full truncate pl-8 pr-3 text-muted-foreground">{$t('shell.search.placeholder')}</span>
      </button>
    </div>

    <CommandPalette bind:open={commandPaletteOpen} />

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
                {@const mi = maxImpact($appErrors as unknown as Array<{ impact?: ImpactLevel }>)}
                <Badge class={`absolute -right-1 -top-1 h-4 min-w-4 justify-center border-transparent px-1 text-[10px] ${impactBadgeClass(mi)}`}>
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
                  size="icon-sm"
                  disabled={$appErrors.length === 0}
                  onclick={() => clearAppErrors()}
                  aria-label={$t('shell.errors.clear')}
                  title={$t('shell.errors.clear')}
                >
                  <Trash2 class="size-4" />
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
                <div class="grid h-full place-items-center p-3">
                  <div class="relative flex flex-col items-center gap-2 text-center">
                    <div class="pb-watermark-empty">
                      <ThumbsUp class="size-20 text-info" />
                    </div>
                    <div class="text-sm font-medium text-muted-foreground">{$t('shell.errors.empty')}</div>
                  </div>
                </div>
              {:else}
                <div class="space-y-2">
                  {#each $appErrors as e (e.id)}
                    {@const imp = ((e as any).impact ?? 'MEDIUM') as ImpactLevel}
                    {@const Icon = impactIcon(imp)}
                    <div class={`rounded-md border bg-background p-3 ${impactCardRing(imp)}`}>
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex min-w-0 gap-2">
                          <div class="mt-0.5 shrink-0">
                            <Icon class={impactIconClass(imp)} />
                          </div>
                          <div class="min-w-0">
                            {#if (e as any).scopeKey || e.scope}
                              <div class="text-[11px] font-medium text-muted-foreground">
                                {(e as any).scopeKey ? $t((e as any).scopeKey) : e.scope}
                              </div>
                            {/if}
                            <div class="text-sm font-medium text-foreground">
                              {(e as any).messageKey ? $t((e as any).messageKey) : ((e as any).message ?? e.message)}
                            </div>
                            {#if (e as any).tags?.length}
                              <div class="mt-1 flex flex-wrap gap-1">
                                {#each (e as any).tags as tag (tag.label)}
                                  <span
                                    class={tag.tone === 'danger'
                                      ? 'inline-flex items-center rounded border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300'
                                      : tag.tone === 'warning'
                                        ? 'inline-flex items-center rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200'
                                        : tag.tone === 'info'
                                          ? 'inline-flex items-center rounded border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300'
                                          : tag.tone === 'success'
                                            ? 'inline-flex items-center rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300'
                                            : 'inline-flex items-center rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground'}
                                  >
                                    {tag.label}
                                  </span>
                                {/each}
                              </div>
                            {/if}
                            {#if e.detail}
                              <div class="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{e.detail}</div>
                            {/if}
                          </div>
                        </div>
                        <div class="shrink-0 text-[11px] text-muted-foreground">
                          {formatUiDateTime(e.createdAt, $uiLang)}
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

<style>
  @keyframes pb-watermark-pulse {
    0%,
    100% {
      opacity: 0.12;
      transform: translateY(0) scale(1);
    }
    50% {
      opacity: 0.22;
      transform: translateY(-6px) scale(1.06);
    }
  }

  .pb-watermark-empty {
    transform-origin: center;
    animation: pb-watermark-pulse 2.6s ease-in-out infinite;
  }
</style>

