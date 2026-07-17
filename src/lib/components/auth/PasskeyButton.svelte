<script lang="ts">
  import { apiFetch } from "$lib/api";
  import { pushNotification } from "$lib/errors/app-errors";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { t } from "$lib/i18n";
  import { userProfileStore } from "$lib/user-profile-store.svelte";
  import Fingerprint from "@lucide/svelte/icons/fingerprint";
  import {
    decodeCredentialRequestOptions,
    encodeAuthenticatorAssertion,
  } from "$lib/webauthn/codec";

  // onsuccess: called after successful passkey login. Same contract as the
  // password login path in LoginForm — the parent decides what to do (redirect
  // for the login page, drain+retry for the session-expired dialog).
  // onerror: called when passkey login fails (user cancelled, no credentials,
  // network error, etc.).
  let {
    onsuccess,
    onerror,
  }: {
    onsuccess?: (data: { success: boolean; user: any }) => void;
    onerror?: () => void;
  } = $props();

  let loading = $state(false);

  async function signInWithPasskey() {
    if (loading) return;
    loading = true;
    try {
      // Step 1: begin — ask the BE (→ Casdoor) for PublicKeyCredentialRequestOptions.
      // No username → discoverable login (passkey-only, the OS prompts for
      // which passkey to use).
      const beginResp = await apiFetch("/api/v1/auth/webauthn/signin/begin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!beginResp.ok) {
        const err = await beginResp.json();
        pushNotification({ ...err, toast: false });
        onerror?.();
        return;
      }

      const { nonce, options } = await beginResp.json();

      // Step 2: browser ceremony — navigator.credentials.get() shows the OS
      // passkey prompt (FaceID / TouchID / security key).
      // `options` is `{ publicKey: { challenge, rpId, ... } }` — decode the
      // inner publicKey object (base64url strings → ArrayBuffers) and pass it
      // directly to navigator.credentials.get().
      const decoded = decodeCredentialRequestOptions(options);
      const publicKey = decoded.publicKey as PublicKeyCredentialRequestOptions;
      const credential = await navigator.credentials.get({ publicKey });

      if (!credential) {
        // User cancelled the OS prompt
        onerror?.();
        return;
      }

      // Step 3: finish — send the assertion to the BE (→ Casdoor) for
      // verification. On success the BE sets httpOnly cookies and returns the
      // user object, identical to the password login response shape.
      const finishResp = await apiFetch("/api/v1/auth/webauthn/signin/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce,
          credential: encodeAuthenticatorAssertion(
            credential as PublicKeyCredential,
          ),
        }),
      });

      if (!finishResp.ok) {
        const err = await finishResp.json();
        pushNotification({ ...err, toast: false });
        onerror?.();
        return;
      }

      const data = await finishResp.json();
      if (data.success && data.user) {
        userProfileStore.set(data.user);
      }
      onsuccess?.(data);
    } catch (error) {
      // AbortError = user cancelled the browser prompt — not a real error
      if (error instanceof DOMException && error.name === "AbortError") {
        onerror?.();
        return;
      }
      console.error("[Passkey Signin Error]", error);
      pushNotification({
        impact: "HIGH",
        message: $t("login.passkey.error"),
        scope: "auth",
      });
      onerror?.();
    } finally {
      loading = false;
    }
  }
</script>

<Button
  variant="outline"
  class="w-full"
  onclick={signInWithPasskey}
  disabled={loading}
>
  {#if loading}
    <Spinner class="mr-2" />
  {:else}
    <Fingerprint class="size-4 mr-2" />
  {/if}
  {$t("login.passkey.button")}
</Button>
