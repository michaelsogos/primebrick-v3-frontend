<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { PUBLIC_API_ORIGIN } from '$env/static/public';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { Spinner } from '$lib/components/ui/spinner';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { avatarFallbackChromeClasses } from '$lib/avatar-chrome-palette';
  import { userProfileState } from '$lib/user-profile-store.svelte';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import {
    parseConsentParams,
    parseScopes,
    buildApproveUrl,
    buildDenyUrl,
    type McpConsentParams,
  } from '$lib/mcp-oauth';
  import LoginForm from '$lib/components/auth/LoginForm.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import ShieldX from '@lucide/svelte/icons/shield-x';
  import Bot from '@lucide/svelte/icons/bot';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Info from '@lucide/svelte/icons/info';

  // ─── State ─────────────────────────────────────────────────────────────
  let consent_params = $state<McpConsentParams | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let redirecting = $state(false);
  let redirect_message = $state('');
  let user_checked = $state(false);

  const userAvatarSeed = 'PB';
  const avatarChromeFallbackClass = avatarFallbackChromeClasses(userAvatarSeed);

  // ─── Derived ───────────────────────────────────────────────────────────
  const scopes = $derived(consent_params ? parseScopes(consent_params.scope) : []);
  const is_logged_in = $derived(!!userProfileState.current?.idp_code);
  const show_login_form = $derived(user_checked && !is_logged_in && !redirecting);

  // ─── Lifecycle ─────────────────────────────────────────────────────────
  onMount(async () => {
    // Parse OAuth params from the URL
    const params = parseConsentParams(page.url.searchParams);
    if (!params) {
      error = $t('mcp.consent.invalidParams');
      loading = false;
      return;
    }
    consent_params = params;

    // Check if user is already logged in (verify session with BE)
    try {
      const response = await apiFetch('/api/v1/auth/me', { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          userProfileState.current = data.user;
          sessionStorage.setItem('user', JSON.stringify(data.user));
        }
      }
    } catch {
      // Not logged in — that's OK, we'll show the login form
    }
    user_checked = true;
    loading = false;
  });

  // ─── Actions ───────────────────────────────────────────────────────────
  function handleApprove() {
    if (!consent_params) return;
    redirecting = true;
    redirect_message = $t('mcp.consent.approved');
    const approveUrl = buildApproveUrl(consent_params, PUBLIC_API_ORIGIN);
    window.location.href = approveUrl;
  }

  function handleDeny() {
    if (!consent_params) return;
    redirecting = true;
    redirect_message = $t('mcp.consent.denied');
    const denyUrl = buildDenyUrl(consent_params);
    window.location.href = denyUrl;
  }

  function handleLoginSuccess() {
    // After successful login, re-check auth status
    user_checked = false;
    loading = true;
    // Reload to re-run onMount which will check auth
    window.location.reload();
  }
</script>

<div class="min-h-screen flex flex-col bg-background">
  <!-- Header -->
  <header class="border-b border-border px-6 py-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <Avatar class="size-8 rounded-none avatar-hex">
        <AvatarFallback class={cn('rounded-none text-xs font-semibold', avatarChromeFallbackClass)}>
          {userAvatarSeed}
        </AvatarFallback>
      </Avatar>
      <span class="text-lg font-semibold">Primebrick</span>
    </div>
    <div class="flex items-center gap-2">
      <ThemeToggle />
    </div>
  </header>

  <!-- Main content -->
  <main class="flex-1 flex items-center justify-center p-6">
    <div class="w-full max-w-md space-y-6">
      <!-- Loading state -->
      {#if loading}
        <div class="flex flex-col items-center justify-center py-12 gap-3">
          <Spinner class="size-6" />
          <p class="text-sm text-muted-foreground">{$t('common.loading')}</p>
        </div>

      <!-- Error state -->
      {:else if error}
        <Card class="border-destructive/30">
          <CardHeader>
            <CardTitle class="text-xl">{$t('mcp.consent.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <ShieldX class="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

      <!-- Redirecting state -->
      {:else if redirecting}
        <Card>
          <CardContent class="flex flex-col items-center justify-center py-12 gap-3">
            <Spinner class="size-6" />
            <p class="text-sm text-muted-foreground">{redirect_message}</p>
          </CardContent>
        </Card>

      <!-- Login required -->
      {:else if show_login_form}
        <Card>
          <CardHeader class="space-y-1">
            <div class="flex items-center gap-2 mb-1">
              <KeyRound class="size-5 text-muted-foreground" />
              <CardTitle class="text-xl">{$t('mcp.consent.loginRequired')}</CardTitle>
            </div>
            <CardDescription>{$t('mcp.consent.loginFirst')}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Show which client is requesting access -->
            {#if consent_params}
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot class="size-4" />
                <span>{consent_params.mcp_client_name}</span>
              </div>
            {/if}
            <LoginForm onsuccess={handleLoginSuccess} />
          </CardContent>
        </Card>

      <!-- Consent screen -->
      {:else if consent_params}
        <Card class="border-border">
          <CardHeader class="space-y-3">
            <!-- Icon + Title -->
            <div class="flex items-center gap-3">
              <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck class="size-5 text-primary" />
              </div>
              <div>
                <CardTitle class="text-xl">{$t('mcp.consent.title')}</CardTitle>
                <CardDescription class="mt-1">{$t('mcp.consent.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent class="space-y-5">
            <!-- Client info -->
            <div class="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div class="flex size-9 items-center justify-center rounded-md bg-primary/10">
                <Bot class="size-5 text-primary" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-muted-foreground">{$t('mcp.consent.clientName')}</p>
                <p class="text-sm font-medium truncate">{consent_params.mcp_client_name}</p>
              </div>
            </div>

            <!-- Requested scopes -->
            <div class="space-y-2">
              <p class="text-sm font-medium">{$t('mcp.consent.requestedScopes')}</p>
              <div class="space-y-2">
                {#each scopes as scope}
                  <div class="flex items-start gap-2 rounded-md border border-border p-2.5">
                    <div class="mt-0.5 flex size-5 items-center justify-center rounded-full bg-primary/10">
                      <Info class="size-3 text-primary" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <Badge variant="secondary" class="text-[10px] font-mono">{scope.name}</Badge>
                      <p class="mt-1 text-xs text-muted-foreground">{scope.description}</p>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Security note -->
            <Alert>
              <Info class="size-4" />
              <AlertDescription class="text-xs">
                {$t('mcp.consent.securityNote')}
              </AlertDescription>
            </Alert>

            <!-- Action buttons -->
            <div class="flex gap-3 pt-2">
              <Button
                variant="outline"
                class="flex-1"
                onclick={handleDeny}
                disabled={redirecting}
              >
                <ShieldX class="size-4 mr-2" />
                {$t('mcp.consent.denyButton')}
              </Button>
              <Button
                class="flex-1"
                onclick={handleApprove}
                disabled={redirecting}
              >
                <ShieldCheck class="size-4 mr-2" />
                {$t('mcp.consent.approveButton', { client: consent_params.mcp_client_name })}
              </Button>
            </div>
          </CardContent>
        </Card>
      {/if}
    </div>
  </main>
</div>
