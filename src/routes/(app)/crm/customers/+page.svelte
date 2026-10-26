<script lang="ts">
  import { t } from '$lib/i18n';
  import { page as appPage } from '$app/state';
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { moduleBreadcrumbSegments } from '$lib/breadcrumb/module-breadcrumb';
  import { entityApiBase } from '$lib/api';
</script>

<EntityTablePage
  basePath={entityApiBase('customer')}
  storageKeyPrefix="pb:customers:list:"
  errorScopeKey="app.common.errors.scope.customersList"
  errorScopeKeyInit="app.common.errors.scope.customersPageInit"
>
  {#snippet breadcrumb()}
    <AppPageBreadcrumb
      segments={[
        ...moduleBreadcrumbSegments({
          pathname: appPage.url.pathname,
          t: (key) => $t(key)
        })
      ]}
    />
  {/snippet}
</EntityTablePage>
