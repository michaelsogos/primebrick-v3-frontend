<script lang="ts">
  import { onMount } from "svelte";
  import { apiFetch } from "$lib/api";
  import { pushNotification } from "$lib/errors/app-errors";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "$lib/components/ui/card";
  import { t } from "$lib/i18n";
  import Fingerprint from "@lucide/svelte/icons/fingerprint";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import {
    decodeCredentialCreationOptions,
    encodeAuthenticatorAttestation,
    isWebauthnSupported,
  } from "$lib/webauthn/codec";

  interface WebauthnCredentialInfo {
    id: string;
    aaguid?: string;
    transports?: string[];
    label?: string | null;
    created_at?: string;
  }

  let credentials = $state<WebauthnCredentialInfo[]>([]);
  let loading = $state(false);
  let enrolling = $state(false);
  let deletingId = $state<string | null>(null);

  const supported = $derived(isWebauthnSupported());

  async function loadCredentials() {
    loading = true;
    try {
      const resp = await apiFetch("/api/v1/auth/webauthn/credentials");
      if (resp.ok) {
        const data = await resp.json();
        credentials = (data.credentials ?? []) as WebauthnCredentialInfo[];
      }
    } catch (error) {
      console.error("[PasskeyEnrollment] Failed to load credentials:", error);
    } finally {
      loading = false;
    }
  }

  async function addPasskey() {
    if (enrolling) return;
    enrolling = true;
    try {
      // Step 1: begin — ask the BE (→ Casdoor) for PublicKeyCredentialCreationOptions.
      const beginResp = await apiFetch("/api/v1/auth/webauthn/signup/begin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!beginResp.ok) {
        const err = await beginResp.json();
        pushNotification({ ...err, toast: false });
        return;
      }

      const { nonce, options } = await beginResp.json();

      // Step 2: browser ceremony — navigator.credentials.create() shows the
      // OS passkey enrollment prompt (FaceID / TouchID / Windows Hello / security key).
      // `options` is `{ publicKey: { challenge, rp, user, ... } }` — decode the
      // inner publicKey object (base64url strings → ArrayBuffers) and pass it
      // directly to navigator.credentials.create().
      const decoded = decodeCredentialCreationOptions(options);
      const credential = await navigator.credentials.create({ publicKey: decoded.publicKey });

      if (!credential) {
        return; // User cancelled
      }

      // Step 3: finish — send the attestation to the BE (→ Casdoor) for
      // verification and storage.
      const finishResp = await apiFetch("/api/v1/auth/webauthn/signup/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce,
          credential: encodeAuthenticatorAttestation(
            credential as PublicKeyCredential,
          ),
        }),
      });

      if (!finishResp.ok) {
        const err = await finishResp.json();
        pushNotification({ ...err, toast: false });
        return;
      }

      pushNotification({
        impact: "NONE",
        message: $t("auth.passkeys.enrollmentSuccess"),
        scope: "auth",
      });
      await loadCredentials();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return; // User cancelled — not an error
      }
      if (error instanceof DOMException && error.name === "InvalidStateError") {
        // The authenticator already contains a credential for this RP.
        // Sync Casdoor→PG so has_passkey is coherent.
        try {
          await apiFetch("/api/v1/auth/webauthn/sync-passkeys", { method: "POST" });
        } catch {
          // Best-effort
        }
        pushNotification({
          impact: "NONE",
          message: $t("auth.passkeys.alreadyEnrolled"),
          scope: "auth",
        });
        await loadCredentials();
        return;
      }
      console.error("[PasskeyEnrollment] Failed to add passkey:", error);
      pushNotification({
        impact: "HIGH",
        message: $t("auth.passkeys.enrollmentError"),
        scope: "auth",
      });
    } finally {
      enrolling = false;
    }
  }

  async function deletePasskey(id: string) {
    if (deletingId) return;
    deletingId = id;
    try {
      const resp = await apiFetch(`/api/v1/auth/webauthn/credentials/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!resp.ok) {
        const err = await resp.json();
        pushNotification({ ...err, toast: false });
        return;
      }
      await loadCredentials();
    } catch (error) {
      console.error("[PasskeyEnrollment] Failed to delete passkey:", error);
      pushNotification({
        impact: "HIGH",
        message: $t("auth.passkeys.deleteError"),
        scope: "auth",
      });
    } finally {
      deletingId = null;
    }
  }

  onMount(() => {
    if (supported) {
      void loadCredentials();
    }
  });
</script>

{#if supported}
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Fingerprint class="size-5" />
        {$t("auth.passkeys.title")}
      </CardTitle>
      <CardDescription>{$t("auth.passkeys.description")}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <!-- Enrolled passkeys list -->
      {#if loading}
        <div class="flex items-center justify-center py-4">
          <Spinner />
        </div>
      {:else if credentials.length === 0}
        <p class="text-sm text-muted-foreground py-2" data-testid="passkey-enrollment-empty">{$t("auth.passkeys.empty")}</p>
      {:else}
        <ul class="space-y-2" data-testid="passkey-enrollment-list">
          {#each credentials as cred (cred.id)}
            <li
              class="flex items-center justify-between rounded-md border border-border px-3 py-2"
              data-testid="passkey-enrollment-item"
              data-credential-id={cred.id}
            >
              <div class="flex items-center gap-2 min-w-0">
                <Fingerprint class="size-4 text-muted-foreground shrink-0" />
                <div class="flex flex-col min-w-0">
                  {#if cred.label}
                    <span class="text-sm font-medium truncate">{cred.label}</span>
                    <span class="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{cred.id}</span>
                  {:else}
                    <span class="text-sm font-mono truncate max-w-[200px]">{cred.id}</span>
                  {/if}
                  {#if cred.created_at}
                    <span class="text-xs text-muted-foreground">{new Date(cred.created_at).toLocaleDateString()}</span>
                  {/if}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                data-testid="passkey-enrollment-delete-button"
                onclick={() => deletePasskey(cred.id)}
                disabled={deletingId === cred.id}
              >
                {#if deletingId === cred.id}
                  <Spinner class="size-4" />
                {:else}
                  <Trash2 class="size-4" />
                {/if}
                <span class="sr-only">{$t("auth.passkeys.remove")}</span>
              </Button>
            </li>
          {/each}
        </ul>
      {/if}

      <!-- Add passkey button -->
      <Button
        variant="outline"
        data-testid="passkey-enrollment-add-button"
        onclick={addPasskey}
        disabled={enrolling}
      >
        {#if enrolling}
          <Spinner class="mr-2" />
        {:else}
          <Plus class="size-4 mr-2" />
        {/if}
        {$t("auth.passkeys.add")}
      </Button>
    </CardContent>
  </Card>
{/if}
