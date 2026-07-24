<script lang="ts">
  import { onMount } from "svelte";
  import { apiFetch } from "$lib/api";
  import { pushNotification } from "$lib/errors/app-errors";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "$lib/components/ui/card";
  import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "$lib/components/ui/dialog";
  import BorderedDialog from "$lib/components/ui/dialog-bordered.svelte";
  import { t } from "$lib/i18n";
  import { authConfigState, loadAuthConfig } from "$lib/auth-config-store.svelte";
  import Smartphone from "@lucide/svelte/icons/smartphone";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import QrCode from "@lucide/svelte/icons/qr-code";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";

  // Trigger the auth config fetch to check if MFA is enabled.
  void loadAuthConfig();
  const mfaEnabled = $derived(authConfigState.config?.enable_mfa ?? false);

  interface MfaFactorInfo {
    uuid: string;
    factor_type: string;
    label: string | null;
    is_enabled: boolean;
    is_preferred: boolean;
    last_used_at: string | null;
    created_at: string;
  }

  let factors = $state<MfaFactorInfo[]>([]);
  let loading = $state(false);
  let enrolling = $state(false);
  let deletingUuid = $state<string | null>(null);

  // Enrollment dialog state
  let enrollDialogOpen = $state(false);
  let enrollStep = $state<"qr" | "verify">("qr");
  let enrollmentToken = $state("");
  let secret = $state("");
  let qrCodeUrl = $state("");
  let recoveryCodes = $state<string[]>([]);
  let verifyCode = $state("");
  let enrollLabel = $state("");
  let enrollError = $state<string | null>(null);

  // Delete dialog state
  let deleteDialogOpen = $state(false);
  let deleteTargetUuid = $state<string | null>(null);

  async function loadFactors() {
    loading = true;
    try {
      const resp = await apiFetch("/api/v1/auth/mfa/factors");
      if (resp.ok) {
        const data = await resp.json();
        factors = (data.factors ?? []) as MfaFactorInfo[];
      }
    } catch (error) {
      console.error("[MfaManagement] Failed to load factors:", error);
    } finally {
      loading = false;
    }
  }

  async function startEnrollment() {
    enrolling = true;
    enrollError = null;
    verifyCode = "";
    enrollLabel = "";
    try {
      const resp = await apiFetch("/api/v1/auth/mfa/enroll/begin", { method: "POST" });
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
      enrollStep = "qr";
      enrollDialogOpen = true;
    } catch (error) {
      console.error("[MfaManagement] Failed to start enrollment:", error);
      pushNotification({
        impact: "HIGH",
        message: $t("auth.mfa.enrollmentError"),
        scope: "auth",
      });
    } finally {
      enrolling = false;
    }
  }

  async function finishEnrollment() {
    if (!verifyCode || verifyCode.length !== 6) {
      enrollError = $t("auth.mfa.codeRequired");
      return;
    }
    enrolling = true;
    enrollError = null;
    try {
      const resp = await apiFetch("/api/v1/auth/mfa/enroll/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollment_token: enrollmentToken,
          passcode: verifyCode,
          label: enrollLabel || undefined,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        enrollError = err.detail || $t("auth.mfa.invalidCode");
        return;
      }
      pushNotification({
        impact: "NONE",
        message: $t("auth.mfa.enrollmentSuccess"),
        scope: "auth",
      });
      enrollDialogOpen = false;
      await loadFactors();
    } catch (error) {
      console.error("[MfaManagement] Failed to finish enrollment:", error);
      enrollError = $t("auth.mfa.connectionError");
    } finally {
      enrolling = false;
    }
  }

  function confirmDelete(uuid: string) {
    deleteTargetUuid = uuid;
    deleteDialogOpen = true;
  }

  async function doDelete() {
    if (!deleteTargetUuid) return;
    deletingUuid = deleteTargetUuid;
    try {
      const resp = await apiFetch(`/api/v1/auth/mfa/factors/${encodeURIComponent(deleteTargetUuid)}`, {
        method: "DELETE",
      });
      if (!resp.ok) {
        const err = await resp.json();
        pushNotification({ ...err, toast: false });
        return;
      }
      pushNotification({
        impact: "NONE",
        message: $t("auth.mfa.deleteSuccess"),
        scope: "auth",
      });
      await loadFactors();
    } catch (error) {
      console.error("[MfaManagement] Failed to delete factor:", error);
      pushNotification({
        impact: "HIGH",
        message: $t("auth.mfa.deleteError"),
        scope: "auth",
      });
    } finally {
      deletingUuid = null;
      deleteDialogOpen = false;
      deleteTargetUuid = null;
    }
  }

  let factorsLoaded = $state(false);

  onMount(() => {
    if (mfaEnabled) {
      factorsLoaded = true;
      void loadFactors();
    }
  });

  // Load factors once when MFA becomes enabled (e.g. auth config loaded after mount)
  $effect(() => {
    if (mfaEnabled && !factorsLoaded && !loading) {
      factorsLoaded = true;
      void loadFactors();
    }
  });
</script>

