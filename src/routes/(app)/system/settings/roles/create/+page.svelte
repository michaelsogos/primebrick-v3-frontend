<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { ComboSelect } from '$lib/components/ui/combo-select';
  import {
    AnchorTabs,
    AnchorTabsList,
    AnchorTabsTrigger,
    AnchorTabsContent,
    AnchorTabsModeSwitch,
  } from '$lib/components/anchor-tabs';
  import { usePermissionsCatalog } from '$lib/composables/usePermissionsCatalog.svelte';
  import { useRoleMappings } from '$lib/composables/useRoleMappings.svelte';
  import { apiFetch } from '$lib/api';

  interface OrgOption {
    idp_code: string;
    display_name: string | null;
  }

  let orgs = $state<OrgOption[]>([]);
  let orgsLoading = $state(true);
  let saving = $state(false);

  // Form state
  let idp_role = $state('');
  let idp_org = $state('');
  let label_key = $state('');
  let is_admin = $state(false);
  let selected_permissions = $state<Set<string>>(new Set());
  let errors = $state<Record<string, string>>({});

  const permissionsCatalog = usePermissionsCatalog();
  const roleMappings = useRoleMappings();

  onMount(async () => {
    try {
      const res = await apiFetch('/api/v1/system/organizations/active');
      if (res.ok) {
        const data = await res.json();
        orgs = (data.organizations ?? []) as OrgOption[];
      }
    } catch (e) {
      console.error('Failed to load organizations', e);
    } finally {
      orgsLoading = false;
    }
  });

  function togglePermission(code: string) {
    const next = new Set(selected_permissions);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
    }
    selected_permissions = next;
  }

  function toggleModule(code: string) {
    const module_perms = permissionsCatalog.state.modules.find((m) => m.code === code)?.permissions ?? [];
    const all_selected = module_perms.every((p) => selected_permissions.has(p.code));
    const next = new Set(selected_permissions);
    if (all_selected) {
      for (const p of module_perms) next.delete(p.code);
    } else {
      for (const p of module_perms) next.add(p.code);
    }
    selected_permissions = next;
  }

  function moduleAllSelected(code: string): boolean {
    const module_perms = permissionsCatalog.state.modules.find((m) => m.code === code)?.permissions ?? [];
    return module_perms.length > 0 && module_perms.every((p) => selected_permissions.has(p.code));
  }

  function moduleSomeSelected(code: string): boolean {
    const module_perms = permissionsCatalog.state.modules.find((m) => m.code === code)?.permissions ?? [];
    return module_perms.some((p) => selected_permissions.has(p.code)) && !moduleAllSelected(code);
  }

  function validate(): boolean {
    errors = {};
    if (!idp_role) {
      errors.idp_role = $t('system.settings.roles.validation.idpRoleRequired');
    } else if (!/^[a-z0-9_]+$/.test(idp_role)) {
      errors.idp_role = $t('system.settings.roles.validation.idpRoleFormat');
    }
    if (!idp_org) {
      errors.idp_org = $t('system.settings.roles.validation.idpOrgRequired');
    }
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    saving = true;
    const result = await roleMappings.create({
      idp_role,
      idp_org,
      label_key: label_key || undefined,
      is_admin,
      permissions: Array.from(selected_permissions),
    });
    saving = false;
    if (result) {
      goto('/system/settings/roles');
    }
  }

  function handleCancel() {
    goto('/system/settings/roles');
  }
</script>

<svelte:head>
  <title>{$t('system.settings.roles.createTitle')} · Primebrick</title>
