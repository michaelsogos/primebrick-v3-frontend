<script lang="ts">
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api';
  import { mapRFC7807ToMessageKey } from '$lib/errors/rfc7807-mapper';
  import { pushNotification } from '$lib/errors/app-errors';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { Button } from '$lib/components/ui/button';
  import OtpInput from '$lib/components/otp-input/otp-input.svelte';
  import { useOtpInput } from '$lib/composables/useOtpInput.svelte';
  import { Label } from '$lib/components/ui/label';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { Spinner } from '$lib/components/ui/spinner';
  import { t } from '$lib/i18n';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import KeyRound from '@lucide/svelte/icons/key-round';

  // Props:
  //   mfa_challenge_token: from the login response (mfa_required branch)
  //   available_factors: from the login response
  //   onsuccess: called after successful MFA verification (same contract as LoginForm)
  //   oncancel: called when the user clicks "back" to return to the login form
  let {
    mfa_challenge_token,
    available_factors,
    onsuccess,
    oncancel,
  }: {
    mfa_challenge_token: string;
    available_factors: Array<{ factor_id: string; factor_type: string; label: string | null }>;
    onsuccess?: (data: { success: boolean; user: any }) => void;
    oncancel?: () => void;
  } = $props();

  let submitting = $state(false);
  let errorMsg = $state<string | null>(null);
  const otp = useOtpInput({ onSubmit: () => handleVerify(), disabled: () => submitting || !challengeReady });

  // The challenge token carried in from the login response may already be
  // stale (page reload, HMR, long idle on this form, BE restart). Every time
  // this form mounts we swap it for a fresh one — the BE verifies the old
  // token's signature (exp ignored) and moves the stashed session tokens to
  // the new challenge. If the stash is gone, verification is impossible and
  // the user must restart password login.
  // svelte-ignore state_referenced_locally
  let challengeToken = $state(mfa_challenge_token);
  // svelte-ignore state_referenced_locally
  let factors = $state(available_factors);
  let challengeReady = $state(false);

  onMount(async () => {
    try {
      const resp = await apiFetch('/api/v1/auth/mfa/challenge/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfa_challenge_token: mfa_challenge_token }),
      });
      if (resp.ok) {
        const data = await resp.json();
        challengeToken = data.mfa_challenge_token;
        factors = data.available_factors;
      }
      // On failure we still enable the form with the original token — the
      // verify call will surface the real error (expired/invalid code).
    } catch {
      // Network error — same fallback: keep the original token.
    } finally {
      challengeReady = true;
    }
  });

  // v1: TOTP only — use the first (preferred) factor.
  // When multiple factor types are supported, this will be a selector.
  const factor = $derived(factors[0]);

  async function handleVerify() {
    if (otp.code.length !== 6) {
      errorMsg = $t('app.auth.login.mfa.codeRequired');
      return;
    }
    submitting = true;
    errorMsg = null;
    try {
      const response = await apiFetch('/api/v1/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mfa_challenge_token: challengeToken,
          factor_id: factor.factor_id,
          code: otp.code,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        pushNotification({ ...errorData, toast: false });

        const mappedError = mapRFC7807ToMessageKey({
          status: response.status,
          internal_code: errorData.internal_code,
          detail: errorData.detail,
        });
        if (mappedError) {
          errorMsg = $t(mappedError.key);
        } else {
          errorMsg = errorData.detail || $t('app.auth.login.mfa.invalidCode');
        }
        otp.reset();
        return;
      }

      const data = await response.json();
      if (data.success && data.user) {
        userProfileStore.set(data.user);
      }
      onsuccess?.(data);
    } catch (error) {
      console.error('[MFA Verify Error]', error);
      errorMsg = $t('app.auth.login.mfa.connectionError');
    } finally {
      submitting = false;
    }
  }
</script>

<div>
  <div class="space-y-4">
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <KeyRound class="size-4" />
      <span>{$t('app.auth.login.mfa.description')}</span>
    </div>

    {#if factor?.label}
      <p class="text-xs text-muted-foreground">{$t('app.auth.login.mfa.factorLabel')}: {factor.label}</p>
    {/if}

    <div class="space-y-2">
      <Label for="mfa-code-input">{$t('app.auth.login.mfa.code')}</Label>
      <OtpInput
        id="mfa-code-input"
        data-testid="mfa-code-input"
        bind:value={otp.code}
        onsubmit={otp.requestSubmit}
        disabled={submitting || !challengeReady}
      />
    </div>

    <Button type="button" data-testid="mfa-verify-button" class="w-full" disabled={submitting || !challengeReady} onclick={handleVerify}>
      {#if submitting}
        <Spinner class="mr-2" />
      {/if}
      {submitting ? $t('app.auth.login.mfa.verifying') : $t('app.auth.login.mfa.verify')}
    </Button>

    <Button type="button" variant="ghost" class="w-full" onclick={() => oncancel?.()}>
      {$t('app.auth.login.mfa.back')}
    </Button>

    {#if errorMsg}
      <Alert variant="destructive" class="mt-4">
        <ShieldAlert class="size-4" />
        <AlertDescription>{errorMsg}</AlertDescription>
      </Alert>
    {/if}
  </div>
</div>
