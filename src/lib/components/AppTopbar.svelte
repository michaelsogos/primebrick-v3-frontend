<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { Badge } from '$lib/components/ui/badge';
  import LangSelect from '$lib/components/LangSelect.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import {
    Bell,
    Globe,
    CircleAlert,
    TriangleAlert,
    ThumbsUp,
    Info,
    Trash2
  } from 'lucide-svelte';
  import XIcon from '@lucide/svelte/icons/x';
  import { appErrors } from '$lib/errors/app-errors';
  import { getResolvedIanaTimeZone } from '$lib/browser-iana-timezone';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';

  type ImpactLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

  function errorTagBadgeClass(tone: string | undefined) {
    switch (tone) {
      case 'danger':
        return 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300';
      case 'warning':
        return 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200';
      case 'info':
        return 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300';
      case 'success':
        return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
      default:
        return 'border-border/60 bg-muted/30 text-muted-foreground';
    }
  }

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
        return 'bg-critical text-critical-foreground';
      case 'HIGH':
        return 'bg-destructive text-destructive-foreground';
      case 'MEDIUM':
        return 'bg-warning text-warning-foreground';
      case 'LOW':
        return 'bg-info text-info-foreground';
    }
  }

  function impactToAlertVariant(
    i: ImpactLevel
  ): 'impactCritical' | 'impactHigh' | 'impactMedium' | 'impactLow' {
    switch (i) {
      case 'CRITICAL':
        return 'impactCritical';
      case 'HIGH':
        return 'impactHigh';
      case 'MEDIUM':
        return 'impactMedium';
      case 'LOW':
        return 'impactLow';
    }
  }

  /** Outline icons aligned with `ui/sonner` (CircleAlert for error-class toasts). */
  function impactIcon(i: ImpactLevel) {
    switch (i) {
      case 'CRITICAL':
      case 'HIGH':
        return CircleAlert;
      case 'MEDIUM':
        return TriangleAlert;
      case 'LOW':
        return Info;
    }
  }

  interface $$Props {
    unreadNotifications?: number;
  }

  let { unreadNotifications = 3 }: $$Props = $props();

  let ianaTimeZone = $state<string | null>(null);

  onMount(() => {
    if (!browser) return;
    ianaTimeZone = getResolvedIanaTimeZone();
  });
</script>

<header
  class="sticky top-0 z-30 min-w-0 w-full overflow-visible border-b border-border bg-background text-foreground shadow-sm dark:border-border/60 dark:bg-muted/25 dark:backdrop-blur-sm"
>
  <!-- 1fr | auto | 1fr — same-width side tracks so the palette sits on the true horizontal center of the bar -->
  <div class="grid h-14 min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 sm:px-4">
    <div class="flex min-w-0 justify-start">
      <Sidebar.Trigger aria-label={$t('shell.nav.open')} class="shrink-0" />
    </div>

    <div class="flex min-w-0 justify-center">
      <CommandPalette />
    </div>

    <div class="flex min-w-0 shrink-0 items-center justify-end gap-2">
      {#if ianaTimeZone}
        <span
          class="inline-flex min-w-0 max-w-[min(40vw,10rem)] items-center gap-1.5 sm:max-w-[14rem]"
          title={`${$t('shell.health.ianaTimezone')}: ${ianaTimeZone}`}
          aria-label={`${$t('shell.health.ianaTimezone')}: ${ianaTimeZone}`}
        >
          <Globe class="size-4 shrink-0 text-muted-foreground opacity-80" aria-hidden="true" />
          <span class="truncate text-xs text-muted-foreground">{ianaTimeZone}</span>
        </span>
      {/if}
      <LangSelect />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="relative"
        aria-label={$t('shell.errors.aria')}
        title={$t('shell.errors.aria')}
        onclick={() => openSheet('shell.errors', {}, { contentClass: 'w-[420px] p-0' })}
      >
        <TriangleAlert class="size-4" />
        {#if $appErrors.length > 0}
          {@const mi = maxImpact($appErrors as unknown as Array<{ impact?: ImpactLevel }>)}
          <Badge class={`absolute -right-1 -top-1 h-4 min-w-4 justify-center border-transparent px-1 text-[10px] ${impactBadgeClass(mi)}`}>
            {$appErrors.length > 99 ? '99+' : $appErrors.length}
          </Badge>
        {/if}
      </Button>

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
    </div>
  </div>
</header>

<style>
  /* moved to ErrorsPanel.svelte (sheet content). */
</style>