</svelte:head>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('app.system') },
          { label: $t('system.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key)
          })
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('system.settings.roles.createTitle')}</h1>
    </div>
  {/snippet}

  <p class="text-sm text-muted-foreground mb-4">{$t('system.settings.roles.createSubtitle')}</p>

  <AnchorTabs value="details">
    <div class="flex items-center justify-between gap-4">
      <AnchorTabsList>
        <AnchorTabsTrigger value="details">{$t('system.settings.roles.tabDetails')}</AnchorTabsTrigger>
        <AnchorTabsTrigger value="permissions">{$t('system.settings.roles.tabPermissions')}</AnchorTabsTrigger>
      </AnchorTabsList>
      <AnchorTabsModeSwitch
        label_show_all={$t('system.settings.roles.modeShowAll')}
        label_hide={$t('system.settings.roles.modeHide')}
      />
    </div>

    <AnchorTabsContent value="details">
      <div class="space-y-6 max-w-2xl pt-6">
        <div class="space-y-2">
          <Label for="idp_role">{$t('system.settings.roles.fieldIdpRole')}</Label>
          <Input
            id="idp_role"
            bind:value={idp_role}
            placeholder="e.g. sales_manager"
            class="font-mono"
            aria-invalid={!!errors.idp_role}
            data-testid="roles-form-idp-role"
          />
          {#if errors.idp_role}
            <p class="text-sm text-destructive">{errors.idp_role}</p>
          {/if}
          <p class="text-xs text-muted-foreground">{$t('system.settings.roles.fieldIdpRoleHint')}</p>
        </div>

        <div class="space-y-2">
          <Label for="idp_org">{$t('system.settings.roles.fieldIdpOrg')}</Label>
          <ComboSelect
            mode="single"
            value={idp_org}
            onChange={(v) => (idp_org = v as string)}
            options={orgs}
            valueField="idp_code"
            labelField="idp_code"
            placeholder={$t('system.settings.roles.fieldIdpOrgPlaceholder')}
            loading={orgsLoading}
            searchable
            data-testid="roles-form-idp-org"
          />
          {#if errors.idp_org}
            <p class="text-sm text-destructive">{errors.idp_org}</p>
          {/if}
          <p class="text-xs text-muted-foreground">{$t('system.settings.roles.fieldIdpOrgHint')}</p>
        </div>

        <div class="space-y-2">
          <Label for="label_key">{$t('system.settings.roles.fieldLabelKey')}</Label>
          <Input
            id="label_key"
            bind:value={label_key}
            placeholder="e.g. shell.roles.sales_manager"
            class="font-mono"
            data-testid="roles-form-label-key"
          />
          <p class="text-xs text-muted-foreground">{$t('system.settings.roles.fieldLabelKeyHint')}</p>
        </div>

        <div class="flex items-center gap-3">
          <Checkbox
            id="is_admin"
            bind:checked={is_admin}
            data-testid="roles-form-is-admin"
          />
          <Label for="is_admin" class="cursor-pointer">
            {$t('system.settings.roles.fieldIsAdmin')}
          </Label>
          <p class="text-xs text-muted-foreground">{$t('system.settings.roles.fieldIsAdminHint')}</p>
        </div>
      </div>
    </AnchorTabsContent>

    <AnchorTabsContent value="permissions">
      <div class="space-y-6 pt-6">
        {#if permissionsCatalog.state.loading}
          <p class="text-sm text-muted-foreground">{$t('system.settings.roles.permissionsLoading')}</p>
        {:else if permissionsCatalog.state.modules.length === 0}
          <p class="text-sm text-muted-foreground">{$t('system.settings.roles.permissionsEmpty')}</p>
        {:else}
          {#each permissionsCatalog.state.modules as module (module.code)}
            <div class="rounded-md border" data-testid={`roles-perm-module-${module.code}`}>
              <div class="flex items-center gap-3 border-b px-4 py-3">
                <Checkbox
                  id={`module-${module.code}`}
                  checked={moduleAllSelected(module.code)}
                  indeterminate={moduleSomeSelected(module.code)}
                  onCheckedChange={() => toggleModule(module.code)}
                  data-testid={`roles-perm-module-toggle-${module.code}`}
                />
                <Label for={`module-${module.code}`} class="cursor-pointer font-medium">
                  {$t(module.label_key)}
                </Label>
                <span class="text-xs text-muted-foreground">
                  ({module.permissions.filter((p) => selected_permissions.has(p.code)).length}/{module.permissions.length})
                </span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-4">
                {#each module.permissions as perm (perm.code)}
                  <label class="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selected_permissions.has(perm.code)}
                      onCheckedChange={() => togglePermission(perm.code)}
                      data-testid={`roles-perm-${perm.code}`}
                    />
                    <span class="font-mono text-xs">{$t(perm.label_key)}</span>
                  </label>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </AnchorTabsContent>
  </AnchorTabs>

  <div class="flex items-center justify-end gap-2 pt-6 border-t mt-6">
    <Button variant="outline" onclick={handleCancel} disabled={saving} data-testid="roles-form-cancel">
      {$t('app.common.cancel')}
    </Button>
    <Button onclick={handleSubmit} disabled={saving} data-testid="roles-form-submit">
      {saving ? $t('app.common.saving') : $t('system.settings.roles.create')}
    </Button>
  </div>
</AppPageScaffold>
