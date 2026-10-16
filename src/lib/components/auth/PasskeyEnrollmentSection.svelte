<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Spinner } from '$lib/components/ui/spinner';
  import { t } from '$lib/i18n';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { isWebauthnSupported, decodeCredentialCreationOptions, encodeAuthenticatorAttestation } from '$lib/webauthn/codec';
  import { getPlatformVersion } from '$lib/webauthn/platform-info';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Fingerprint from '@lucide/svelte/icons/fingerprint';

  // ─── Props ─────────────────────────────────────────────────────────────────
  let { oncomplete }: { oncomplete: () => void } = $props();

  // ─── State ──────────────────────────────────────────────────────────────────
  let enrolling = $state(false);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const profile = $derived(userProfileStore.current);

  // ─── Actions ────────────────────────────────────────────────────────────────
  async function enrollPasskey() {
    if (enrolling) return;
    enrolling = true;
    try {
      // Step 1: begin — get the WebAuthn challenge from the BE (→ Casdoor)
      const beginResp = await apiFetch('/api/v1/auth/webauthn/signup/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!beginResp.ok) {
        const err = await beginResp.json();
        pushNotification({ ...err, toast: false });
        return;
      }

      const { nonce, options } = await beginResp.json();

      // Step 2: browser ceremony
      const decoded = decodeCredentialCreationOptions(options);
      const credential = await navigator.credentials.create({ publicKey: decoded.publicKey });

      if (!credential) {
        return; // User cancelled
      }

      // Step 3: finish — send the attestation to the BE
      // Capture platformVersion (Chromium Client Hints) for Win10/11 detection
      const platformVersion = await getPlatformVersion();
      const finishResp = await apiFetch('/api/v1/auth/webauthn/signup/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nonce,
          credential: encodeAuthenticatorAttestation(credential as PublicKeyCredential),
          ...(platformVersion ? { platform_version: platformVersion } : {}),
        }),
      });

      if (!finishResp.ok) {
        const err = await finishResp.json();
        pushNotification({ ...err, toast: false });
        return;
      }

      // Update the store — user now has a passkey
      if (profile) {
        userProfileStore.set({
          ...profile,
          has_passkey: true,
        });
      }

      pushNotification({
        impact: 'NONE',
        message: $t('app.auth.passkeys.enrollmentSuccess'),
        scope: 'auth',
      });

      oncomplete();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return; // User cancelled — not an error
      }
      if (error instanceof DOMException && error.name === 'InvalidStateError') {
        // The authenticator already contains a credential for this RP.
        // The user already has a passkey — treat as success, not error.
        // Sync Casdoor→PG so has_passkey is coherent on next login.
        try {
          await apiFetch('/api/v1/auth/webauthn/sync-passkeys', { method: 'POST' });
        } catch {
          // Best-effort — don't block the UX
        }
        if (profile) {
          userProfileStore.set({ ...profile, has_passkey: true });
        }
        pushNotification({
          impact: 'NONE',
          message: $t('app.auth.passkeys.alreadyEnrolled'),
          scope: 'auth',
        });
        oncomplete();
        return;
      }
      console.error('[PasskeyEnrollmentSection] Failed to enroll passkey:', error);
      pushNotification({
        impact: 'HIGH',
        message: $t('app.auth.passkeys.enrollmentError'),
        scope: 'auth',
      });
    } finally {
      enrolling = false;
    }
  }
</script>

<!-- Benefits — mirrors the established prompt dialog visual language -->
<div class="space-y-2.5">
  <div class="flex items-start gap-2">
    <ShieldCheck class="size-4 text-emerald-500 mt-0.5 shrink-0" />
    <p class="text-sm italic text-muted-foreground">
      <span class="not-italic text-foreground/80">
        {$t('app.auth.authMethodEnforcer.benefitSecurity').split(' — ')[0]}
      </span>
      <br />
      <span class="text-muted-foreground/80">— {$t('app.auth.authMethodEnforcer.benefitSecurity').split(' — ')[1]}</span>
    </p>
  </div>
  <div class="flex items-start gap-2">
    <KeyRound class="size-4 text-primary mt-0.5 shrink-0" />
    <p class="text-sm italic text-muted-foreground">
      <span class="not-italic text-foreground/80">
        {$t('app.auth.authMethodEnforcer.benefitConveniencePasskey').split(' — ')[0]}
      </span>
      <br />
      <span class="text-muted-foreground/80">— {$t('app.auth.authMethodEnforcer.benefitConveniencePasskey').split(' — ')[1]}</span>
    </p>
  </div>
</div>

{#if enrolling}
  <div class="flex items-center justify-center py-4">
    <Spinner class="size-6" />
    <span class="ml-2 text-sm text-muted-foreground">{$t('app.auth.authMethodEnforcer.enrolling')}</span>
  </div>
{/if}

<!-- Primary CTA — rendered in the section body -->
<div class="flex justify-end pt-2">
  <Button
    data-testid="auth-method-enforcer-enroll-passkey-button"
    onclick={enrollPasskey}
    disabled={enrolling}
  >
    <Fingerprint class="size-4 mr-2" />
    {$t('app.auth.authMethodEnforcer.enrollPasskeyButton')}
  </Button>
</div>
