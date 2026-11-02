<script lang="ts">
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import ChangePasswordDialog from '$lib/components/entity-list-table/dialogs/ChangePasswordDialog.svelte';

  type UserProfileListRow = {
    uuid: string;
    idp_code: string;
    display_name: string | null;
    email: string | null;
    is_active: boolean | null;
    is_admin: boolean | null;
    is_verified: boolean | null;
    created_at: string;
    updated_at: string;
    version: number;
    created_by?: string;
    updated_by?: string;
    deleted_at?: string;
    deleted_by?: string;
  } & Record<string, unknown>;

  let changePasswordOpen = $state(false);
  let changePasswordRow = $state<UserProfileListRow | null>(null);
</script>

<EntityTablePage
  basePath="/api/v1/entities/user_profile"
  storageKeyPrefix="pb:users:list:"
  syncChannel="primebrick_users_sync"
  errorScopeKey="app.common.errors.scope.usersList"
  createPath="/system/settings/users/create"
  editPath="/system/settings/users/:uuid"
  customActionHandlers={{
    change_password: (row: UserProfileListRow) => {
      changePasswordRow = row;
      changePasswordOpen = true;
    }
  }}
>
  {#snippet extraDialogs(uid: string)}
    <ChangePasswordDialog bind:open={changePasswordOpen} row={changePasswordRow} {uid} />
  {/snippet}
</EntityTablePage>
