<script lang="ts">
  /**
   * /jobs — job_schedule list, HOST-rendered EntityTablePage (standard
   * archetype). Declared by the job service's `endpoints.nav` census
   * (`kind:"list"`, `entity:"job_schedule"`); api_base resolves via
   * ENTITY_SERVICE_MAP → /ws/job.
   *
   * The `schedule_kind` filter preset (recurring / once / all) renders in
   * the toolbar from `meta.table.filter_presets`; the `run_stats` column
   * is the builtin `type:"sparkline"` cell. The "Schedule" CTA navigates
   * to /jobs/new — the module-owned remote page (manual scheduling is a
   * workflow, not a plain entity form).
   */
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import EntityTablePage from '$lib/components/entity-table-page/EntityTablePage.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { moduleMenuSegment } from '$lib/breadcrumb/module-breadcrumb';
  import { Button } from '$lib/components/ui/button';
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
        moduleMenuSegment({
          pathname: appPage.url.pathname,
          t: (key) => $t(key)
        })
      ]}
    />
  {/snippet}
  {#snippet headerActions()}
    <Button
      data-testid="jobs-schedule-cta"
      onclick={() => void goto(resolve('/jobs/new'))}
    >
      {$t('job.jobs.scheduleNew')}
    </Button>
  {/snippet}
</EntityTablePage>
