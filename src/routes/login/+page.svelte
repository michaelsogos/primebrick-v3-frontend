<script lang="ts">
  import { z } from 'zod';
  import { superForm, defaults, setError } from 'sveltekit-superforms';
  import { zod4 } from 'sveltekit-superforms/adapters';
  import { apiFetch } from '$lib/api';
  import { getAndClearRedirectUrl } from '$lib/auth/redirect-cache';
  import { backendState, probeHealth } from '$lib/backend-availability';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { FormField, FormLabel, FormControl, FormFieldErrors } from '$lib/components/ui/form';
  import * as Password from '$lib/components/ui/password';
  import { cn } from '$lib/utils';
  import { toast } from 'svelte-sonner';
  import { t } from '$lib/i18n';
  import { avatarFallbackChromeClasses } from '$lib/avatar-chrome-palette';
  import { APP_VERSION } from '$lib/version';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LangSelect from '$lib/components/LangSelect.svelte';
  import { Cloud, CloudOff, Database, ShieldAlert } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import { mapRFC7807ToMessageKey } from '$lib/errors/rfc7807-mapper';
  import { pushRFC7807Error } from '$lib/errors/app-errors';

  // 1. Definisci lo schema Zod
  const loginSchema = z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
  });

  type LoginForm = z.infer<typeof loginSchema>;

  // 2. Configura Superforms in SPA mode
  const superFormObj = superForm(
    defaults(zod4(loginSchema)),
    {
      SPA: true,
      validators: zod4(loginSchema),
      invalidateAll: false,

      // In Superforms, per fare chiamate API asincrone in SPA mode,
      // il posto corretto è `onUpdate` invece di bloccare `onSubmit` col cancel()
      async onUpdate({ form: updateForm }) {
        // Se la validazione Zod fallisce, si ferma qui e mostra gli errori nella UI
        if (!updateForm.valid) return;

        try {
          const response = await apiFetch('/api/v1/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            // Prendi i dati tipizzati e validati direttamente dal form
            body: JSON.stringify(updateForm.data),
          });

          if (!response.ok) {
            const errorData = await response.json();

            // Push error to global error panel (no toast in login page)
            pushRFC7807Error(errorData, { showToast: false });

            // Map error to inline message for 401 (translated)
            if (response.status === 401) {
              const messageKey = mapRFC7807ToMessageKey({
                status: response.status,
                internal_code: errorData.internal_code
              });

              const errorMsg = messageKey ? $t(messageKey) : (errorData.detail || 'Invalid credentials');

              // Use setError for field errors (updates reactive store)
              setError(updateForm, 'username', errorMsg);
              setError(updateForm, 'password', errorMsg);
              // Cannot use superFormObj.message.set() here due to temporal dead zone
              // Will fix by using destructured message after superForm call
            } else if (response.status === 400 && errorData.issues) {
              // Map validation errors from backend using setError
              for (const issue of errorData.issues) {
                const fieldName = issue.path[0];
                setError(updateForm, fieldName, issue.message);
              }
              // Cannot use superFormObj.message.set() here due to temporal dead zone
            } else {
              // Cannot use superFormObj.message.set() here due to temporal dead zone
            }
            return;
          }

          const data = await response.json();

          if (data.success && data.user) {
            sessionStorage.setItem('user', JSON.stringify(data.user));
          }

          const redirectUrl = getAndClearRedirectUrl();
          window.location.href = redirectUrl || '/';

        } catch (error) {
          console.error('[Login Error]', error);
          // Cannot use superFormObj.message.set() here due to temporal dead zone
        }
      }
    }
  );

  const { form, errors, message, enhance, submitting } = superFormObj;

  // Fix temporal dead zone by redefining onUpdate with access to destructured stores
  superFormObj.options.onUpdate = async ({ form: updateForm }) => {
    if (!updateForm.valid) return;

    try {
      const response = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateForm.data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        pushRFC7807Error(errorData, { showToast: false });

        if (response.status === 401) {
          const messageKey = mapRFC7807ToMessageKey({
            status: response.status,
            internal_code: errorData.internal_code
          });
          const errorMsg = messageKey ? $t(messageKey) : (errorData.detail || 'Invalid credentials');
          setError(updateForm, 'username', errorMsg);
          setError(updateForm, 'password', errorMsg);
          message.set(errorMsg);
        } else if (response.status === 400 && errorData.issues) {
          for (const issue of errorData.issues) {
            const fieldName = issue.path[0];
            setError(updateForm, fieldName, issue.message);
          }
          message.set(errorData.detail || 'Validation error');
        } else {
          message.set(errorData.detail || 'Login failed');
        }
        return;
      }

      const data = await response.json();
      if (data.success && data.user) {
        sessionStorage.setItem('user', JSON.stringify(data.user));
      }

      const redirectUrl = getAndClearRedirectUrl();
      window.location.href = redirectUrl || '/';

    } catch (error) {
      console.error('[Login Error]', error);
      message.set('Errore di connessione o login fallito.');
    }
  };

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

  onMount(() => {
    // Trigger health probe on mount to ensure health status is updated
    probeHealth();

    // Select random hero
    heroIndex = Math.floor(Math.random() * heroes.length);
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
    
    <!-- Logo PrimeBrick -->
    <div class="relative z-20 flex items-center text-lg font-medium tracking-tight">
      <Avatar class="size-8 rounded-none avatar-hex mr-3">
        <AvatarFallback class={cn('rounded-none text-xs font-semibold', avatarChromeFallbackClass)}>
          {userAvatarSeed}
        </AvatarFallback>
      </Avatar>
      <span class="text-xl font-semibold">PrimeBrick</span>
    </div>
    
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
  <div class="lg:p-8 flex min-h-screen items-center justify-center bg-background relative">
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
          <form use:enhance>
            <div class="space-y-4">
      <!-- Campo Username -->
      <FormField form={superFormObj} name="username">
        <FormControl>
          <!-- SINTASSI CORRETTA SVELTE 5: Snippet al posto di let:attrs -->
          {#snippet children({ props })}
            <div class="space-y-2">
              <!-- Usiamo props.id anzichè attrs.id -->
              <FormLabel for={props.id}>{$t('login.username')}</FormLabel>
              <Input
                type="text"
                placeholder={$t('login.usernamePlaceholder')}
                bind:value={$form.username}
                {...props}
              />
              <FormFieldErrors />
            </div>
          {/snippet}
        </FormControl>
      </FormField>

      <!-- Campo Password -->
      <FormField form={superFormObj} name="password">
        <FormControl>
          {#snippet children({ props })}
            <div class="space-y-2">
              <FormLabel for={props.id}>{$t('login.password')}</FormLabel>
              <Password.Root>
                <Password.Input
                  placeholder={$t('login.passwordPlaceholder')}
                  bind:value={$form.password}
                  {...props}
                >
                  <Password.ToggleVisibility />
                </Password.Input>
              </Password.Root>
              <FormFieldErrors />
            </div>
          {/snippet}
        </FormControl>
      </FormField>

              {#if $message}
                <div class="text-sm text-destructive">{$message}</div>
              {/if}

              <Button type="submit" class="w-full" disabled={$submitting}>
                {$submitting ? $t('login.buttonLoading') : $t('login.button')}
              </Button>
            </div>
          </form>
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
