<script lang="ts">
  import { getAndClearRedirectUrl } from '$lib/auth/redirect-cache';
  import { backendState, probeHealth } from '$lib/backend-availability';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Spinner } from '$lib/components/ui/spinner';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { APP_VERSION } from '$lib/version';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LangSelect from '$lib/components/LangSelect.svelte';
  import Cloud from '@lucide/svelte/icons/cloud'
  import CloudOff from '@lucide/svelte/icons/cloud-off'
  import Database from '@lucide/svelte/icons/database'
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { apiFetch } from '$lib/api';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import LoginForm from '$lib/components/auth/LoginForm.svelte';

  const health = $derived(backendState.health);
  const healthOffline = $derived(backendState.offline);
  const healthChip = $derived(backendState.healthChip);

  const healthChipLabel = $derived(
    healthChip === 'backend_offline'
      ? $t('shell.health.beOffline')
      : healthChip === 'db_offline'
        ? $t('shell.health.dbOffline')
        : healthChip === 'idp_offline'
          ? $t('shell.health.idpOffline')
          : healthChip === 'ok'
            ? $t('shell.health.beOnline')
            : $t('common.loading')
  );

  const healthChipClass = $derived(
    healthChip === 'backend_offline'
      ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
      : healthChip === 'db_offline'
        ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
        : healthChip === 'idp_offline'
          ? 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300'
          : healthChip === 'ok'
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-border/60 bg-muted/30 text-muted-foreground'
  );

  // Dynamic hero system
  const heroes = $derived([
    {
      image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
      quote: $t('login.hero.quote1'),
      author: $t('login.hero.author1')
    },
    {
      image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80',
      quote: $t('login.hero.quote2'),
      author: $t('login.hero.author2')
    },
    {
      image: 'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1200&q=80',
      quote: $t('login.hero.quote3'),
      author: $t('login.hero.author3')
    },
    {
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80',
      quote: $t('login.hero.quote4'),
      author: $t('login.hero.author4')
    }
  ]);

  let heroIndex = $state(0);
  const currentHero = $derived(heroes[heroIndex]);

  // Login alert — detects ?alert=...&token=... from notification email links
  const alertType = $derived(page.url.searchParams.get('alert'));
  const alertToken = $derived(page.url.searchParams.get('token'));
  const hasAlert = $derived(!!alertType && !!alertToken);

  onMount(() => {
    // Trigger health probe on mount to ensure health status is updated
    probeHealth();

    // Select random hero
    heroIndex = Math.floor(Math.random() * heroes.length);

    // If there's a login alert, notify the BE to send admin alert email
    if (alertType && alertToken) {
      void (async () => {
        try {
          await apiFetch('/api/v1/auth/login-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alert_type: alertType, token: alertToken }),
          });
        } catch (e) {
          console.error('[login] Failed to send login alert:', e);
        }
      })();
    }
  });
</script>

