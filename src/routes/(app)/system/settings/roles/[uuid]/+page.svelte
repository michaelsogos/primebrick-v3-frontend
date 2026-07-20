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
  import {
    AnchorTabs,
    AnchorTabsList,
    AnchorTabsTrigger,
    AnchorTabsContent,
    AnchorTabsModeSwitch,
  } from '$lib/components/anchor-tabs';
  import { usePermissionsCatalog } from '$lib/composables/usePermissionsCatalog.svelte';
  import { useRoleMappings, type RoleMapping } from '$lib/composables/useRoleMappings.svelte';

  let saving = $state(false);
  let deleting = $state(false);
  let deleteOpen = $state(false);
  let role = $state<RoleMapping | null>(null);
  let loading = $state(true);
  let notFound = $state(false);

  // Form state
  let label_key = $state('');
  let is_admin = $state(false);
  let selected_permissions = $state<Set<string>>(new Set());

  const permissionsCatalog = usePermissionsCatalog();
  const roleMappings = useRoleMappings();

  const uuid_param = $derived(page.params.uuid);

  onMount(async () => {
    if (!uuid_param) {
      notFound = true;
      loading = false;
      return;
    }
    const loaded = await roleMappings.get(uuid_param);
    if (!loaded) {
      notFound = true;
      loading = false;
      return;
    }
    role = loaded;
    label_key = loaded.label_key ?? '';
    is_admin = loaded.is_admin;
    selected_permissions = new Set(loaded.permissions);
    loading = false;
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

  async function handleSubmit() {
    if (!role) return;
    saving = true;
    const ok = await roleMappings.update(role.uuid, {
      label_key: label_key || undefined,
      is_admin,
      permissions: Array.from(selected_permissions),
    });
    saving = false;
    if (ok) {
      goto('/system/settings/roles');
    }
  }

  async function handleDelete() {
    if (!role) return;
    deleting = true;
    const ok = await roleMappings.remove(role.uuid);
    deleting = false;
    if (ok) {
      deleteOpen = false;
      goto('/system/settings/roles');
    }
  }

  function handleCancel() {
    goto('/system/settings/roles');
  }
</script>

<svelte:head>
  <title>{$t('shell.settings.roles.editTitle')} · Primebrick</title>
</svelte:head>

<AppPageScaffold>
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
      <div class="flex items-center justify-between gap-4">
        <h1 class="truncate text-xl font-semibold leading-tight">
          {$t('shell.settings.roles.editTitle')}
          {#if role}
            <span class="font-mono text-base text-muted-foreground">{role.idp_role}</span>
          {/if}
        </h1>
        {#if role}
          <Button
            variant="destructive"
            size="sm"
            onclick={() => (deleteOpen = true)}
            disabled={deleting}
            data-testid="roles-edit-delete-btn"
          >
            {$t('shell.settings.roles.delete')}
          </Button>
        {/if}
      </div>
    </div>
  {/snippet}

  <p class="text-sm text-muted-foreground mb-4">{$t('shell.settings.roles.editSubtitle')}</p>

  {#if loading}
    <p class="text-sm text-muted-foreground">{$t('common.loading')}</p>
  {:else if notFound}
    <div class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      {$t('shell.settings.roles.notFound')}
    </div>
  {:else if role}
    <AnchorTabs value="details">
      <div class="flex items-center justify-between gap-4">
        <AnchorTabsList>
          <AnchorTabsTrigger value="details">{$t('shell.settings.roles.tabDetails')}</AnchorTabsTrigger>
          <AnchorTabsTrigger value="permissions">{$t('shell.settings.roles.tabPermissions')}</AnchorTabsTrigger>
        </AnchorTabsList>
        <AnchorTabsModeSwitch
          label_show_all={$t('shell.settings.roles.modeShowAll')}
          label_hide={$t('shell.settings.roles.modeHide')}
        />
      </div>

      <AnchorTabsContent value="details">
        <div class="space-y-6 max-w-2xl pt-6">
          <div class="space-y-2">
            <Label for="idp_role">{$t('shell.settings.roles.fieldIdpRole')}</Label>
            <Input
              id="idp_role"
              value={role.idp_role}
              disabled
              class="font-mono bg-muted/50"
              data-testid="roles-edit-idp-role"
            />
            <p class="text-xs text-muted-foreground">{$t('shell.settings.roles.fieldIdpRoleImmutable')}</p>
          </div>

          <div class="space-y-2">
            <Label for="idp_org">{$t('shell.settings.roles.fieldIdpOrg')}</Label>
            <Input
              id="idp_org"
              value={role.idp_org ?? ''}
              disabled
              class="font-mono bg-muted/50"
              data-testid="roles-edit-idp-org"
            />
            <p class="text-xs text-muted-foreground">{$t('shell.settings.roles.fieldIdpOrgImmutable')}</p>
          </div>

          <div class="space-y-2">
            <Label for="label_key">{$t('shell.settings.roles.fieldLabelKey')}</Label>
            <Input
              id="label_key"
              bind:value={label_key}
              placeholder="e.g. shell.roles.sales_manager"
              class="font-mono"
              data-testid="roles-edit-label-key"
            />
            <p class="text-xs text-muted-foreground">{$t('shell.settings.roles.fieldLabelKeyHint')}</p>
          </div>

          <div class="flex items-center gap-3">
            <Checkbox
              id="is_admin"
              bind:checked={is_admin}
              data-testid="roles-edit-is-admin"
            />
            <Label for="is_admin" class="cursor-pointer">
              {$t('shell.settings.roles.fieldIsAdmin')}
            </Label>
            <p class="text-xs text-muted-foreground">{$t('shell.settings.roles.fieldIsAdminHint')}</p>
          </div>

          {#if role.last_synced_at}
            <div class="text-xs text-muted-foreground">
              {$t('shell.settings.roles.lastSynced')}: {new Date(role.last_synced_at).toLocaleString()}
            </div>
          {/if}
        </div>
      </AnchorTabsContent>

      <AnchorTabsContent value="permissions">
        <div class="space-y-6 pt-6">
          {#if permissionsCatalog.state.loading}
            <p class="text-sm text-muted-foreground">{$t('shell.settings.roles.permissionsLoading')}</p>
          {:else if permissionsCatalog.state.modules.length === 0}
            <p class="text-sm text-muted-foreground">{$t('shell.settings.roles.permissionsEmpty')}</p>
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
      <Button variant="outline" onclick={handleCancel} disabled={saving} data-testid="roles-edit-cancel">
        {$t('common.cancel')}
      </Button>
      <Button onclick={handleSubmit} disabled={saving} data-testid="roles-edit-submit">
        {saving ? $t('common.saving') : $t('common.save')}
      </Button>
    </div>
  {/if}
</AppPageScaffold>

{#if deleteOpen && role}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    role="dialog"
    aria-modal="true"
    data-testid="roles-edit-delete-dialog"
  >
    <div class="rounded-lg border bg-background p-6 shadow-lg max-w-md w-full mx-4">
      <h2 class="text-lg font-semibold">{$t('shell.settings.roles.deleteConfirmTitle')}</h2>
      <p class="text-sm text-muted-foreground mt-2">
        {$t('shell.settings.roles.deleteConfirmBody', { values: { role: role.idp_role } })}
      </p>
      <div class="flex justify-end gap-2 mt-6">
        <Button
          variant="outline"
          onclick={() => (deleteOpen = false)}
          disabled={deleting}
          data-testid="roles-edit-delete-cancel"
        >
          {$t('common.cancel')}
        </Button>
        <Button
          variant="destructive"
          onclick={handleDelete}
          disabled={deleting}
          data-testid="roles-edit-delete-confirm"
        >
          {deleting ? $t('common.deleting') : $t('common.delete')}
        </Button>
      </div>
    </div>
  </div>
{/if}
