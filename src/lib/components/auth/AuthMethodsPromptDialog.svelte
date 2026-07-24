<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import BorderedDialog from '$lib/components/ui/dialog-bordered.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as Choicebox from '$lib/components/ui/choicebox';
  import { t } from '$lib/i18n';
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { authConfigState } from '$lib/auth-config-store.svelte';
  import { isWebauthnSupported } from '$lib/webauthn/codec';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Fingerprint from '@lucide/svelte/icons/fingerprint';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import PasskeyEnrollmentSection from './PasskeyEnrollmentSection.svelte';
  import MfaEnrollmentSection from './MfaEnrollmentSection.svelte';

  // ─── State ──────────────────────────────────────────────────────────────────
  let open = $state(false);
  let dismissing = $state(false);
  let dontAskAgain = $state(false);
  let bump = $state(false);
  // Selected method: 'passkey' | 'mfa' | null (null = method selector visible)
  let selectedMethod = $state<'passkey' | 'mfa' | null>(null);

  function handleInteractOutside(event: PointerEvent) {
    event.preventDefault();
    bump = true;
    setTimeout(() => (bump = false), 400);
  }

  // ─── Derived ────────────────────────────────────────────────────────────────
  const profile = $derived(userProfileStore.current);
  const webauthnEnabled = $derived(authConfigState.config?.enable_webauthn ?? false);
  const webauthnSupported = $derived(isWebauthnSupported());
  const mfaEnabled = $derived(authConfigState.config?.enable_mfa ?? false);
  const passkeyRequired = $derived(authConfigState.config?.passkey_required ?? false);

  // Whether the user needs each method
  const needsPasskey = $derived(webauthnEnabled && webauthnSupported && profile?.has_passkey === false);
  const needsMfa = $derived(mfaEnabled && profile?.has_mfa === false);

  // Show the dialog when:
  // - passkey_required=true: show if user has no passkey (passkey only, mandatory, no dismiss)
  // - passkey_required=false: show if (user needs passkey OR MFA) AND not dismissed
  const shouldShow = $derived(
    !!profile?.uuid &&
    (passkeyRequired
      ? needsPasskey
      : (needsPasskey || needsMfa) && !profile?.auth_method_enforcer_dismissed
    )
  );

  // Auto-open when shouldShow becomes true
  $effect(() => {
    open = shouldShow;
    if (open) {
      // Reset method selection when dialog opens
      // If passkey_required=true, auto-select passkey (no method selector shown)
      selectedMethod = passkeyRequired ? 'passkey' : null;
    }
  });

  // ─── Actions ────────────────────────────────────────────────────────────────
  function handleEnrollmentComplete() {
    open = false;
    selectedMethod = null;
  }

  async function dismissPrompt() {
    if (dismissing) return;
    dismissing = true;
    try {
      // Only persist the dismissal if the user checked "don't ask me again"
      if (dontAskAgain) {
        const resp = await apiFetch('/api/v1/auth/me/dismiss-auth-method-enforcer', {
          method: 'POST',
        });

        if (resp.ok) {
          // Update the store — prompt is dismissed permanently
          if (profile) {
            userProfileStore.set({
              ...profile,
              auth_method_enforcer_dismissed: true,
            });
          }
        }
      }
    } catch (error) {
      console.error('[AuthMethodsPromptDialog] Failed to dismiss:', error);
    } finally {
      dismissing = false;
      dontAskAgain = false;
      open = false;
    }
  }
</script>

<BorderedDialog
  bind:open
  severity="primary"
  tone="soft"
  showCloseButton={false}
  escapeKeydownBehavior="ignore"
  onInteractOutside={handleInteractOutside}
  class="sm:max-w-md {bump ? 'dialog-bump' : ''}"
>
  <Dialog.Header>
    <Dialog.Title class="flex items-center gap-2">
      <ShieldCheck class="size-5 text-primary" />
      {$t('auth.authMethodEnforcer.title')}
    </Dialog.Title>
    <Dialog.Description>
      {$t('auth.authMethodEnforcer.description')}
    </Dialog.Description>
  </Dialog.Header>

  <div class="space-y-4 py-2">
    {#if passkeyRequired}
      <!-- passkey_required=true: passkey only, no method selector, no dismiss -->
      <PasskeyEnrollmentSection oncomplete={handleEnrollmentComplete} />
    {:else if selectedMethod === null}
      <!-- Method selector: user picks passkey or MFA -->
      <Choicebox.Root value="" onValueChange={(v) => (selectedMethod = v as 'passkey' | 'mfa')}>
        {#if needsPasskey}
          <Choicebox.Item value="passkey">
            <Choicebox.Title class="flex items-center gap-2">
              <Fingerprint class="size-4 text-primary" />
              {$t('auth.authMethodEnforcer.methodPasskey')}
            </Choicebox.Title>
            <Choicebox.Description>
              {$t('auth.authMethodEnforcer.methodPasskeyDesc')}
            </Choicebox.Description>
          </Choicebox.Item>
        {/if}
        {#if needsMfa}
          <Choicebox.Item value="mfa">
            <Choicebox.Title class="flex items-center gap-2">
              <Smartphone class="size-4 text-primary" />
              {$t('auth.authMethodEnforcer.methodMfa')}
            </Choicebox.Title>
            <Choicebox.Description>
              {$t('auth.authMethodEnforcer.methodMfaDesc')}
            </Choicebox.Description>
          </Choicebox.Item>
        {/if}
      </Choicebox.Root>
    {:else if selectedMethod === 'passkey'}
      <!-- Passkey enrollment section -->
      <div class="space-y-2">
        <button
          type="button"
          class="text-xs text-muted-foreground hover:text-foreground underline"
          onclick={() => (selectedMethod = null)}
        >
          ← {$t('auth.authMethodEnforcer.backToMethods')}
        </button>
        <PasskeyEnrollmentSection oncomplete={handleEnrollmentComplete} />
      </div>
    {:else if selectedMethod === 'mfa'}
      <!-- MFA enrollment section (inline QR/verify — Option B) -->
      <div class="space-y-2">
        <button
          type="button"
          class="text-xs text-muted-foreground hover:text-foreground underline"
          onclick={() => (selectedMethod = null)}
        >
          ← {$t('auth.authMethodEnforcer.backToMethods')}
        </button>
        <MfaEnrollmentSection oncomplete={handleEnrollmentComplete} />
      </div>
    {/if}

    <!-- Don't ask me again checkbox — only when passkey is NOT required -->
    {#if !passkeyRequired}
      <div class="flex items-start space-x-2 pt-2">
        <Checkbox
          id="dont_ask_again"
          bind:checked={dontAskAgain}
          tone="primary"
          class="data-[state=unchecked]:border-primary-gradient-popover mt-0.5"
        />
        <label for="dont_ask_again" class="text-sm font-medium leading-snug text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {$t('auth.authMethodEnforcer.dontAskAgain')}
        </label>
      </div>
    {/if}
  </div>

  <!-- Footer: dismiss button only when passkey is NOT required -->
  {#if !passkeyRequired}
    <Dialog.Footer class="gap-2 sm:space-x-0">
      <Button
        variant="secondary-outline"
        data-testid="auth-method-enforcer-dismiss-button"
        onclick={dismissPrompt}
        disabled={dismissing}
      >
        {$t('auth.authMethodEnforcer.dismissButton')}
      </Button>
    </Dialog.Footer>
  {/if}
</BorderedDialog>
