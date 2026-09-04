<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import BorderedDialog from '$lib/components/ui/dialog-bordered.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Spinner } from '$lib/components/ui/spinner';
  import { t } from '$lib/i18n';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import KeyRound from '@lucide/svelte/icons/key-round';

  // Props:
  //   open: bindable — controls dialog visibility
  //   action: the action being authorized (e.g. "delete")
  //   target_resource: the target resource (e.g. "organizations")
  //   onauthorized: called with the action_authorization_token when verification succeeds
  let {
    open = $bindable(false),
    action,
    target_resource,
    onauthorized,
  }: {
    open: boolean;
    action: string;
    target_resource: string;
    onauthorized?: (token: string) => void;
  } = $props();

  let challengeToken = $state('');
  let availableFactors = $state<Array<{ factor_id: string; factor_type: string; label: string | null }>>([]);
  let factorId = $state('');
  let code = $state('');
  let loading = $state(false);
  let verifying = $state(false);
  let error = $state<string | null>(null);

  // Reset state when dialog opens
  $effect(() => {
    if (open) {
      challengeToken = '';
      availableFactors = [];
      factorId = '';
      code = '';
      error = null;
      void initiate();
    }
  });

  async function initiate() {
    loading = true;
    error = null;
    try {
      const resp = await apiFetch('/api/v1/auth/mfa/step-up/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target_resource }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        error = err.detail || $t('app.auth.mfaStepUp.stepUpInitiateError');
        return;
      }
      const data = await resp.json();
      challengeToken = data.mfa_challenge_token;
      availableFactors = data.available_factors;
      factorId = availableFactors[0]?.factor_id ?? '';
    } catch (e) {
      console.error('[MfaStepUp] Initiate failed:', e);
      error = $t('app.auth.mfa.connectionError');
    } finally {
      loading = false;
    }
  }

  async function verify() {
    if (!code || code.length !== 6) {
      error = $t('app.auth.mfa.codeRequired');
      return;
    }
    verifying = true;
    error = null;
    try {
      const resp = await apiFetch('/api/v1/auth/mfa/step-up/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mfa_challenge_token: challengeToken,
          factor_id: factorId,
          code,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        error = err.detail || $t('app.auth.mfa.invalidCode');
        return;
      }
      const data = await resp.json();
      pushNotification({
        impact: 'NONE',
        message: $t('app.auth.mfaStepUp.stepUpAuthorized'),
        scope: 'auth',
      });
      onauthorized?.(data.action_authorization_token);
      open = false;
    } catch (e) {
      console.error('[MfaStepUp] Verify failed:', e);
      error = $t('app.auth.mfa.connectionError');
    } finally {
      verifying = false;
    }
  }
</script>

<BorderedDialog bind:open severity="primary" tone="soft" class="sm:max-w-md">
  <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <ShieldCheck class="size-5 text-primary" />
        {$t('app.auth.mfaStepUp.stepUpTitle')}
      </Dialog.Title>
      <Dialog.Description>
        {$t('app.auth.mfaStepUp.stepUpDescription')}
      </Dialog.Description>
    </Dialog.Header>

    {#if loading}
      <div class="flex items-center justify-center py-8">
        <Spinner />
      </div>
    {:else if error && !challengeToken}
      <div class="space-y-4 py-2">
        <p class="text-sm text-destructive">{error}</p>
        <Button onclick={initiate} class="w-full">
          {$t('app.common.retry')}
        </Button>
      </div>
    {:else}
      <div class="space-y-4 py-2">
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <KeyRound class="size-4" />
          <span>
            {$t('app.auth.mfaStepUp.stepUpAction')}: <strong>{action}</strong> → <strong>{target_resource}</strong>
          </span>
        </div>

        {#if availableFactors.length > 1}
          <div class="space-y-2">
            <Label for="mfa-stepup-factor">{$t('app.auth.mfaStepUp.selectFactor')}</Label>
            <select
              id="mfa-stepup-factor"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              bind:value={factorId}
            >
              {#each availableFactors as factor}
                <option value={factor.factor_id}>
                  {factor.label || $t('app.auth.mfa.defaultLabel')} ({factor.factor_type})
                </option>
              {/each}
            </select>
          </div>
        {/if}

        <div class="space-y-2">
          <Label for="mfa-stepup-code">{$t('app.auth.mfa.verifyCode')}</Label>
          <Input
            id="mfa-stepup-code"
            type="text"
            inputmode="numeric"
            pattern="\d{6}"
            maxlength={6}
            autocomplete="one-time-code"
            placeholder="000000"
            class="text-center text-lg tracking-widest"
            bind:value={code}
            onkeydown={(e) => { if (e.key === 'Enter') verify(); }}
          />
        </div>

        {#if error}
          <p class="text-sm text-destructive">{error}</p>
        {/if}

        <Button onclick={verify} disabled={verifying} class="w-full">
          {#if verifying}
            <Spinner class="size-4 mr-2" />
          {/if}
          {$t('app.auth.mfaStepUp.verifyAndAuthorize')}
        </Button>
      </div>
    {/if}
</BorderedDialog>
