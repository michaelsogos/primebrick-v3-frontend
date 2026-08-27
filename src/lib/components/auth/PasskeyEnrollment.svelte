<script lang="ts">
  import { onMount } from "svelte";
  import { apiFetch } from "$lib/api";
  import { pushNotification } from "$lib/errors/app-errors";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { t } from "$lib/i18n";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Fingerprint from "@lucide/svelte/icons/fingerprint";
  import LoadingWatermark from "./LoadingWatermark.svelte";
  import {
    decodeCredentialCreationOptions,
    encodeAuthenticatorAttestation,
    isWebauthnSupported,
  } from "$lib/webauthn/codec";
  import { lookupAaguid } from "$lib/webauthn/aaguid-registry";
  import { transportKeySuffix } from "$lib/webauthn/transports";
  import { getPlatformVersion } from "$lib/webauthn/platform-info";

  interface WebauthnCredentialInfo {
    id: string;
    aaguid?: string;
    transports?: string[];
    label?: string | null;
    created_at?: string;
    last_used_at?: string;
    authenticator_attachment?: string;
    user_agent?: string;
    os?: string;
    device_model?: string;
  }

  let credentials = $state<WebauthnCredentialInfo[]>([]);
  let loading = $state(true);
  let enrolling = $state(false);
  let deletingId = $state<string | null>(null);

  let supported = $state<boolean | undefined>(undefined);

  async function loadCredentials() {
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
      // verification and storage. The BE captures the User-Agent and
      // authenticatorAttachment from the request for rich passkey display.
      // Capture the User-Agent Client Hints platformVersion (Chromium only)
      // so the BE can distinguish Windows 10 from Windows 11.
      const platformVersion = await getPlatformVersion();
      const finishResp = await apiFetch("/api/v1/auth/webauthn/signup/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce,
          credential: encodeAuthenticatorAttestation(
            credential as PublicKeyCredential,
          ),
          ...(platformVersion ? { platform_version: platformVersion } : {}),
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

  function formatDateTime(iso?: string): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString();
  }

  function displayName(cred: WebauthnCredentialInfo): string {
    if (cred.label) return cred.label;
    const aaguidInfo = lookupAaguid(cred.aaguid);
    if (aaguidInfo.name) return aaguidInfo.name;
    return $t("auth.passkeys.unknownPasskey");
  }

  function deviceLine(cred: WebauthnCredentialInfo): string | null {
    const parts: string[] = [];
    if (cred.os) parts.push(cred.os);
    if (cred.device_model) parts.push(cred.device_model);
    if (parts.length > 0) return parts.join(" · ");
    return null;
  }

  onMount(() => {
    const webauthnSupported = isWebauthnSupported();
    supported = webauthnSupported;
    if (webauthnSupported) {
      void loadCredentials();
    } else {
      loading = false;
    }
  });
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <Fingerprint class="size-5" />
      {$t("auth.passkeys.title")}
    </CardTitle>
    <CardDescription>{$t("auth.passkeys.description")}</CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    {#if supported === false}
      <div class="grid min-h-56 place-items-center p-3" data-testid="passkey-enrollment-unsupported">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-empty">
            <Fingerprint class="size-20 text-muted-foreground" />
          </div>
          <div class="text-sm font-medium text-muted-foreground">
            {$t("auth.passkeys.notSupported")}
          </div>
        </div>
      </div>
    {:else if loading}
      <LoadingWatermark
        icon={Fingerprint}
        titleKey="auth.passkeys.loadingTitle"
        hintKey="auth.passkeys.loadingHint"
      />
    {:else if credentials.length === 0}
      <div class="grid min-h-56 place-items-center p-3" data-testid="passkey-enrollment-empty">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-empty">
            <Fingerprint class="size-20 text-muted-foreground" />
          </div>
          <div class="text-sm font-medium text-muted-foreground">
            {$t("auth.passkeys.emptyTitle")}
          </div>
          <div class="text-xs text-muted-foreground">
            {$t("auth.passkeys.emptyHint")}
          </div>
        </div>
      </div>
    {:else}
      <ul class="space-y-2" data-testid="passkey-enrollment-list">
        {#each credentials as cred (cred.id)}
          {@const aaguidInfo = lookupAaguid(cred.aaguid)}
          {@const Icon = aaguidInfo.icon}
          {@const created = formatDateTime(cred.created_at)}
          {@const lastUsed = formatDateTime(cred.last_used_at)}
          {@const device = deviceLine(cred)}
          <li
            class="flex items-start justify-between rounded-md border-primary-gradient px-3 py-2"
            data-testid="passkey-enrollment-item"
            data-credential-id={cred.id}
          >
            <div class="flex items-start gap-2 min-w-0">
              <Icon class="size-5 text-muted-foreground shrink-0 mt-0.5" />
              <div class="flex flex-col min-w-0 gap-0.5">
                <span class="text-sm font-medium truncate">{displayName(cred)}</span>
                {#if created}
                  <span class="text-xs text-muted-foreground">{$t("auth.passkeys.enrolledOn", { date: created })}</span>
                {/if}
                <span class="text-xs text-muted-foreground">
                  {#if lastUsed}
                    {$t("auth.passkeys.lastUsed", { date: lastUsed })}
                  {:else}
                    {$t("auth.passkeys.neverUsed")}
                  {/if}
                </span>
                {#if cred.transports && cred.transports.length > 0}
                  <div class="flex flex-wrap gap-1 mt-1">
                    {#each cred.transports as transport (transport)}
                      {@const suffix = transportKeySuffix(transport)}
                      {#if suffix}
                        <Badge variant="secondary" class="text-xs">{$t(`auth.passkeys.transport.${suffix}`)}</Badge>
                      {/if}
                    {/each}
                  </div>
                {/if}
                <span class="text-xs text-muted-foreground">
                  {#if device}
                    {device}
                  {:else}
                    {$t("auth.passkeys.unknownDevice")}
                  {/if}
                </span>
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
  </CardContent>
  <CardFooter class="bg-muted/50 border-t p-4 -mb-6 justify-end gap-2 rounded-b-xl">
    <Button
      data-testid="passkey-enrollment-add-button"
      onclick={addPasskey}
      disabled={enrolling || !supported}
    >
      {#if enrolling}
        <Spinner class="mr-2" />
      {:else}
        <Plus class="size-4 mr-2" />
      {/if}
      {$t("auth.passkeys.add")}
    </Button>
  </CardFooter>
</Card>
