<script lang="ts">
  import { t } from '$lib/i18n';
  import { page as appPage } from '$app/state';
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
</script>

<EntityTablePage
  basePath="/api/v1/entities/organization"
  storageKeyPrefix="pb:organizations:list:"
  syncChannel="primebrick_organizations_sync"
  errorScopeKey="app.common.errors.scope.organizationsList"
  errorScopeKeyInit="app.common.errors.scope.organizationsPageInit"
  navStrategy="popup"
  createPath="/system/settings/organizations/create"
  editPath="/system/settings/organizations/:uuid"
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
