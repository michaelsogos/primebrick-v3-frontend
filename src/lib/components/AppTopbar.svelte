<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { Button } from '@primebrick/ui';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { Badge } from '@primebrick/ui';
  import LangSelect from '$lib/components/LangSelect.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { t } from '$lib/i18n';
  import { Bell } from '@primebrick/ui/vendor/lucide'
  import { Globe } from '@primebrick/ui/vendor/lucide'
  import { TriangleAlert } from '@primebrick/ui/vendor/lucide'
  import { BookOpen } from '@primebrick/ui/vendor/lucide'
  import { AiIcon } from '@primebrick/ui';
  import { GradientIcon, GRADIENT_ICON_PATHS } from '$lib/components/ui/gradient-icon';
  import { appErrors } from '$lib/errors/app-errors';
  import { getResolvedIanaTimeZone } from '@primebrick/ui';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';

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
        return 'bg-critical text-critical-foreground';
      case 'HIGH':
        return 'bg-destructive text-destructive-foreground';
      case 'MEDIUM':
        return 'bg-warning text-warning-foreground';
      case 'LOW':
        return 'bg-info text-info-foreground';
    }
  }

  interface Props {
    unreadNotifications?: number;
  }

  let { unreadNotifications = 3 }: Props = $props();

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
        aria-label={$t('app.ai_chat.aria')}
        title={$t('app.ai_chat.aria')}
        onclick={() => openSheet('shell.aiChat', {})}
      >
        <AiIcon size={16} />
      </Button>
    </div>

    <div class="flex min-w-0 shrink-0 items-center justify-end gap-2">
      {#if ianaTimeZone}
        <span
          class="inline-flex min-w-0 max-w-[min(40vw,10rem)] items-center gap-1.5 sm:max-w-56"
          title={`${$t('app.health.iana_timezone')}: ${ianaTimeZone}`}
          aria-label={`${$t('app.health.iana_timezone')}: ${ianaTimeZone}`}
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
        onclick={() => openSheet('shell.errors', {})}
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
        aria-label={$t('app.ai_guide.aria')}
        title={$t('app.ai_guide.aria')}
        data-testid="app-topbar-guide-ai-cta"
        onclick={() => openSheet('shell.aiGuide', {})}
      >
        <GradientIcon size={16} paths={GRADIENT_ICON_PATHS.lighthouse} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="relative"
        aria-label={$t('app.docs.aria')}
        title={$t('app.docs.aria')}
        data-testid="app-topbar-docs-cta"
        onclick={() => openSheet('shell.docs', {}, { modal: false })}
      >
        <BookOpen class="size-4" />
      </Button>

      <ThemeToggle />
    </div>
  </div>
</header>

<style>
  /* moved to ErrorsPanel.svelte (sheet content). */
</style>

