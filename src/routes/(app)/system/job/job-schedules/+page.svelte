<script lang="ts">
  /**
   * /system/job/job-schedules — job_schedule list, HOST-rendered
   * EntityTablePage (standard archetype). Declared by the job service's
   * `endpoints.nav` census (`kind:"list"`, `entity:"job_schedule"`);
   * api_base resolves via ENTITY_SERVICE_MAP → /ws/job.
   *
   * The `schedule_kind` filter preset (recurring / once / all) renders in
   * the toolbar from `meta.table.filter_presets`; the `run_stats` column
   * is the builtin `type:"sparkline"` cell. The create CTA in the toolbar
   * is census-derived — `/system/job/job-schedules/create` is
   * `kind:"create"` on `job_schedule` with `job.jobs.scheduleNew` label
   * (manual scheduling is a module-owned remote workflow, not a plain
   * entity form).
   */
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { moduleBreadcrumbSegments } from '$lib/breadcrumb/module-breadcrumb';
  import { page as appPage } from '$app/state';
  import { t } from '$lib/i18n';
  import { entityApiBase } from '$lib/api';
</script>

<svelte:head>
  <title>{$t('job.jobs.title')} · Primebrick</title>
</svelte:head>

<EntityTablePage
  basePath={entityApiBase('job_schedule')}
  storageKeyPrefix="pb:jobs:schedules:"
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
