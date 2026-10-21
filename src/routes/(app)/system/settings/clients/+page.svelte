<script lang="ts">
  import { t } from '$lib/i18n';
  import { page as appPage } from '$app/state';
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { moduleBreadcrumbSegments } from '$lib/breadcrumb/module-breadcrumb';
</script>

<EntityTablePage
  basePath="/api/v1/entities/client_registry"
  storageKeyPrefix="pb:client_registry:list:"
  syncChannel="primebrick_client_registry_sync"
  errorScopeKey="app.common.errors.scope.clientsList"
  errorScopeKeyInit="app.common.errors.scope.clientsPageInit"
  navStrategy="popup"
  createPath="/system/settings/clients/create"
  editPath="/system/settings/clients/:uuid"
>
  {#snippet breadcrumb()}
    <AppPageBreadcrumb
      segments={[
        ...moduleBreadcrumbSegments({ pathname: appPage.url.pathname, t: (key) => $t(key) })
      ]}
    />
  {/snippet}
</EntityTablePage>
