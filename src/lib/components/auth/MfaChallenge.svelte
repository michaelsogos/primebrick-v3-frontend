<script lang="ts">
  import { apiFetch } from '$lib/api';
  import { mapRFC7807ToMessageKey } from '$lib/errors/rfc7807-mapper';
  import { pushNotification } from '$lib/errors/app-errors';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
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

  let code = $state('');
  let submitting = $state(false);
  let errorMsg = $state<string | null>(null);

  // v1: TOTP only — use the first (preferred) factor.
  // When multiple factor types are supported, this will be a selector.
  const factor = $derived(available_factors[0]);

  async function handleVerify() {
    if (!code || code.length !== 6) {
      errorMsg = $t('login.mfa.codeRequired');
      return;
    }
    submitting = true;
    errorMsg = null;
    try {
      const response = await apiFetch('/api/v1/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mfa_challenge_token,
          factor_id: factor.factor_id,
          code,
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
          errorMsg = errorData.detail || $t('login.mfa.invalidCode');
        }
        return;
      }

      const data = await response.json();
      if (data.success && data.user) {
        userProfileStore.set(data.user);
      }
      onsuccess?.(data);
    } catch (error) {
      console.error('[MFA Verify Error]', error);
      errorMsg = $t('login.mfa.connectionError');
    } finally {
      submitting = false;
    }
  }
</script>

<div>
  <div class="space-y-4">
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <KeyRound class="size-4" />
      <span>{$t('login.mfa.description')}</span>
    </div>

    {#if factor?.label}
      <p class="text-xs text-muted-foreground">{$t('login.mfa.factorLabel')}: {factor.label}</p>
    {/if}

    <div class="space-y-2">
      <Label for="mfa-code-input">{$t('login.mfa.code')}</Label>
      <Input
        id="mfa-code-input"
        type="text"
        inputmode="numeric"
        pattern="\d{6}"
        maxlength={6}
        autocomplete="one-time-code"
        data-testid="mfa-code-input"
        placeholder="000000"
        class="text-center text-lg tracking-widest"
        bind:value={code}
      />
    </div>

    <Button type="button" data-testid="mfa-verify-button" class="w-full" disabled={submitting} onclick={handleVerify}>
      {#if submitting}
        <Spinner class="mr-2" />
      {/if}
      {submitting ? $t('login.mfa.verifying') : $t('login.mfa.verify')}
    </Button>

    <Button type="button" variant="ghost" class="w-full" onclick={() => oncancel?.()}>
      {$t('login.mfa.back')}
    </Button>

    {#if errorMsg}
      <Alert variant="destructive" class="mt-4">
        <ShieldAlert class="size-4" />
        <AlertDescription>{errorMsg}</AlertDescription>
      </Alert>
    {/if}
  </div>
</div>
