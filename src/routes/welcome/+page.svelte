<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { Spinner } from '$lib/components/ui/spinner';
  import * as Password from '$lib/components/ui/password';
  import PasswordChecklist from '$lib/components/forms/PasswordChecklist.svelte';
  import { usePasswordPolicy } from '$lib/composables/usePasswordPolicy.svelte';
  import { authConfigState } from '$lib/auth-config-store.svelte';
  import { isWebauthnSupported } from '$lib/webauthn/codec';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LangSelect from '$lib/components/LangSelect.svelte';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Fingerprint from '@lucide/svelte/icons/fingerprint';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import MailCheck from '@lucide/svelte/icons/mail-check';
  import Lock from '@lucide/svelte/icons/lock';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';

  // ─── Password policy ────────────────────────────────────────────────────────
  const passwordPolicy = usePasswordPolicy();

  // ─── State ──────────────────────────────────────────────────────────────────
  type Step = 'loading' | 'verify' | 'otp-sent' | 'otp-verified' | 'complete' | 'error' | 'expired';

  const _state = $state({
    step: 'loading' as Step,
    token: '' as string,
    display_name: '' as string,
    expires_at: '' as string,
    otp_code: '' as string,
    new_password: '' as string,
    confirm_password: '' as string,
    submitting: false as boolean,
    error_message: '' as string,
    resend_cooldown: 0 as number,
  });

  // ─── Derived: passkey enrollment availability ───────────────────────────────
  const webauthnEnabled = $derived(authConfigState.config?.enable_webauthn ?? false);
  const webauthnSupported = $derived(isWebauthnSupported());
  const passkeyRequired = $derived(authConfigState.config?.passkey_required ?? false);
  const showPasskeyStep = $derived(webauthnEnabled && webauthnSupported);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const passwordValid = $derived(
    passwordPolicy.state.loaded &&
    passwordPolicy.regex.test(_state.new_password),
  );

  const passwordsMatch = $derived(
    _state.new_password.length > 0 &&
    _state.new_password === _state.confirm_password,
  );

  const canComplete = $derived(
    _state.step === 'otp-verified' &&
    passwordValid &&
    passwordsMatch &&
    !_state.submitting,
  );

  const canVerifyOtp = $derived(
    _state.otp_code.length === 6 &&
    !_state.submitting,
  );

  // ─── Token extraction ───────────────────────────────────────────────────────
  // The token is passed via URL fragment (#token=xxx) to prevent leakage via
  // Referer headers or server logs. The page sets Referrer-Policy: no-referrer.
  function extractTokenFromFragment(): string {
    if (typeof window === 'undefined') return '';
    const hash = window.location.hash;
    if (!hash) return '';
    // Remove leading #
    const query = hash.startsWith('#') ? hash.slice(1) : hash;
    const params = new URLSearchParams(query);
    return params.get('token') ?? '';
  }

  // ─── API calls ──────────────────────────────────────────────────────────────
  async function verifyToken() {
    _state.submitting = true;
    _state.error_message = '';
    try {
      const res = await apiFetch('/api/v1/auth/welcome/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: _state.token }),
      });

      const data = await res.json();
      if (res.ok && data.valid) {
        _state.display_name = data.display_name;
        _state.expires_at = data.expires_at;
        // Automatically send OTP after token verification
        await sendOtp();
      } else {
        _state.step = 'error';
        _state.error_message = $t('welcome.error.invalidToken');
      }
    } catch (err) {
      _state.step = 'error';
      _state.error_message = $t('welcome.error.networkError');
    } finally {
      _state.submitting = false;
    }
  }

  async function sendOtp() {
    _state.submitting = true;
    _state.error_message = '';
    try {
      const res = await apiFetch('/api/v1/auth/welcome/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: _state.token }),
      });

      const data = await res.json();
      if (res.ok && data.sent) {
        _state.step = 'otp-sent';
        startResendCooldown();
      } else {
        _state.error_message = $t('welcome.error.otpSendFailed');
      }
    } catch (err) {
      _state.error_message = $t('welcome.error.networkError');
    } finally {
      _state.submitting = false;
    }
  }

  async function verifyOtp() {
    _state.submitting = true;
    _state.error_message = '';
    try {
      const res = await apiFetch('/api/v1/auth/welcome/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: _state.token, otp_code: _state.otp_code }),
      });

      const data = await res.json();
      if (res.ok && data.verified) {
        _state.step = 'otp-verified';
      } else {
        _state.error_message = $t('welcome.error.otpInvalid');
      }
    } catch (err) {
      _state.error_message = $t('welcome.error.networkError');
    } finally {
      _state.submitting = false;
    }
  }

  async function completeInvitation() {
    _state.submitting = true;
    _state.error_message = '';
    try {
      const res = await apiFetch('/api/v1/auth/welcome/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: _state.token,
          otp_code: _state.otp_code,
          new_password: _state.new_password,
        }),
      });

      if (res.ok) {
        _state.step = 'complete';
      } else {
        const errorData = await res.json();
        pushNotification({ ...errorData, toast: false });
        _state.error_message = errorData.detail ?? $t('welcome.error.completeFailed');
      }
    } catch (err) {
      _state.error_message = $t('welcome.error.networkError');
    } finally {
      _state.submitting = false;
    }
  }

  // ─── Resend cooldown ────────────────────────────────────────────────────────
  let cooldownTimer: ReturnType<typeof setInterval> | null = null;

  function startResendCooldown() {
    _state.resend_cooldown = 30;
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      _state.resend_cooldown--;
      if (_state.resend_cooldown <= 0) {
        if (cooldownTimer) {
          clearInterval(cooldownTimer);
          cooldownTimer = null;
        }
      }
    }, 1000);
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────
  onMount(() => {
    // Set Referrer-Policy via meta tag (defensive — the BE also sets it)
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);

    // Load password policy
    void passwordPolicy.load();

    // Extract token from URL fragment
    _state.token = extractTokenFromFragment();
    if (!_state.token) {
      _state.step = 'error';
      _state.error_message = $t('welcome.error.noToken');
      return;
    }

    // Verify the token
    void verifyToken();
  });

  // ─── Actions ────────────────────────────────────────────────────────────────
  function handleVerifyOtp() {
    if (canVerifyOtp) void verifyOtp();
  }

  function handleComplete() {
    if (canComplete) void completeInvitation();
  }

  function handleResendOtp() {
    if (_state.resend_cooldown <= 0) void sendOtp();
  }

  function handleGoToLogin() {
    void goto('/login');
  }

  // ─── Passkey step is informational only ─────────────────────────────────────
  // The actual enrollment happens after login via the PasskeyPromptDialog,
  // because the WebAuthn signup endpoints require an authenticated session.
