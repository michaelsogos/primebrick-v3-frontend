<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Spinner } from '$lib/components/ui/spinner';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { t } from '$lib/i18n';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

  // ─── Props ─────────────────────────────────────────────────────────────────
  let { oncomplete }: { oncomplete: () => void } = $props();

  // ─── State ──────────────────────────────────────────────────────────────────
  let enrolling = $state(false);
  let enrollStep = $state<"intro" | "qr" | "verify">("intro");
  let enrollmentToken = $state("");
  let secret = $state("");
  let qrCodeUrl = $state("");
  let recoveryCodes = $state<string[]>([]);
  let verifyCode = $state("");
  let enrollLabel = $state("");
  let enrollError = $state<string | null>(null);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const profile = $derived(userProfileStore.current);

  // ─── Actions ────────────────────────────────────────────────────────────────
  async function startEnrollment() {
    enrolling = true;
    enrollError = null;
    try {
      const resp = await apiFetch('/api/v1/auth/mfa/enroll/begin', { method: 'POST' });
      if (!resp.ok) {
        const err = await resp.json();
        pushNotification({ ...err, toast: false });
        return;
      }
      const data = await resp.json();
      enrollmentToken = data.enrollment_token;
      secret = data.secret;
      qrCodeUrl = data.qr_code_url;
      recoveryCodes = data.recovery_codes ?? [];
      enrollStep = 'qr';
    } catch (error) {
      console.error('[MfaEnrollmentSection] Failed to start enrollment:', error);
      pushNotification({
        impact: 'HIGH',
        message: $t('auth.mfa.enrollmentError'),
        scope: 'auth',
      });
    } finally {
      enrolling = false;
    }
  }

  async function finishEnrollment() {
    if (!verifyCode || verifyCode.length !== 6) {
      enrollError = $t('auth.mfa.codeRequired');
      return;
    }
    enrolling = true;
    enrollError = null;
    try {
      const resp = await apiFetch('/api/v1/auth/mfa/enroll/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollment_token: enrollmentToken,
          passcode: verifyCode,
          label: enrollLabel || undefined,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        enrollError = err.detail || $t('auth.mfa.invalidCode');
        return;
      }

      // Update the store — user now has MFA
      if (profile) {
        userProfileStore.set({ ...profile, has_mfa: true });
      }

      pushNotification({
        impact: 'NONE',
        message: $t('auth.mfa.enrollmentSuccess'),
        scope: 'auth',
      });

      oncomplete();
    } catch (error) {
      console.error('[MfaEnrollmentSection] Failed to finish enrollment:', error);
      enrollError = $t('auth.mfa.connectionError');
    } finally {
      enrolling = false;
    }
  }
</script>

{#if enrollStep === 'intro'}
  <!-- Benefits — mirrors the established prompt dialog visual language -->
  <div class="space-y-2.5">
    <div class="flex items-start gap-2">
      <ShieldCheck class="size-4 text-emerald-500 mt-0.5 shrink-0" />
      <p class="text-sm italic text-muted-foreground">
        <span class="not-italic text-foreground/80">
          {$t('auth.authMethodEnforcer.benefitSecurity').split(' — ')[0]}
        </span>
        <br />
        <span class="text-muted-foreground/80">— {$t('auth.authMethodEnforcer.benefitSecurity').split(' — ')[1]}</span>
      </p>
    </div>
    <div class="flex items-start gap-2">
      <Smartphone class="size-4 text-primary mt-0.5 shrink-0" />
      <p class="text-sm italic text-muted-foreground">
        <span class="not-italic text-foreground/80">
          {$t('auth.authMethodEnforcer.benefitConvenienceMfa').split(' — ')[0]}
        </span>
        <br />
        <span class="text-muted-foreground/80">— {$t('auth.authMethodEnforcer.benefitConvenienceMfa').split(' — ')[1]}</span>
      </p>
    </div>
  </div>

  <!-- Warning — destructive tone (not primary) -->
  <div class="rounded-md bg-destructive/10 border border-destructive/20 p-3">
    <div class="flex items-start gap-2">
      <AlertTriangle class="size-4 text-destructive mt-0.5 shrink-0" />
      <p class="text-xs text-muted-foreground">
        {$t('auth.authMethodEnforcer.warningMfa')}
      </p>
    </div>
  </div>

  {#if enrolling}
    <div class="flex items-center justify-center py-4">
      <Spinner class="size-6" />
      <span class="ml-2 text-sm text-muted-foreground">{$t('auth.authMethodEnforcer.enrolling')}</span>
    </div>
  {/if}

  <!-- Primary CTA — right-aligned, default width, with icon -->
  <div class="flex justify-end pt-2">
    <Button
      data-testid="auth-method-enforcer-enroll-mfa-button"
      onclick={startEnrollment}
      disabled={enrolling}
    >
      <ShieldCheck class="size-4 mr-2" />
      {$t('auth.authMethodEnforcer.enrollMfaButton')}
    </Button>
  </div>
{:else if enrollStep === 'qr'}
  <div class="space-y-4 py-2">
    <div class="flex justify-center">
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUrl)}`}
        alt="OTP QR Code®"
        class="rounded-lg border"
        width="200"
        height="200"
      />
    </div>
    <div class="space-y-2">
      <p class="text-xs text-muted-foreground">{$t('auth.mfa.manualEntry')}:</p>
      <code class="block bg-muted px-2 py-1 rounded text-xs font-mono break-all">{secret}</code>
    </div>
    {#if recoveryCodes.length > 0}
      <div class="space-y-2">
        <p class="text-xs text-muted-foreground">{$t('auth.mfa.recoveryCodes')}</p>
        <div class="bg-muted rounded p-2 space-y-1">
          {#each recoveryCodes as code}
            <code class="block text-xs font-mono">{code}</code>
          {/each}
        </div>
        <p class="text-xs text-destructive">{$t('auth.mfa.recoveryCodesWarning')}</p>
      </div>
    {/if}
    <div class="flex justify-end">
      <Button onclick={() => (enrollStep = 'verify')}>
        {$t('auth.mfa.continue')}
      </Button>
    </div>
  </div>
{:else if enrollStep === 'verify'}
  <div class="space-y-4 py-2">
    <div class="space-y-2">
      <Label for="mfa-enroller-label">{$t('auth.mfa.label')}</Label>
      <Input
        id="mfa-enroller-label"
        type="text"
        maxlength={100}
        placeholder={$t('auth.mfa.labelPlaceholder')}
        bind:value={enrollLabel}
      />
    </div>
    <div class="space-y-2">
      <Label for="mfa-enroller-code">{$t('auth.mfa.verifyCode')}</Label>
      <Input
        id="mfa-enroller-code"
        type="text"
        inputmode="numeric"
        pattern="\d{6}"
        maxlength={6}
        autocomplete="one-time-code"
        placeholder="000000"
        class="text-center text-lg tracking-widest"
        bind:value={verifyCode}
      />
    </div>
    {#if enrollError}
      <p class="text-sm text-destructive">{enrollError}</p>
    {/if}
    <div class="flex justify-end">
      <Button onclick={finishEnrollment} disabled={enrolling}>
        {#if enrolling}
          <Spinner class="size-4 mr-2" />
        {/if}
        {$t('auth.mfa.verifyAndEnable')}
      </Button>
    </div>
  </div>
{/if}
