<script lang="ts">
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
</script>

<EntityTablePage
  basePath="/api/v1/entities/client_registry"
  storageKeyPrefix="pb:client_registry:list:"
  syncChannel="primebrick_client_registry_sync"
  errorScopeKey="app.common.errors.scope.clientsList"
  errorScopeKeyInit="app.common.errors.scope.clientsPageInit"
  createPath="/system/settings/clients/create"
  editPath="/system/settings/clients/:uuid"
>
</EntityTablePage>
