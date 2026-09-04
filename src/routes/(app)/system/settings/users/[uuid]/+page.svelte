<script lang="ts">
  import { page } from '$app/state';
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { TextInput } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import { AvatarPreview } from '$lib/components/ui/avatar-preview';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import FormLabelWithPriorityHelp from '$lib/components/forms/FormLabelWithPriorityHelp.svelte';
  import { ColorSelector } from '$lib/components/ui/color-selector';
  import { ComboSelect } from '$lib/components/ui/combo-select';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import FormPageLayout from '$lib/components/FormPageLayout.svelte';
  import {
    FormField,
    FormLabel,
    FormControl,
    FormFieldErrors,
    TranslatedFormFieldErrors,
  } from '$lib/components/ui/form';
  import { superForm, defaults } from 'sveltekit-superforms';
  import { zod4 } from 'sveltekit-superforms/adapters';
  import { z } from 'zod';
  import { onMount } from 'svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { apiFetch } from '$lib/api';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { useEntityMetadata, type EntityMetadata } from '$lib/composables/useEntityMetadata.svelte';
  import { resolvePageTitle, getColMeta as getColMetaUtil } from '$lib/utils/entity-meta';
  import { useFormGuard } from '$lib/composables/useFormGuard.svelte';
  import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
  import { useActiveRoles } from '$lib/composables/useActiveRoles.svelte';
  import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte';
  import { buildAuditData } from '$lib/utils/audit-data';
  import { computeInitials } from '$lib/utils/avatar-initials';
  import { minMsg, maxMsg } from '$lib/validation/zod-messages';
  import { displayNameSchema } from '$lib/validation/display-name';
  import ShieldUser from '@lucide/svelte/icons/shield-user';
  import ShieldOff from '@lucide/svelte/icons/shield-off';

  const uuid = $derived(page.params.uuid);

  const { notifyParentRefresh } = useSyncChannel('primebrick_users_sync', { mode: 'sender' });

  const { state: rolesState } = useActiveRoles();
  const availableRoles = $derived([...rolesState.roles] as { idp_role: string; label_key?: string; permissions?: string[]; is_admin?: boolean }[]);

  onMount(() => {
    void entityMetadata.loadMetadata();
    void loadUser();
  });

  // Zod schema for user update form
  const updateSchema = z.object({
    display_name: displayNameSchema(z.string()),
    email: z.string()
      .email({ message: 'app.common.validation.invalidEmail' })
      .max(320, { message: maxMsg(320) })
      .optional()
      .or(z.literal('')),
    roles: z.array(z.string()).min(1, { message: 'app.common.validation.rolesRequired' }).default([]),
    avatar_color: z.string()
      .regex(/^#[0-9A-Fa-f]{6}$/, { message: 'app.common.validation.invalidFormat' })
      .optional()
      .or(z.literal('')),
  });

  type UpdateForm = z.infer<typeof updateSchema>;

  let user = $state<{
    uuid: string;
    idp_code: string;
    idp_org?: string;
    idp_username?: string;
    display_name?: string;
    email?: string;
    avatar_color?: string;
    avatar_initials?: string;
    roles?: string[];
    is_active?: boolean;
    is_admin?: boolean;
    is_verified?: boolean;
    email_verified?: boolean;
    issuer?: string;
    version: number;
    created_at?: string;
    created_by?: string;
    created_by_name?: string;
    updated_at?: string;
    updated_by?: string;
    updated_by_name?: string;
    last_synced_at?: string;
  } | null>(null);

  let meta = $state<EntityMetadata | null>(null);
  let pageTitle = $state('');
  let loading = $state(true);
  let isCreatePage = $state(false);

  const entityMetadata = useEntityMetadata({
    endpoint: '/api/v1/entities/user_profiles/meta',
    entityName: 'user_profiles',
  });

  $effect(() => {
    if (entityMetadata.state.meta) {
      meta = entityMetadata.state.meta as EntityMetadata;
    }
  });

  function getColMeta(key: string) {
    return getColMetaUtil(meta, key);
  }

  // Superforms in SPA mode
  const superFormObj = superForm(defaults(zod4(updateSchema)), {
    SPA: true,
    validators: zod4(updateSchema),
    validationMethod: 'oninput',
    invalidateAll: false,
    resetForm: false,
    async onChange() {
      // Force ALL errors to display on every change, regardless of taint.
      // validateForm({ update: true }) sets force=true in Form__displayNewErrors,
      // bypassing all taint/event/previous-error checks.
      // focusOnError: false prevents focus from jumping to the first invalid field.
      await superFormObj.validateForm({ update: true, focusOnError: false });
    },
    async onUpdate({ form: updateForm, cancel }) {
      if (!updateForm.valid) return;

      try {
        // Calculate avatar initials from display_name (unified with CREATE/PROFILE)
        const initials = computeInitials(updateForm.data.display_name, '??');

        const body = {
          display_name: updateForm.data.display_name,
          email: updateForm.data.email || undefined,
          avatar_color: updateForm.data.avatar_color || undefined,
          avatar_initials: initials,
          roles: updateForm.data.roles || [],
        };
        const response = await apiFetch(`/api/v1/entities/user_profiles/${uuid}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          cancel();
          return;
        }

        const data = await response.json();
        if (data) {
          console.log('User updated successfully');
          await loadUser();
          notifyParentRefresh();
          if (window.opener) {
            window.close();
          }
        }
      } catch (error) {
        console.error('Failed to update user:', error);
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

  async function loadUser() {
    loading = true;
    try {
      const response = await apiFetch(`/api/v1/entities/user_profiles/${uuid}`);
      if (!response.ok) {
        console.error('Failed to load user');
        return;
      }
      const data = await response.json();
      user = data;
      reset({
        data: {
          display_name: data.display_name || '',
          email: data.email || '',
          avatar_color: data.avatar_color || '',
          roles: data.roles || [],
        },
      });
      pageTitle = resolvePageTitle(
        meta,
        user as Record<string, unknown> | null,
        user?.display_name || user?.idp_username || '',
      );
    } catch (error) {
      console.error('Failed to load user:', error);
    } finally {
      loading = false;
    }
  }

  // Audit state
  const auditData = $derived(buildAuditData(user));

  const { handleBeforeUnload, handleCancel } = useUnsavedChangesGuard(
    () => hasChanges,
    'system.settings.users.update.unsavedChanges',
  );
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<FormPageLayout
  entity="user_profiles"
  rowUuid={uuid || ''}
  meta={meta || undefined}
  auditData={auditData}
  auditingColumns={meta?.list?.auditingColumns || []}
  isCreatePage={isCreatePage}
>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('app.system') },
          { label: $t('system.settings.title'), href: '/system/settings' },
          settingsTabMenuSegment({ pathname: page.url.pathname, searchParams: page.url.searchParams, t: $t }),
          { label: $t('system.settings.users.update.title') }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{pageTitle || $t('system.settings.users.update.title')}</h1>
    </div>
  {/snippet}

  {#snippet children()}
    {#if loading}
      <div class="flex items-center justify-center py-12">
        <div class="text-muted-foreground">{$t('app.common.loading')}</div>
      </div>
    {:else if user}
      <div class="flex-1 overflow-auto">
        <form id="user-update-form" use:enhance>
          <!-- Avatar Section -->
          <div class="p-4 border-b">
            <div class="space-y-4">
              <!-- Avatar with displayname and email -->
              <div class="flex items-center gap-4">
                <AvatarPreview
                  displayName={$form.display_name}
                  avatarColor={$form.avatar_color}
                />
                <div class="flex-1">
                  <p class="font-medium">
                    {$form.display_name || user?.display_name || ''}
                  </p>
                  <p class="text-sm text-muted-foreground">
                    {$form.email || user?.email || ''}
                  </p>
                </div>
              </div>

              <!-- Color Picker -->
              <ColorSelector
                bind:value={$form.avatar_color}
                labelKey="system.settings.users.update.avatarColor"
                placeholderKey="system.settings.users.update.selectColorPlaceholder"
                triggerId="avatar-color-trigger"
              />
            </div>
          </div>

          <!-- Two-column form -->
          <div class="grid grid-cols-2 gap-6 p-4">
            <!-- Column 1: Editable Primebrick fields -->
            <div class="space-y-4">
              <FormField form={superFormObj} name="display_name">
                <FormControl>
                  {#snippet children({ props })}
                    <div class="space-y-2">
                      <FormLabel for={props.id} required>{$t('system.settings.users.update.displayName')}</FormLabel>
                      <TextInput
                        {...props}
                        bind:value={$form.display_name}
                        placeholder={$t('system.settings.users.update.displayNamePlaceholder')}
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
                      <FormLabel for={props.id}>{$t('system.settings.users.update.email')}</FormLabel>
                      <TextInput
                        {...props}
                        type="email"
                        bind:value={$form.email}
                        placeholder={$t('system.settings.users.update.emailPlaceholder')}
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
                      <FormLabel for={props.id} required>{$t('system.settings.users.update.roles')}</FormLabel>
                      <ComboSelect
                        {...props}
                        mode="multi"
                        bind:value={$form.roles}
                        options={availableRoles.length > 0 ? availableRoles : [
                          { idp_role: 'administrators' },
                          { idp_role: 'sales' },
                          { idp_role: 'customer_service' },
                          { idp_role: 'hr' },
                          { idp_role: 'ops' },
                        ]}
                        valueField="idp_role"
                        labelField="label_key"
                        isLabelTranslated={true}
                        placeholder={$t('system.settings.users.update.rolesPlaceholder')}
                        isOptionDisabled={(opt) => {
                          const role = opt as Record<string, any>;
                          return !role.is_admin && (!role.permissions || !Array.isArray(role.permissions) || role.permissions.length === 0);
                        }}
                        getSearchKeywords={(opt) => {
                          const role = opt as Record<string, any>;
                          const kws: string[] = [];
                          if (role.is_admin) kws.push($t('app.auth.roles.systemAdministrator'));
                          if (Array.isArray(role.permissions)) kws.push(...role.permissions);
                          if (!role.is_admin && (!role.permissions || !Array.isArray(role.permissions) || role.permissions.length === 0)) {
                            kws.push($t('app.auth.roles.notValidRole'));
                          }
                          return kws;
                        }}
                      >
                        {#snippet itemSnippet({ option, resolvedLabel }: { option: string | Record<string, any>; selected: boolean; resolvedLabel: string; resolvedValue: string })}
                          {@const role = option as Record<string, any>}
                          <div class="flex flex-col min-w-0 flex-1 gap-0.5">
                            <span class="font-medium truncate">{resolvedLabel}</span>
                            {#if role.is_admin}
                              <Badge variant="outline" class="w-fit gap-1 text-[10px] py-0 px-1.5 text-success border-success/30">
                                <ShieldUser class="size-3" />
                                {$t('app.auth.roles.systemAdministrator')}
                              </Badge>
                            {:else if role.permissions && Array.isArray(role.permissions) && role.permissions.length > 0}
                              <span class="italic text-muted-foreground text-xs truncate">{role.permissions.join(', ')}</span>
                            {:else}
                              <Badge variant="outline" class="w-fit gap-1 text-[10px] py-0 px-1.5 text-muted-foreground border-muted-foreground/30">
                                <ShieldOff class="size-3" />
                                {$t('app.auth.roles.notValidRole')}
                              </Badge>
                            {/if}
                          </div>
                        {/snippet}
                      </ComboSelect>
                      <TranslatedFormFieldErrors />
                    </div>
                  {/snippet}
                </FormControl>
              </FormField>
            </div>

            <!-- Column 2: IDP fields (readonly) -->
            <div class="space-y-4">
              <div class="space-y-2">
                <label for="idp-code" class="text-sm font-medium">{$t('system.settings.users.update.idpCode')}</label>
                <TextInput id="idp-code" value={user?.idp_code} readonly />
              </div>

              <div class="space-y-2">
                <label for="idp-org" class="text-sm font-medium">{$t('system.settings.users.update.idpOrg')}</label>
                <TextInput id="idp-org" value={user?.idp_org} readonly />
              </div>

              <div class="space-y-2">
                <label for="idp-username" class="text-sm font-medium">{$t('system.settings.users.update.idpUsername')}</label>
                <TextInput id="idp-username" value={user?.idp_username} readonly />
              </div>

              <div class="space-y-2">
                <label for="issuer" class="text-sm font-medium">{$t('system.settings.users.update.issuer')}</label>
                <TextInput id="issuer" value={user?.issuer} readonly />
              </div>

              <!-- Readonly checkboxes -->
              <div class="flex items-center space-x-2">
                <Checkbox checked={user?.is_admin === true} disabled id="is-admin" />
                <label for="is-admin" class="inline-flex items-center gap-1 text-sm font-medium">{$t('system.settings.users.update.isAdmin')}
                  {#if getColMeta('is_admin')?.tooltip && getColMeta('is_admin')?.showFormTooltip !== false}
                    <FormLabelWithPriorityHelp
                      text={$t(getColMeta('is_admin')!.tooltip!)}
                      priority={getColMeta('is_admin')?.tooltipPriority}
                      title={getColMeta('is_admin')?.tooltipTitle ? $t(getColMeta('is_admin')!.tooltipTitle!) : undefined}
                    />
                  {/if}
                </label>
              </div>

              <div class="flex items-center space-x-2">
                <Checkbox checked={user?.is_active === true} disabled id="is-active" />
                <label for="is-active" class="text-sm font-medium">{$t('system.settings.users.update.isActive')}</label>
              </div>

              <div class="flex items-center space-x-2">
                <Checkbox checked={user?.is_verified === true} disabled id="is-verified" />
                <label for="is-verified" class="inline-flex items-center gap-1 text-sm font-medium">{$t('system.settings.users.update.isVerified')}
                  {#if getColMeta('is_verified')?.tooltip && getColMeta('is_verified')?.showFormTooltip !== false}
                    <FormLabelWithPriorityHelp
                      text={$t(getColMeta('is_verified')!.tooltip!)}
                      priority={getColMeta('is_verified')?.tooltipPriority}
                      title={getColMeta('is_verified')?.tooltipTitle ? $t(getColMeta('is_verified')!.tooltipTitle!) : undefined}
                    />
                  {/if}
                </label>
              </div>

              <div class="flex items-center space-x-2">
                <Checkbox checked={user?.email_verified === true} disabled id="email-verified" />
                <label for="email-verified" class="inline-flex items-center gap-1 text-sm font-medium">{$t('system.settings.users.update.emailVerified')}
                  {#if getColMeta('email_verified')?.tooltip && getColMeta('email_verified')?.showFormTooltip !== false}
                    <FormLabelWithPriorityHelp
                      text={$t(getColMeta('email_verified')!.tooltip!)}
                      priority={getColMeta('email_verified')?.tooltipPriority}
                      title={getColMeta('email_verified')?.tooltipTitle ? $t(getColMeta('email_verified')!.tooltipTitle!) : undefined}
                    />
                  {/if}
                </label>
              </div>
            </div>
          </div>
        </form>
      </div>
    {/if}
  {/snippet}

  {#snippet footerActions()}
    <div class="flex gap-2">
      <Button variant="outline" onclick={handleCancel}>
        {$t('app.common.cancel')}
      </Button>
      <Button type="submit" form="user-update-form" disabled={!canSave}>
        {$t('app.common.save')}
      </Button>
    </div>
  {/snippet}
</FormPageLayout>
