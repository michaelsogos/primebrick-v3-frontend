<script lang="ts">
  import { t } from '$lib/i18n';
  import { page as appPage } from '$app/state';
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { moduleMenuSegment } from '$lib/breadcrumb/module-breadcrumb';
</script>

<EntityTablePage
  basePath="/api/v1/entities/customer"
  storageKeyPrefix="pb:customers:list:"
  errorScopeKey="app.common.errors.scope.customersList"
  errorScopeKeyInit="app.common.errors.scope.customersPageInit"
>
  {#snippet breadcrumb()}
    <AppPageBreadcrumb
      segments={[
        moduleMenuSegment({
          pathname: appPage.url.pathname,
          t: (key) => $t(key)
        })
      ]}
    />
  {/snippet}
</EntityTablePage>
