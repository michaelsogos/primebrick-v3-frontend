<script lang="ts">
  import { z } from "zod";
  import { superForm, defaults } from "sveltekit-superforms";
  import { zod4 } from "sveltekit-superforms/adapters";
  import { t } from "$lib/i18n";
  import { page } from "$app/state";
  import { AvatarPreview } from "$lib/components/ui/avatar-preview";
  import { Button } from "$lib/components/ui/button";
  import { TextInput } from "$lib/components/ui/input";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import FormLabelWithPriorityHelp from "$lib/components/forms/FormLabelWithPriorityHelp.svelte";
  import {
    FormField,
    FormLabel,
    FormControl,
    FormFieldErrors,
    TranslatedFormFieldErrors,
  } from "$lib/components/ui/form";
  import {
    hashSeedToIndex,
    avatarChromePaletteToHex,
  } from "$lib/avatar-chrome-palette";
  import { ColorSelector } from "$lib/components/ui/color-selector";
  import { ComboSelect } from "$lib/components/ui/combo-select";
  import { apiFetch } from "$lib/api";
  import { onMount, untrack } from "svelte";
  import { userProfileStore } from "$lib/user-profile-store.svelte";
  import { formatUiDateTime } from "$lib/i18n";
  import { uiLang } from "$lib/i18n/store.svelte";
  import FormPageLayout from "$lib/components/FormPageLayout.svelte";
  import AppPageBreadcrumb from "$lib/components/AppPageBreadcrumb.svelte";
  import { settingsTabMenuSegment } from "$lib/breadcrumb/settings-breadcrumb";
  import type { EntityMetadata } from "$lib/composables/useEntityMetadata.svelte";
  import type { MetaColumn } from "$lib/entity-list/types";
  import { useEntityMetadata } from "$lib/composables/useEntityMetadata.svelte";
  import { useFormGuard } from "$lib/composables/useFormGuard.svelte";
  import { useActiveRoles } from "$lib/composables/useActiveRoles.svelte";
  import { useUnsavedChangesGuard } from "$lib/composables/useUnsavedChangesGuard.svelte";
  import { buildAuditData } from "$lib/utils/audit-data";
  import MetadataLoading from "$lib/components/ui/metadata-loading/MetadataLoading.svelte";
  import { displayNameSchema } from "$lib/validation/display-name";
  import PasskeyEnrollment from "$lib/components/auth/PasskeyEnrollment.svelte";
  import MfaManagement from "$lib/components/auth/MfaManagement.svelte";

  // Zod schema for profile form
  const profileSchema = z.object({
    idp_code: z.string().optional(),
    idp_org: z.string().optional(),
    idp_username: z.string().optional(),
    display_name: displayNameSchema(z.string()),
    email: z.string().email({ message: 'validation.invalidEmail' }),
    avatar_color: z.string().min(1, { message: 'validation.required' }),
    avatar_initials: z.string().min(1, { message: 'validation.required' }),
    is_admin: z.boolean().optional(),
    is_verified: z.boolean().optional(),
    email_verified: z.boolean().optional(),
    issuer: z.string().optional(),
    roles: z.array(z.string()).optional().default([]),
  });

  type ProfileForm = z.infer<typeof profileSchema>;

  // Superforms in SPA mode
  const superFormObj = superForm(defaults(zod4(profileSchema)), {
    SPA: true,
    validators: zod4(profileSchema),
    validationMethod: 'oninput',
    invalidateAll: false,
    resetForm: false,
    async onUpdate({ form: updateForm, cancel }) {
      if (!updateForm.valid) return;

      try {
        // Exclude immutable IDP fields from PATCH request
        const { idp_code, idp_org, idp_username, is_admin, is_verified, email_verified, issuer, roles, ...requestData } =
          updateForm.data;
        const response = await apiFetch("/api/v1/auth/me", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Failed to update profile:", errorData);
          cancel();
          return;
        }

        const data = await response.json();
        if (data.success && data.profile) {
          console.log("Profile updated successfully");

          // Update form with response data
          $form.idp_code = data.profile.idp_code || $form.idp_code;
          $form.idp_org = data.profile.idp_org || $form.idp_org;
          $form.idp_username = data.profile.idp_username || $form.idp_username;
          $form.display_name = data.profile.display_name || $form.display_name;
          $form.email = data.profile.email || $form.email;
          $form.avatar_color = data.profile.avatar_color || $form.avatar_color;
          $form.avatar_initials =
            data.profile.avatar_initials || $form.avatar_initials;
          $form.is_admin =
            data.profile.is_admin !== undefined
              ? data.profile.is_admin
              : $form.is_admin;
          $form.is_verified =
            data.profile.is_verified !== undefined
              ? data.profile.is_verified
              : $form.is_verified;
          $form.email_verified =
            data.profile.email_verified !== undefined
              ? data.profile.email_verified
              : $form.email_verified;
          $form.issuer = data.profile.issuer || $form.issuer;

          // Update store (automatically refreshes AppSidebar)
          userProfileStore.set({
            uuid: data.profile.uuid,
            idp_code: data.profile.idp_code,
            idp_org: data.profile.idp_org,
            idp_username: data.profile.idp_username,
            display_name: data.profile.display_name,
            email: data.profile.email,
            avatar_color: data.profile.avatar_color,
            avatar_initials: data.profile.avatar_initials,
            is_admin: data.profile.is_admin,
            is_verified: data.profile.is_verified,
            email_verified: data.profile.email_verified,
            issuer: data.profile.issuer,
            roles: data.profile.roles ?? [],
            // Audit fields
            created_at: data.profile.created_at,
            created_by: data.profile.created_by,
            created_by_name: data.profile.created_by_name,
            updated_at: data.profile.updated_at,
            updated_by: data.profile.updated_by,
            updated_by_name: data.profile.updated_by_name,
            version: data.profile.version,
            last_synced_at: data.profile.last_synced_at,
          });

          // Reset baseline to clear taint state after successful save
          reset({ data: $form });
        }
      } catch (error) {
        console.error("Failed to update profile:", error);
        cancel();
      }
    },
  });

  const { form, errors, enhance, reset, tainted, isTainted } = superFormObj;

  const { hasChanges, canSave } = useFormGuard(
    () => $tainted,
    () => $errors as Record<string, unknown>,
    isTainted as (path?: unknown) => boolean,
  );

  // Audit derived values from store
  const profile = $derived(userProfileStore.current);
  const createdAt = $derived.by(() => profile?.created_at ? formatUiDateTime(profile.created_at, $uiLang) : '');
  const createdBy = $derived(profile?.created_by || '');
  const createdByName = $derived(profile?.created_by_name || '');
  const updatedAt = $derived.by(() => profile?.updated_at ? formatUiDateTime(profile.updated_at, $uiLang) : '');
  const updatedBy = $derived(profile?.updated_by || '');
  const updatedByName = $derived(profile?.updated_by_name || '');
  const lastSyncedAt = $derived.by(() => profile?.last_synced_at ? formatUiDateTime(profile.last_synced_at, $uiLang) : '');
  const userUuid = $derived(profile?.uuid || '');
  const auditData = $derived(profile ? buildAuditData(profile) : buildAuditData());
  const deletedAt = $derived('');
  const deletedBy = $derived('');
  const deletedByName = $derived('');

  let isCreatePage = $state(false);
  const { roleNames: availableRoles } = useActiveRoles();
  const metadata = useEntityMetadata({
    endpoint: '/api/v1/auth/me/meta',
    entityName: 'user_profiles'
  });

  function getColMeta(key: string) {
    return metadata.state.meta?.list?.columns?.find((c) => c.key === key);
  }

  // Block internal navigation when there are changes
  const { handleBeforeUnload } = useUnsavedChangesGuard(
    () => hasChanges,
    'shell.settings.profile.unsavedChanges',
  );

  // Reactively load profile when store changes
  $effect(() => {
    // Explicitly track ONLY the profile store
    const currentProfile = userProfileStore.current;

    if (currentProfile) {
      untrack(() => {
        loadProfile(); // Runs cleanly without creating unintended dependencies
      });
    }
  });

  function loadProfile() {
    const profile = userProfileStore.current;
    if (!profile) return;

    // If avatar_color is null, use the hex value from the palette
    const seed = profile.display_name || "PB";
    const words = seed.trim().split(/\s+/).filter((w) => w.length > 0);
    const firstLetter = words[0]?.[0]?.toUpperCase() || "P";
    const lastLetter = words.length > 1 ? words[words.length - 1][0].toUpperCase() : words[0]?.slice(1, 2)?.toUpperCase() || "B";
    const calculatedInitials = words.length > 1 ? firstLetter + lastLetter : words[0]?.slice(0, 2)?.toUpperCase() || firstLetter;
    const paletteIndex = hashSeedToIndex(calculatedInitials, 10);

    reset({
      data: {
        idp_code: profile.idp_code || "",
        idp_org: profile.idp_org || "",
        idp_username: profile.idp_username || "",
        display_name: profile.display_name || "",
        email: profile.email || "",
        avatar_color: profile.avatar_color || avatarChromePaletteToHex(paletteIndex),
        avatar_initials: profile.avatar_initials || calculatedInitials,
        is_admin: profile.is_admin !== undefined ? profile.is_admin : false,
        is_verified: profile.is_verified,
        email_verified: profile.email_verified,
        issuer: profile.issuer || "",
        roles: profile.roles ?? []
      }
    });
  }

  // Refresh profile from server on mount
  onMount(async () => {
    void metadata.loadMetadata();
    try {
      const response = await apiFetch("/api/v1/auth/me");
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.profile) {
          // Update store with fresh data from server
          userProfileStore.set({
            uuid: data.profile.uuid,
            idp_code: data.profile.idp_code,
            idp_org: data.profile.idp_org,
            idp_username: data.profile.idp_username,
            display_name: data.profile.display_name,
            email: data.profile.email,
            avatar_color: data.profile.avatar_color,
            avatar_initials: data.profile.avatar_initials,
            is_admin: data.profile.is_admin,
            is_verified: data.profile.is_verified,
            email_verified: data.profile.email_verified,
            issuer: data.profile.issuer,
            roles: data.profile.roles ?? [],
            // Audit fields
            created_at: data.profile.created_at,
            created_by: data.profile.created_by,
            created_by_name: data.profile.created_by_name,
            updated_at: data.profile.updated_at,
            updated_by: data.profile.updated_by,
            updated_by_name: data.profile.updated_by_name,
            version: data.profile.version,
            last_synced_at: data.profile.last_synced_at,
          });
        }
      }
    } catch (error) {
      console.error("Failed to refresh profile:", error);
    }
  });
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

