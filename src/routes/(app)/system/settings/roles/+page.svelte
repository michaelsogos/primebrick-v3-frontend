<script lang="ts">
  import { t } from '$lib/i18n';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page as appPage } from '$app/state';
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';

  type RoleMappingListRow = {
    uuid: string;
    idp_role: string;
    idp_org?: string;
    label_key?: string;
    is_admin: boolean;
    permissions: string[];
    last_synced_at?: string;
    created_at: string;
    updated_at: string;
    version: number;
    created_by?: string;
    updated_by?: string;
  } & Record<string, unknown>;

  // Legacy sibling-refresh: after navigating to a form page we post 'refresh'
  // so other listeners on the same channel (e.g. a second tab on the list)
  // pick it up. The list itself is the receiver via `syncChannel`.
  const { notifyParentRefresh } = useSyncChannel('primebrick_roles_sync', { mode: 'sender' });
</script>

<svelte:head>
  <title>{$t('system.settings.roles.title')} · Primebrick</title>
</svelte:head>

<EntityTablePage
  basePath="/api/v1/entities/role_mapping"
  storageKeyPrefix="pb:role_mappings:list:"
  syncChannel="primebrick_roles_sync"
  errorScopeKey="app.common.errors.scope.rolesList"
  errorScopeKeyInit="app.common.errors.scope.rolesPageInit"
  deletionFilter={false}
  onCreateAction={() => {
    void goto(resolve('/system/settings/roles/create'));
    notifyParentRefresh();
  }}
  onEditAction={(row: RoleMappingListRow) => {
    void goto(resolve(`/system/settings/roles/${encodeURIComponent(row.uuid)}` as '/'));
    notifyParentRefresh();
  }}
>
  {#snippet breadcrumb()}
    <AppPageBreadcrumb
      segments={[
        { label: $t('system.settings.title'), href: '/system/settings/profile' },
        settingsTabMenuSegment({
          pathname: appPage.url.pathname,
          searchParams: appPage.url.searchParams,
          t: (key) => $t(key)
        })
      ]}
    />
  {/snippet}
</EntityTablePage>
