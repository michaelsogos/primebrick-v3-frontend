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
  import { enforcerStore, hideEnforcer } from '$lib/auth-enforcer-store.svelte';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Fingerprint from '@lucide/svelte/icons/fingerprint';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import PasskeyEnrollmentSection from './PasskeyEnrollmentSection.svelte';
  import MfaEnrollmentSection from './MfaEnrollmentSection.svelte';

  // ─── State ──────────────────────────────────────────────────────────────────
  // `open` is bound to the dialog component. It mirrors `enforcerStore.visible`
  // — the dialog is shown/hidden by the store flag, NOT by reactive derived
  // values from the profile store. The decision to show was made once, in
  // +layout.svelte onMount, right after /auth/me returned 200 with confirmed
  // data. See auth-enforcer-store.svelte.ts for the rationale.
  let open = $state(enforcerStore.visible);
  let dismissing = $state(false);
  let dontAskAgain = $state(false);
  let bump = $state(false);
  // Selected method: 'passkey' | 'mfa' | null (null = method selector visible)
  let selectedMethod = $state<'passkey' | 'mfa' | null>(null);

  // Sync `open` with the store flag. The store is the single source of truth
  // for visibility — set once by the layout, cleared by enrollment/dismiss.
  $effect(() => {
    open = enforcerStore.visible;
    if (open) {
      // Reset method selection when dialog opens.
      // If passkey_required=true, auto-select passkey (no method selector shown).
      selectedMethod = passkeyRequired ? 'passkey' : null;
    }
  });

  function handleInteractOutside(event: PointerEvent) {
    event.preventDefault();
    bump = true;
    setTimeout(() => (bump = false), 400);
  }

  // ─── Config-derived UI flags ────────────────────────────────────────────────
  // These come from authConfigState (loaded once from /auth/config, stable for
  // the session). They drive which choicebox items / buttons to render — NOT
  // whether the dialog should show (that's the store's job).
  const passkeyRequired = $derived(authConfigState.config?.passkey_required ?? false);
  const webauthnEnabled = $derived(authConfigState.config?.enable_webauthn ?? false);
  const mfaEnabled = $derived(authConfigState.config?.enable_mfa ?? false);
  const webauthnSupported = $derived(isWebauthnSupported());

  // Which methods can the user enroll? (config + browser capability)
  // Used to decide which choicebox items to render. The dialog is only visible
  // when the user has NEITHER method, so both of these being true means both
  // items show; if only one is available, only that item shows.
  const canEnrollPasskey = $derived(webauthnEnabled && webauthnSupported);
  const canEnrollMfa = $derived(mfaEnabled);

  // ─── Actions ────────────────────────────────────────────────────────────────
  function handleEnrollmentComplete() {
    hideEnforcer();
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
          // Update the profile store so the dismissed flag is persisted
          // for the current session (the BE already stored it).
          const profile = userProfileStore.current;
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
      hideEnforcer();
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
      {$t('app.auth.authMethodEnforcer.title')}
    </Dialog.Title>
    <Dialog.Description>
      {$t('app.auth.authMethodEnforcer.description')}
    </Dialog.Description>
  </Dialog.Header>

  <div class="space-y-4 py-2">
    {#if passkeyRequired}
      <!-- passkey_required=true: passkey only, no method selector, no dismiss -->
      <PasskeyEnrollmentSection oncomplete={handleEnrollmentComplete} />
    {:else if selectedMethod === null}
      <!-- Method selector: user picks passkey or MFA -->
      <Choicebox.Root value="" onValueChange={(v) => (selectedMethod = v as 'passkey' | 'mfa')}>
        {#if canEnrollPasskey}
          <Choicebox.Item value="passkey">
            <Choicebox.Title class="flex items-center gap-2">
              <Fingerprint class="size-4 text-primary" />
              {$t('app.auth.authMethodEnforcer.methodPasskey')}
            </Choicebox.Title>
            <Choicebox.Description>
              {$t('app.auth.authMethodEnforcer.methodPasskeyDesc')}
            </Choicebox.Description>
          </Choicebox.Item>
        {/if}
        {#if canEnrollMfa}
          <Choicebox.Item value="mfa">
            <Choicebox.Title class="flex items-center gap-2">
              <Smartphone class="size-4 text-primary" />
              {$t('app.auth.authMethodEnforcer.methodMfa')}
            </Choicebox.Title>
            <Choicebox.Description>
              {$t('app.auth.authMethodEnforcer.methodMfaDesc')}
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
          ← {$t('app.auth.authMethodEnforcer.backToMethods')}
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
          ← {$t('app.auth.authMethodEnforcer.backToMethods')}
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
          {$t('app.auth.authMethodEnforcer.dontAskAgain')}
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
        {$t('app.auth.authMethodEnforcer.dismissButton')}
      </Button>
    </Dialog.Footer>
  {/if}
</BorderedDialog>
