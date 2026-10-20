<script lang="ts">
  /**
   * /system/jobs/rules — job_rule list, HOST-rendered EntityTablePage.
   *
   * The route is declared by the job service's `endpoints.nav` census
   * (`kind:"list"`, `entity:"job_rule"`) — the page archetype is the
   * standard metadata-driven list; the service proxy base resolves via
   * `entityApiBase` (ENTITY_SERVICE_MAP → `/ws/job`).
   */
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { page as appPage } from '$app/state';
  import { t } from '$lib/i18n';
  import { entityApiBase } from '$lib/api';
</script>

<EntityTablePage
  basePath={entityApiBase('job_rule')}
  storageKeyPrefix="pb:jobs:rules:"
  errorScopeKey="app.common.errors.scope.jobsList"
  errorScopeKeyInit="app.common.errors.scope.jobsPageInit"
>
  {#snippet breadcrumb()}
    <AppPageBreadcrumb
      segments={[
        { label: $t('app.system') },
        settingsTabMenuSegment({
          pathname: appPage.url.pathname,
          searchParams: appPage.url.searchParams,
          t: (key) => $t(key)
        })
      ]}
    />
  {/snippet}
</EntityTablePage>
