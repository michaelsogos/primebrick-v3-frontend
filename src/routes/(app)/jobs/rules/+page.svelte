<script lang="ts">
  /**
   * /jobs/rules — job_rule list, HOST-rendered EntityTablePage (standard
   * archetype). Declared by the job service's `endpoints.nav` census
   * (`kind:"list"`, `entity:"job_rule"`); api_base resolves via
   * ENTITY_SERVICE_MAP → /ws/job.
   *
   * The breadcrumb renders the JOB module's nav menu — the page is owned
   * by the `job` module (route_prefix `/jobs`), never by settings.
   */
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { moduleMenuSegment } from '$lib/breadcrumb/module-breadcrumb';
  import { page as appPage } from '$app/state';
  import { t } from '$lib/i18n';
  import { entityApiBase } from '$lib/api';
</script>

<EntityTablePage
  basePath={entityApiBase('job_rule')}
  storageKeyPrefix="pb:jobs:rules:"
  errorScopeKey="app.common.errors.scope.jobsList"
  errorScopeKeyInit="app.common.errors.scope.jobsPageInit"
  deletionFilter={false}
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
