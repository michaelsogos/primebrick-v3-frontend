<script lang="ts">
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
</script>

<EntityTablePage
  basePath="/api/v1/entities/organization"
  storageKeyPrefix="pb:organizations:list:"
  syncChannel="primebrick_organizations_sync"
  errorScopeKey="app.common.errors.scope.organizationsList"
  errorScopeKeyInit="app.common.errors.scope.organizationsPageInit"
  createPath="/system/settings/organizations/create"
  editPath="/system/settings/organizations/:uuid"
>
</EntityTablePage>
