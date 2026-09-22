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
  import Bell from '@lucide/svelte/icons/bell'
  import Globe from '@lucide/svelte/icons/globe'
  import CircleAlert from '@lucide/svelte/icons/circle-alert'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import ThumbsUp from '@lucide/svelte/icons/thumbs-up'
  import Info from '@lucide/svelte/icons/info'
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import XIcon from '@lucide/svelte/icons/x';
  import { AiIcon } from '$lib/components/ui/ai-icon';
  import { GradientIcon } from '$lib/components/ui/gradient-icon';
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
  class="sticky top-0 z-30 min-w-0 w-full overflow-visible border-b border-border bg-background text-foreground dark:bg-muted/25 dark:backdrop-blur-xs"
>
  <!-- 1fr | auto | 1fr — same-width side tracks so the palette sits on the true horizontal center of the bar -->
  <div class="grid h-14 min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 sm:px-4">
    <div class="flex min-w-0 justify-start">
      <Sidebar.Trigger aria-label={$t('app.nav.open')} class="shrink-0" />
    </div>

    <div class="flex min-w-0 items-center justify-center gap-2">
      <CommandPalette />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="relative shrink-0"
        aria-label={$t('app.aiChat.aria')}
        title={$t('app.aiChat.aria')}
        onclick={() => openSheet('shell.aiChat', {}, { contentClass: 'w-[600px] p-0' })}
      >
        <AiIcon size={16} />
      </Button>
    </div>

    <div class="flex min-w-0 shrink-0 items-center justify-end gap-2">
      {#if ianaTimeZone}
        <span
          class="inline-flex min-w-0 max-w-[min(40vw,10rem)] items-center gap-1.5 sm:max-w-56"
          title={`${$t('app.health.ianaTimezone')}: ${ianaTimeZone}`}
          aria-label={`${$t('app.health.ianaTimezone')}: ${ianaTimeZone}`}
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
        aria-label={$t('app.errors.aria')}
        title={$t('app.errors.aria')}
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
        aria-label={$t('app.notifications.aria')}
      >
        <Bell class="size-4" />
        {#if unreadNotifications > 0}
          <Badge class="absolute -right-1 -top-1 h-4 min-w-4 justify-center border-transparent bg-info px-1 text-[10px] text-info-foreground">
            {unreadNotifications > 99 ? '99+' : unreadNotifications}
          </Badge>
        {/if}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="relative"
        aria-label={$t('app.aiGuide.aria')}
        title={$t('app.aiGuide.aria')}
        onclick={() => openSheet('shell.aiGuide', {}, { contentClass: 'w-[600px] p-0' })}
      >
        <GradientIcon
          size={16}
          paths={[
            'M12 3V2',
            'M16.066 16.865 7 22l2-11V6a3 3 0 016 0v5l2 11',
            'm19.792 4.5.866-.5',
            'm19.797 13.5.866.5',
            'M21 9h1',
            'M3 9H2',
            'm4.203 13.5-.866.5',
            'M4.208 4.5 3.342 4',
            'M5.5 22h13',
            'm7.932 16.875 7.377-4.178',
            'M8 11h8',
            'M8 7h8',
          ]}
        />
      </Button>

      <ThemeToggle />
    </div>
  </div>
</header>

<style>
  /* moved to ErrorsPanel.svelte (sheet content). */
</style>