</script>

<svelte:head>
  <title>{$t('welcome.title')} — Primebrick</title>
  <meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="min-h-screen flex flex-col bg-background">
  <!-- Top bar -->
  <div class="flex items-center justify-between px-6 py-4 border-b border-border">
    <div class="flex items-center gap-2">
      <ShieldCheck class="w-5 h-5 text-primary" />
      <span class="font-semibold text-sm">Primebrick</span>
    </div>
    <div class="flex items-center gap-2">
      <LangSelect />
      <ThemeToggle />
    </div>
  </div>

  <!-- Main content -->
  <div class="flex-1 flex items-center justify-center p-6">
    <div class="w-full max-w-md">
      <!-- Loading state -->
      {#if _state.step === 'loading'}
        <Card>
          <CardContent class="flex flex-col items-center justify-center py-12">
            <Spinner class="w-8 h-8" />
            <p class="mt-4 text-sm text-muted-foreground">{$t('welcome.verifying')}</p>
          </CardContent>
        </Card>
      {/if}

      <!-- Error state -->
      {#if _state.step === 'error'}
        <Card>
          <CardHeader>
            <div class="flex items-center gap-2">
              <AlertCircle class="w-5 h-5 text-destructive" />
              <CardTitle>{$t('welcome.error.title')}</CardTitle>
            </div>
            <CardDescription>{_state.error_message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onclick={handleGoToLogin} variant="outline" class="w-full">
              <ArrowLeft class="w-4 h-4 mr-2" />
              {$t('welcome.error.backToLogin')}
            </Button>
          </CardContent>
        </Card>
      {/if}

      <!-- OTP sent — enter OTP code -->
      {#if _state.step === 'otp-sent'}
        <Card>
          <CardHeader>
            <div class="flex items-center gap-2">
              <MailCheck class="w-5 h-5 text-primary" />
              <CardTitle>{$t('welcome.otp.title')}</CardTitle>
            </div>
            <CardDescription>
              {$t('welcome.otp.description', { values: { name: _state.display_name } })}
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            {#if _state.error_message}
              <Alert variant="destructive">
                <AlertDescription>{_state.error_message}</AlertDescription>
              </Alert>
            {/if}

            <div class="space-y-2">
              <label for="otp" class="text-sm font-medium">{$t('welcome.otp.codeLabel')}</label>
              <Input
                id="otp"
                type="text"
                inputmode="numeric"
                pattern="[0-9]{6}"
                maxlength={6}
                bind:value={_state.otp_code}
                placeholder="000000"
                class="text-center text-2xl tracking-[0.5em] font-mono"
                onkeydown={(e) => { if (e.key === 'Enter') handleVerifyOtp(); }}
              />
            </div>

            <Button onclick={handleVerifyOtp} disabled={!canVerifyOtp} class="w-full">
              {#if _state.submitting}
                {$t('welcome.otp.verifying')}
              {:else}
                {$t('welcome.otp.verifyButton')}
                <ArrowRight class="w-4 h-4 ml-2" />
              {/if}
            </Button>

            <div class="text-center text-sm text-muted-foreground">
              {#if _state.resend_cooldown > 0}
                {$t('welcome.otp.resendIn', { values: { seconds: _state.resend_cooldown } })}
              {:else}
                <button
                  type="button"
                  class="text-primary hover:underline"
                  onclick={handleResendOtp}
                >
                  {$t('welcome.otp.resendButton')}
                </button>
              {/if}
            </div>
          </CardContent>
        </Card>
      {/if}

      <!-- OTP verified — set password -->
      {#if _state.step === 'otp-verified'}
        <Card>
          <CardHeader>
            <div class="flex items-center gap-2">
              <Lock class="w-5 h-5 text-primary" />
              <CardTitle>{$t('welcome.setPassword.title')}</CardTitle>
            </div>
            <CardDescription>{$t('welcome.setPassword.description')}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            {#if _state.error_message}
              <Alert variant="destructive">
                <AlertDescription>{_state.error_message}</AlertDescription>
              </Alert>
            {/if}

            <div class="space-y-2">
              <label for="new_password" class="text-sm font-medium">{$t('welcome.setPassword.newPasswordLabel')}</label>
              <Password.PasswordInput
                id="new_password"
                bind:value={_state.new_password}
                placeholder={$t('welcome.setPassword.newPasswordPlaceholder')}
                autocomplete="new-password"
              />
            </div>

            <div class="space-y-2">
              <label for="confirm_password" class="text-sm font-medium">{$t('welcome.setPassword.confirmPasswordLabel')}</label>
              <Password.PasswordInput
                id="confirm_password"
                bind:value={_state.confirm_password}
                placeholder={$t('welcome.setPassword.confirmPasswordPlaceholder')}
                autocomplete="new-password"
              />
              {#if _state.confirm_password.length > 0 && !passwordsMatch}
                <p class="text-sm text-destructive">{$t('welcome.setPassword.passwordsDoNotMatch')}</p>
              {/if}
            </div>

            {#if passwordPolicy.state.loaded}
              <PasswordChecklist
                rules={[...passwordPolicy.state.checklistRules]}
                password={_state.new_password}
                specialChars={passwordPolicy.state.specialChars}
              />
            {/if}

            <Button onclick={handleComplete} disabled={!canComplete} class="w-full">
              {#if _state.submitting}
                {$t('welcome.setPassword.completing')}
              {:else}
                {$t('welcome.setPassword.completeButton')}
                <KeyRound class="w-4 h-4 ml-2" />
              {/if}
            </Button>
          </CardContent>
        </Card>
      {/if}

      <!-- Complete — success + passkey info -->
      {#if _state.step === 'complete'}
        <Card>
          <CardHeader>
            <div class="flex items-center gap-2">
              <ShieldCheck class="w-5 h-5 text-emerald-500" />
              <CardTitle>{$t('welcome.complete.title')}</CardTitle>
            </div>
            <CardDescription>{$t('welcome.complete.description')}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            {#if showPasskeyStep}
              <div class="space-y-3 rounded-lg border p-4 bg-muted/30">
                <div class="flex items-center gap-2">
                  <Fingerprint class="size-5 {passkeyRequired ? 'text-destructive' : 'text-primary'}" />
                  <span class="font-medium text-sm">
                    {passkeyRequired
                      ? $t('welcome.passkey.titleRequired')
                      : $t('welcome.passkey.title')}
                  </span>
                </div>
                <p class="text-sm text-muted-foreground">
                  {passkeyRequired
                    ? $t('welcome.passkey.descriptionRequired')
                    : $t('welcome.passkey.description')}
                </p>
              </div>
            {/if}

            <Button onclick={handleGoToLogin} class="w-full">
              {$t('welcome.complete.loginButton')}
              <ArrowRight class="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      {/if}
    </div>
  </div>
</div>
