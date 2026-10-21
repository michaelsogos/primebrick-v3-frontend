<script lang="ts">
  /**
   * /system/job/rules — job_rule list, HOST-rendered EntityTablePage
   * (standard archetype). Declared by the job service's `endpoints.nav`
   * census (`kind:"list"`, `entity:"job_rule"`); api_base resolves via
   * ENTITY_SERVICE_MAP → /ws/job.
   *
   * The breadcrumb renders the JOB module's nav menu — the page is owned
   * by the `job` module (route_prefix `/system/job`), never by settings.
   * The create CTA is census-derived (`/system/job/rules/new` is
   * `kind:"create"` on `job_rule`).
   */
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { moduleBreadcrumbSegments } from '$lib/breadcrumb/module-breadcrumb';
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
        ...moduleBreadcrumbSegments({
          pathname: appPage.url.pathname,
          t: (key) => $t(key)
        })
      ]}
    />
  {/snippet}
</EntityTablePage>