{#if mfaEnabled}
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <ShieldCheck class="size-5" />
        {$t("auth.mfa.title")}
      </CardTitle>
      <CardDescription>{$t("auth.mfa.description")}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      {#if loading}
        <div class="flex items-center justify-center py-4">
          <Spinner />
        </div>
      {:else if factors.length === 0}
        <div class="space-y-3" data-testid="mfa-management-empty">
          <p class="text-sm text-muted-foreground">{$t("auth.mfa.empty")}</p>
          <Button onclick={startEnrollment} disabled={enrolling} data-testid="mfa-enroll-button">
            <Plus class="size-4 mr-1" />
            {$t("auth.mfa.enrollButton")}
          </Button>
        </div>
      {:else}
        <ul class="space-y-2" data-testid="mfa-management-list">
          {#each factors as factor (factor.uuid)}
            <li
              class="flex items-center justify-between rounded-md border border-border px-3 py-2"
              data-testid="mfa-management-item"
              data-factor-uuid={factor.uuid}
            >
              <div class="flex items-center gap-2 min-w-0">
                <Smartphone class="size-4 text-muted-foreground shrink-0" />
                <div class="flex flex-col min-w-0">
                  <span class="text-sm font-medium truncate">
                    {factor.label || $t("auth.mfa.defaultLabel")}
                  </span>
                  <span class="text-xs text-muted-foreground">
                    {$t("auth.mfa.factorType")}: {factor.factor_type.toUpperCase()}
                    {#if factor.is_preferred}
                      <span class="ml-1 text-primary">• {$t("auth.mfa.preferred")}</span>
                    {/if}
                  </span>
                  {#if factor.last_used_at}
                    <span class="text-xs text-muted-foreground">
                      {$t("auth.mfa.lastUsed")}: {new Date(factor.last_used_at).toLocaleDateString()}
                    </span>
                  {/if}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onclick={() => confirmDelete(factor.uuid)}
                disabled={deletingUuid === factor.uuid}
                data-testid="mfa-delete-button"
                aria-label={$t("auth.mfa.delete")}
              >
                {#if deletingUuid === factor.uuid}
                  <Spinner class="size-4" />
                {:else}
                  <Trash2 class="size-4" />
                {/if}
              </Button>
            </li>
          {/each}
        </ul>
        <Button onclick={startEnrollment} disabled={enrolling} variant="outline" data-testid="mfa-enroll-another-button">
          <Plus class="size-4 mr-1" />
          {$t("auth.mfa.enrollAnother")}
        </Button>
      {/if}
    </CardContent>
  </Card>

  <!-- Enrollment Dialog -->
  <BorderedDialog bind:open={enrollDialogOpen} severity="primary" tone="soft" class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <QrCode class="size-5" />
          {$t("auth.mfa.enrollDialogTitle")}
        </DialogTitle>
        <DialogDescription>
          {#if enrollStep === "qr"}
            {$t("auth.mfa.enrollStepQr")}
          {:else}
            {$t("auth.mfa.enrollStepVerify")}
          {/if}
        </DialogDescription>
      </DialogHeader>

      {#if enrollStep === "qr"}
        <div class="space-y-4">
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
            <p class="text-xs text-muted-foreground">{$t("auth.mfa.manualEntry")}:</p>
            <code class="block bg-muted px-2 py-1 rounded text-xs font-mono break-all" data-testid="mfa-enroll-secret">{secret}</code>
          </div>
          {#if recoveryCodes.length > 0}
            <div class="space-y-2">
              <p class="text-xs text-muted-foreground">{$t("auth.mfa.recoveryCodes")}:</p>
              <div class="bg-muted rounded p-2 space-y-1">
                {#each recoveryCodes as code}
                  <code class="block text-xs font-mono">{code}</code>
                {/each}
              </div>
              <p class="text-xs text-destructive">{$t("auth.mfa.recoveryCodesWarning")}</p>
            </div>
          {/if}
          <Button onclick={() => (enrollStep = "verify")} class="w-full" data-testid="mfa-enroll-continue-button">
            {$t("auth.mfa.continue")}
          </Button>
        </div>
      {:else}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="mfa-enroll-label">{$t("auth.mfa.label")}</Label>
            <Input
              id="mfa-enroll-label"
              type="text"
              maxlength={100}
              placeholder={$t("auth.mfa.labelPlaceholder")}
              bind:value={enrollLabel}
              data-testid="mfa-enroll-label-input"
            />
          </div>
          <div class="space-y-2">
            <Label for="mfa-enroll-code">{$t("auth.mfa.verifyCode")}</Label>
            <Input
              id="mfa-enroll-code"
              type="text"
              inputmode="numeric"
              pattern="\d{6}"
              maxlength={6}
              autocomplete="one-time-code"
              placeholder="000000"
              class="text-center text-lg tracking-widest"
              bind:value={verifyCode}
              data-testid="mfa-enroll-code-input"
            />
          </div>
          {#if enrollError}
            <p class="text-sm text-destructive">{enrollError}</p>
          {/if}
          <Button onclick={finishEnrollment} disabled={enrolling} class="w-full" data-testid="mfa-enroll-finish-button">
            {#if enrolling}
              <Spinner class="size-4 mr-2" />
            {/if}
            {$t("auth.mfa.verifyAndEnable")}
          </Button>
        </div>
      {/if}
  </BorderedDialog>

  <!-- Delete Confirmation Dialog -->
  <BorderedDialog bind:open={deleteDialogOpen} severity="destructive" class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{$t("auth.mfa.deleteDialogTitle")}</DialogTitle>
        <DialogDescription>{$t("auth.mfa.deleteDialogDescription")}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onclick={() => (deleteDialogOpen = false)} data-testid="mfa-delete-cancel-button">
          {$t("common.cancel")}
        </Button>
        <Button variant="destructive" onclick={doDelete} data-testid="mfa-delete-confirm-button">
          {$t("auth.mfa.delete")}
        </Button>
      </DialogFooter>
  </BorderedDialog>
{/if}