<div class="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
  
  <!-- Right Column: Aesthetic Panel (Hidden on Mobile, Visible on Desktop) -->
  <div class="relative hidden h-full flex-col p-10 text-white lg:flex border-r border-zinc-800 bg-zinc-950 overflow-hidden">
    <!-- Dynamic image with transition -->
    {#key currentHero.image}
      <img 
        src={currentHero.image} 
        alt="PrimeBrick Hero" 
        class="absolute inset-0 h-full w-full object-cover z-0 transition-opacity duration-500" 
      />
    {/key}
    
    <!-- Dark overlay for text contrast -->
    <div class="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-900/75 to-zinc-950/40 z-10"></div>

    <!-- Dynamic quote - vertically centered -->
    <div class="relative z-20 flex-1 flex items-center justify-center">
      <blockquote class="space-y-2">
        <p class="text-xl font-light leading-relaxed text-zinc-100 tracking-wide max-w-lg drop-shadow-md">
          "{currentHero.quote}"
        </p>
        <footer class="text-xs font-mono uppercase tracking-wider text-zinc-400">
          // {currentHero.author}
        </footer>
      </blockquote>
    </div>
  </div>

  <!-- Left Column: Login Form (Always visible) -->
  <div class="lg:p-8 flex min-h-screen flex-col bg-background relative">
    <!-- Top bar: Logo + theme/language selectors (desktop) -->
    <div class="hidden lg:flex items-center justify-between px-8 pt-8">
      <img src="/logo-full-dark.svg" alt="PrimeBrick" width="170" height="32" class="h-8 w-auto" />
      <div class="flex items-center gap-2">
        <LangSelect />
        <ThemeToggle />
      </div>
    </div>

    <!-- Health badge in bottom left (desktop) -->
    <div class="absolute bottom-8 left-8 hidden lg:block">
      <Badge
        variant="outline"
        class={cn('gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium', healthChipClass)}
        title={healthChipLabel}
      >
        {#if healthChip === 'backend_offline'}
          <CloudOff class="size-3.5 opacity-90" />
        {:else if healthChip === 'db_offline'}
          <Database class="size-3.5 opacity-90" />
        {:else if healthChip === 'idp_offline'}
          <ShieldAlert class="size-3.5 opacity-90" />
        {:else if healthChip === 'ok'}
          <Cloud class="size-3.5 opacity-90" />
        {:else}
          <span class="size-3.5 opacity-90">●</span>
        {/if}
        <span>{healthChipLabel}</span>
      </Badge>
    </div>

    <div class="flex flex-1 items-center justify-center">
      <div class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[380px]">
      
      <!-- Mobile header: Logo + theme/language selectors -->
      <div class="flex items-center justify-between lg:hidden">
        <div class="flex items-center gap-3">
          <img src="/logo-full-dark.svg" alt="PrimeBrick" width="170" height="32" class="h-7 w-auto" />
        </div>
        <div class="flex items-center gap-2">
          <LangSelect />
          <ThemeToggle />
        </div>
      </div>

      <!-- Login alert banner (from notification email "if this wasn't you" link) -->
      {#if hasAlert}
        <Alert variant="destructive" class="border-primary-gradient">
          <ShieldAlert class="size-4" />
          <AlertDescription>
            {$t('login.alert.description')}
          </AlertDescription>
        </Alert>
      {/if}

      <!-- Login Card -->
      <Card class="border-primary-gradient shadow-sm">
        <CardHeader class="space-y-1">
          <CardTitle class="text-2xl font-semibold">{$t('login.title')}</CardTitle>
          <CardDescription>{$t('login.description')}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <LoginForm onsuccess={() => {
            const redirectUrl = getAndClearRedirectUrl();
            window.location.href = redirectUrl || '/';
          }} />
        </CardContent>
      </Card>

      <!-- Mobile footer with health badge -->
      <div class="lg:hidden flex items-center justify-center gap-2">
        <Badge
          variant="outline"
          class={cn('gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium', healthChipClass)}
          title={healthChipLabel}
        >
          {#if healthChip === 'backend_offline'}
            <CloudOff class="size-3.5 opacity-90" />
          {:else if healthChip === 'db_offline'}
            <Database class="size-3.5 opacity-90" />
          {:else if healthChip === 'idp_offline'}
            <ShieldAlert class="size-3.5 opacity-90" />
          {:else if healthChip === 'ok'}
            <Cloud class="size-3.5 opacity-90" />
          {:else}
            <span class="size-3.5 opacity-90">●</span>
          {/if}
          <span>{healthChipLabel}</span>
        </Badge>
        <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
          v{APP_VERSION}
        </Badge>
      </div>

    </div>
    </div>

    <!-- Version badge in bottom right (desktop) -->
    <div class="absolute bottom-8 right-8 hidden lg:block">
      <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
        v{APP_VERSION}
      </Badge>
    </div>
  </div>
</div>