{#if !metadata.state.loading}
  <FormPageLayout
    entity="user_profiles"
    rowUuid={userUuid}
    meta={(metadata.state.meta as EntityMetadata | null) || undefined}
    auditData={auditData}
    auditingColumns={(metadata.state.meta?.list?.auditingColumns as MetaColumn[] | undefined) || []}
    isCreatePage={isCreatePage}
  >
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key)
          })
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.profile.title')}</h1>
    </div>
  {/snippet}
  {#snippet children()}
    <div class="flex-1 overflow-auto p-4">
      <div class="space-y-6">
        <!-- Top Section: 2 columns 50/50 -->
        <div class="grid grid-cols-2 gap-6">
          <!-- Column 1: Avatar + Color Picker -->
          <div class="space-y-4">
            <!-- Avatar with displayname and email -->
            <div class="flex items-center gap-4">
              <AvatarPreview
                displayName={$form.display_name}
                avatarColor={$form.avatar_color}
                defaultSeed="PB"
              />
              <div>
                <p class="font-medium">
                  {$form.display_name ||
                    $t("shell.settings.profile.displayNamePlaceholder")}
                </p>
                <p class="text-sm text-muted-foreground">
                  {$form.email || $t("shell.settings.profile.emailPlaceholder")}
                </p>
              </div>
            </div>

            <!-- Color Picker -->
            <ColorSelector
              bind:value={$form.avatar_color}
              labelKey="shell.settings.profile.avatarColor"
              triggerId="avatar-color-trigger"
            />
          </div>

          <!-- Column 2: Empty -->
          <div></div>
        </div>

        <!-- Form Fields Section: 2 columns 50/50 -->
        <form use:enhance id="profile-form">
          <div class="grid grid-cols-2 gap-6">
            <!-- Column 1: Display Name + Email -->
            <div class="space-y-4">
              <FormField form={superFormObj} name="display_name">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}
                        required>{$t("shell.settings.profile.displayName")}</FormLabel
                      >
                      <TextInput
                        type="text"
                        placeholder={$t(
                          "shell.settings.profile.displayNamePlaceholder",
                        )}
                        bind:value={$form.display_name}
                        {...props}
                        class="mt-2"
                      />
                      <TranslatedFormFieldErrors />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <FormField form={superFormObj} name="email">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}
                        required>{$t("shell.settings.profile.email")}</FormLabel
                      >
                      <TextInput
                        type="email"
                        placeholder={$t("shell.settings.profile.emailPlaceholder")}
                        bind:value={$form.email}
                        {...props}
                        class="mt-2"
                      />
                      <TranslatedFormFieldErrors />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <FormField form={superFormObj} name="roles">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t("shell.settings.profile.roles")}</FormLabel>
                      <ComboSelect
                        {...props}
                        mode="multi"
                        bind:value={$form.roles}
                        options={availableRoles}
                        disabled
                        placeholder={$t("shell.settings.profile.rolesPlaceholder")}
                      />
                      <TranslatedFormFieldErrors />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>
            </div>

            <!-- Column 2: idp_code, idp_org, idp_username (readonly) -->
            <div class="space-y-4">
              <FormField form={superFormObj} name="idp_code">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}
                        >{$t("shell.settings.profile.idpCode")}</FormLabel
                      >
                      <TextInput
                        type="text"
                        bind:value={$form.idp_code}
                        readonly
                        class="mt-2"
                        {...props}
                        copyTooltipLabel={$t("shell.settings.profile.copyIdpCode")}
                      />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <FormField form={superFormObj} name="idp_org">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}
                        >{$t("shell.settings.profile.idpOwner")}</FormLabel
                      >
                      <TextInput
                        type="text"
                        bind:value={$form.idp_org}
                        readonly
                        class="mt-2"
                        {...props}
                        copyTooltipLabel={$t("shell.settings.profile.copyIdpOwner")}
                      />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <FormField form={superFormObj} name="idp_username">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}
                        >{$t("shell.settings.profile.idpName")}</FormLabel
                      >
                      <TextInput
                        type="text"
                        bind:value={$form.idp_username}
                        readonly
                        class="mt-2"
                        {...props}
                        copyTooltipLabel={$t("shell.settings.profile.copyIdpName")}
                      />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <FormField form={superFormObj} name="issuer">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id}>{$t("shell.settings.profile.idpIssuer")}</FormLabel>
                      <TextInput
                        type="text"
                        bind:value={$form.issuer}
                        readonly
                        class="mt-2"
                        {...props}
                        copyTooltipLabel={$t("shell.settings.profile.copyIdpIssuer")}
                      />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <FormField form={superFormObj} name="is_admin">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="flex items-center space-x-2">
                      <Checkbox {...props} checked={$form.is_admin === true} disabled id={props.id} />
                      <label for={props.id} class="inline-flex items-center gap-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {$t("shell.settings.profile.idpAdmin")}
                        {#if getColMeta('is_admin')?.tooltip && getColMeta('is_admin')?.showFormTooltip !== false}
                          <FormLabelWithPriorityHelp
                            text={$t(getColMeta('is_admin')!.tooltip!)}
                            priority={getColMeta('is_admin')?.tooltipPriority}
                            title={getColMeta('is_admin')?.tooltipTitle ? $t(getColMeta('is_admin')!.tooltipTitle!) : undefined}
                          />
                        {/if}
                      </label>
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <FormField form={superFormObj} name="is_verified">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="flex items-center space-x-2">
                      <Checkbox {...props} checked={$form.is_verified === true} disabled id={props.id} />
                      <label for={props.id} class="inline-flex items-center gap-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {$t("shell.settings.profile.idpVerified")}
                        {#if getColMeta('is_verified')?.tooltip && getColMeta('is_verified')?.showFormTooltip !== false}
                          <FormLabelWithPriorityHelp
                            text={$t(getColMeta('is_verified')!.tooltip!)}
                            priority={getColMeta('is_verified')?.tooltipPriority}
                            title={getColMeta('is_verified')?.tooltipTitle ? $t(getColMeta('is_verified')!.tooltipTitle!) : undefined}
                          />
                        {/if}
                      </label>
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>

              <FormField form={superFormObj} name="email_verified">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="flex items-center space-x-2">
                      <Checkbox {...props} checked={$form.email_verified === true} disabled id={props.id} />
                      <label for={props.id} class="inline-flex items-center gap-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {$t("shell.settings.profile.idpEmailVerified")}
                        {#if getColMeta('email_verified')?.tooltip && getColMeta('email_verified')?.showFormTooltip !== false}
                          <FormLabelWithPriorityHelp
                            text={$t(getColMeta('email_verified')!.tooltip!)}
                            priority={getColMeta('email_verified')?.tooltipPriority}
                            title={getColMeta('email_verified')?.tooltipTitle ? $t(getColMeta('email_verified')!.tooltipTitle!) : undefined}
                          />
                        {/if}
                      </label>
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>
            </div>
          </div>
        </form>

        <!-- Passkey / WebAuthn enrollment section -->
        <PasskeyEnrollment />

        <!-- MFA / 2FA management section -->
        <MfaManagement />
      </div>
    </div>
  {/snippet}

  {#snippet footerActions()}
    <Button type="submit" form="profile-form" disabled={!canSave}>
      {$t('common.save')}
    </Button>
  {/snippet}
</FormPageLayout>
{:else}
  <MetadataLoading entityName="user_profiles" loadingText="Caricamento dei metadati del profilo..." />
{/if}
