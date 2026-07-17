<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Spinner } from '$lib/components/ui/spinner';
  import { t } from '$lib/i18n';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { authConfigState } from '$lib/auth-config-store.svelte';
  import { isWebauthnSupported, decodeCredentialCreationOptions, encodeAuthenticatorAttestation } from '$lib/webauthn/codec';
  import Fingerprint from '@lucide/svelte/icons/fingerprint';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';

  // ─── State ──────────────────────────────────────────────────────────────────
  let open = $state(false);
  let enrolling = $state(false);
  let dismissing = $state(false);
  let dontAskAgain = $state(false);
  let bump = $state(false);

  // Trigger a "bump" (shake) animation when the user clicks outside the
  // persistent dialog — signals that it can't be dismissed this way.
  function handleInteractOutside(event: PointerEvent) {
    event.preventDefault();
    bump = true;
    setTimeout(() => (bump = false), 400);
  }

  // ─── Derived ────────────────────────────────────────────────────────────────
  const profile = $derived(userProfileStore.current);
  const webauthnEnabled = $derived(authConfigState.config?.enable_webauthn ?? false);
  const webauthnSupported = $derived(isWebauthnSupported());

  // Show the dialog when:
  // - WebAuthn is enabled in auth config
  // - The browser supports WebAuthn
  // - The user has no passkey
  // - The user hasn't dismissed the prompt
  const shouldShow = $derived(
    webauthnEnabled &&
    webauthnSupported &&
    !!profile &&
    !profile?.has_passkey &&
    !profile?.passkey_prompt_dismissed,
  );

  // Auto-open when shouldShow becomes true
  $effect(() => {
    open = shouldShow;
  });

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
      const finishResp = await apiFetch('/api/v1/auth/webauthn/signup/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nonce,
          credential: encodeAuthenticatorAttestation(credential as PublicKeyCredential),
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
        message: $t('auth.passkeys.enrollmentSuccess'),
        scope: 'auth',
      });

      open = false;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return; // User cancelled — not an error
      }
      console.error('[PasskeyPrompt] Failed to enroll passkey:', error);
      pushNotification({
        impact: 'HIGH',
        message: $t('auth.passkeys.enrollmentError'),
        scope: 'auth',
      });
    } finally {
      enrolling = false;
    }
  }

  async function dismissPrompt() {
    if (dismissing) return;
    dismissing = true;
    try {
      // Only persist the dismissal if the user checked "don't ask me again"
      if (dontAskAgain) {
        const resp = await apiFetch('/api/v1/auth/me/dismiss-passkey-prompt', {
          method: 'POST',
        });

        if (resp.ok) {
          // Update the store — prompt is dismissed permanently
          if (profile) {
            userProfileStore.set({
              ...profile,
              passkey_prompt_dismissed: true,
            });
          }
        }
      }
    } catch (error) {
      console.error('[PasskeyPrompt] Failed to dismiss:', error);
    } finally {
      dismissing = false;
      dontAskAgain = false;
      open = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="sm:max-w-md border-primary-gradient-popover {bump ? 'dialog-bump' : ''}"
    showCloseButton={false}
    escapeKeydownBehavior="ignore"
    onInteractOutside={handleInteractOutside}
  >
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <Fingerprint class="size-5 text-primary" />
        {$t('auth.passkeyPrompt.title')}
      </Dialog.Title>
      <Dialog.Description>
        {$t('auth.passkeyPrompt.description')}
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <!-- Benefits — icons colored, text italic, first part slightly darker, line break after em-dash -->
      <div class="space-y-2.5">
        <div class="flex items-start gap-2">
          <ShieldCheck class="size-4 text-emerald-500 mt-0.5 shrink-0" />
          <p class="text-sm italic text-muted-foreground">
            <span class="not-italic text-foreground/80">
              {$t('auth.passkeyPrompt.benefitSecurity').split(' — ')[0]}
            </span>
            <br />
            <span class="text-muted-foreground/80">— {$t('auth.passkeyPrompt.benefitSecurity').split(' — ')[1]}</span>
          </p>
        </div>
        <div class="flex items-start gap-2">
          <KeyRound class="size-4 text-primary mt-0.5 shrink-0" />
          <p class="text-sm italic text-muted-foreground">
            <span class="not-italic text-foreground/80">
              {$t('auth.passkeyPrompt.benefitConvenience').split(' — ')[0]}
            </span>
            <br />
            <span class="text-muted-foreground/80">— {$t('auth.passkeyPrompt.benefitConvenience').split(' — ')[1]}</span>
          </p>
        </div>
      </div>

      {#if enrolling}
        <div class="flex items-center justify-center py-4">
          <Spinner class="size-6" />
          <span class="ml-2 text-sm text-muted-foreground">{$t('auth.passkeyPrompt.enrolling')}</span>
        </div>
      {/if}

      <!-- Don't ask me again checkbox — primary tone, gradient border when unchecked -->
      <div class="flex items-start space-x-2 pt-2">
        <Checkbox
          id="dont_ask_again"
          bind:checked={dontAskAgain}
          tone="primary"
          class="data-[state=unchecked]:border-primary-gradient-popover mt-0.5"
        />
        <label for="dont_ask_again" class="text-sm font-medium leading-snug text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {$t('auth.passkeyPrompt.dontAskAgain')}
        </label>
      </div>
    </div>

    <Dialog.Footer class="gap-2 sm:space-x-0">
      <Button
        variant="secondary-outline"
        onclick={dismissPrompt}
        disabled={enrolling || dismissing}
      >
        {$t('auth.passkeyPrompt.dismissButton')}
      </Button>
      <Button
        onclick={enrollPasskey}
        disabled={enrolling || dismissing}
      >
        <Fingerprint class="size-4 mr-2" />
        {$t('auth.passkeyPrompt.enrollButton')}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
