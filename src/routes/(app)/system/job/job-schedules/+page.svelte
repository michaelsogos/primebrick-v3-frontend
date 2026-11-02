<script lang="ts">
  /**
   * /system/job/job-schedules — job_schedule list, HOST-rendered
   * EntityTablePage (standard archetype). Declared by the job service's
   * `endpoints.nav` census (`kind:"list"`, `entity:"job_schedule"`);
   * api_base resolves via ENTITY_SERVICE_MAP → /svc/job.
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

  import { entityApiBase } from '$lib/api';
</script>


<EntityTablePage
  basePath={entityApiBase('job_schedule')}
  storageKeyPrefix="pb:jobs:schedules:"
  errorScopeKey="app.common.errors.scope.jobsList"
  errorScopeKeyInit="app.common.errors.scope.jobsPageInit"
  deletionFilter={false}
  syncChannel="primebrick_job_schedule_sync"
>
</EntityTablePage>
