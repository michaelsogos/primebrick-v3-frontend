<script lang="ts">
  import { apiFetch } from '$lib/api';
  import { getAndClearRedirectUrl } from '$lib/auth/redirect-cache';
  import { backendState, probeHealth } from '$lib/backend-availability';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { cn } from '$lib/utils';
  import { toast } from 'svelte-sonner';
  import { t } from '$lib/i18n';
  import { avatarFallbackChromeClasses } from '$lib/avatar-chrome-palette';
  import { APP_VERSION } from '$lib/version';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LangSelect from '$lib/components/LangSelect.svelte';
  import { Cloud, CloudOff, Database, ShieldAlert } from 'lucide-svelte';
  import { onMount } from 'svelte';

  let username = $state('');
  let password = $state('');
  let isLoading = $state(false);

  const userAvatarSeed = 'PB';
  const avatarChromeFallbackClass = avatarFallbackChromeClasses(userAvatarSeed);

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

  onMount(() => {
    // Trigger health probe on mount to ensure health status is updated
    probeHealth();
  });

  async function handleLogin() {
    if (!username || !password) {
      toast.error($t('login.error'));
      return;
    }

    isLoading = true;
    try {
      // Call Casdoor OAuth token endpoint
      const formData = new URLSearchParams();
      formData.append('grant_type', 'password');
      formData.append('client_id', 'primebrick-api');
      formData.append('client_secret', 'TODO'); // This should come from backend config
      formData.append('username', username);
      formData.append('password', password);
      formData.append('scope', 'openid profile email');

      const response = await fetch('http://localhost:8000/api/login/oauth/access-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();
      
      // Save token to cookie or localStorage
      // TODO: Implement proper token storage
      
      // Redirect to saved URL or default
      const redirectUrl = getAndClearRedirectUrl();
      window.location.href = redirectUrl || '/';
    } catch (error) {
      toast.error($t('login.invalidCredentials'));
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
  
  <!-- Right Column: Aesthetic Panel (Hidden on Mobile, Visible on Desktop) -->
  <div class="relative hidden h-full flex-col bg-zinc-900 p-10 text-white dark:border-r lg:flex">
    <!-- Background gradient -->
    <div class="absolute inset-0 bg-gradient-to-b from-zinc-900 to-black z-0"></div>
    
    <!-- Logo in top left of panel -->
    <div class="relative z-20 flex items-center text-lg font-medium tracking-tight">
      <Avatar class="size-8 rounded-none avatar-hex mr-3">
        <AvatarFallback class={cn('rounded-none text-xs font-semibold', avatarChromeFallbackClass)}>
          {userAvatarSeed}
        </AvatarFallback>
      </Avatar>
      <span class="text-xl font-semibold">PrimeBrick</span>
    </div>
    
    <!-- Quote in bottom left -->
    <div class="relative z-20 mt-auto">
      <blockquote class="space-y-2">
        <p class="text-lg font-light text-zinc-300">
          "The solid, modular, and efficient management platform for complete control of your projects."
        </p>
      </blockquote>
    </div>

    <!-- Health badge in bottom left -->
    <div class="relative z-20 mt-auto">
      <Badge
        variant="outline"
        class={cn('gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium bg-transparent border-zinc-700 text-zinc-300', healthChipClass)}
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
  </div>

  <!-- Left Column: Login Form (Always visible) -->
  <div class="lg:p-8 flex min-h-screen items-center justify-center bg-background relative">
    <!-- Theme and language selectors in top right (desktop) -->
    <div class="absolute top-8 right-8 hidden lg:flex items-center gap-2">
      <ThemeToggle />
      <LangSelect />
    </div>

    <div class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[380px]">
      
      <!-- Mobile header: Logo + theme/language selectors -->
      <div class="flex items-center justify-between lg:hidden">
        <div class="flex items-center gap-3">
          <Avatar class="size-8 rounded-none avatar-hex">
            <AvatarFallback class={cn('rounded-none text-xs font-semibold', avatarChromeFallbackClass)}>
              {userAvatarSeed}
            </AvatarFallback>
          </Avatar>
          <span class="text-xl font-semibold">PrimeBrick</span>
        </div>
        <div class="flex items-center gap-2">
          <ThemeToggle />
          <LangSelect />
        </div>
      </div>

      <!-- Login Card -->
      <Card class="border-border">
        <CardHeader class="space-y-1">
          <CardTitle class="text-2xl font-semibold">{$t('login.title')}</CardTitle>
          <CardDescription>{$t('login.description')}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <Label for="username">{$t('login.username')}</Label>
            <Input id="username" type="text" bind:value={username} placeholder={$t('login.usernamePlaceholder')} />
          </div>
          <div class="space-y-2">
            <Label for="password">{$t('login.password')}</Label>
            <Input id="password" type="password" bind:value={password} placeholder={$t('login.passwordPlaceholder')} />
          </div>
          <Button class="w-full" onclick={handleLogin} disabled={isLoading}>
            {isLoading ? $t('login.buttonLoading') : $t('login.button')}
          </Button>
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

    <!-- Version badge in bottom right (desktop) -->
    <div class="absolute bottom-8 right-8 hidden lg:block">
      <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
        v{APP_VERSION}
      </Badge>
    </div>
  </div>
</div>
