<script lang="ts">
  /**
   * /system/jobs — job governance admin page.
   *
   * Three entity-list views over primebrick-job (via the BE /ws/job proxy):
   *   1. JOBS RECURRING    — job_schedule rows where schedule_type=recurring
   *   2. JOBS EXECUTED ONCE — job_schedule rows where schedule_type=once
   *   3. RUN HISTORY       — job_run execution records
   *
   * The per-row `run_stats` column is a meta-virtual cell fed by
   * POST /api/v1/actions/job-run-stats for the visible schedule subjects —
   * the Kestra-style execution histogram.
   */
  import { t } from '$lib/i18n';
  import { page as appPage } from '$app/state';
  import { apiFetchWithTimeout } from '$lib/api';
  import { apiFetchExt, extJsonStringify } from '$lib/api-ext';
  import { pushNotification } from '$lib/errors/app-errors';
  import { onConnectivityRestored } from '$lib/app-connectivity-events';
  import { onMount } from 'svelte';
  import { useEntityList } from '$lib/composables/useEntityList.svelte';
  import JobEntityTable from '$lib/components/jobs/JobEntityTable.svelte';
  import type { RunStatsBucket } from '$lib/components/jobs/RunStatsSparkline.svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import DialogBordered from '$lib/components/ui/dialog-bordered.svelte';
  import { TextInput } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  type JobRow = { uuid: string; schedule_subject?: string } & Record<string, unknown>;

  const BASE = '/ws/job/api/v1';

  // ── three list scopes ──────────────────────────────────────────────
  let runStats = $state<Record<string, RunStatsBucket[]>>({});
  let runStatsUnit = $state<string>('day');

  async function loadRunStats(rows: JobRow[]) {
    const subjects = rows.map((r) => r.schedule_subject).filter((s): s is string => !!s);
    if (!subjects.length) return;
    try {
      const res = await apiFetchWithTimeout(`${BASE}/actions/job-run-stats`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: extJsonStringify({ schedule_subjects: subjects }),
      }, 30_000);
      if (!res.ok) return;
      const data = (await res.json()) as { bucket_unit?: string; stats?: Record<string, RunStatsBucket[]> };
      if (data.stats) {
        runStats = { ...runStats, ...data.stats };
        if (data.bucket_unit) runStatsUnit = data.bucket_unit;
      }
    } catch {
      // sparkline is best-effort — the table still renders without it
    }
  }

  const recurring = useEntityList<JobRow>({
    basePath: `${BASE}/entities/job_schedule`,
    storageKeyPrefix: 'pb:jobs:recurring:',
    fixedFilters: [{ field: 'schedule_type', op: '=', value: 'recurring' }],
    onRowsLoaded: (rows) => void loadRunStats(rows),
  });

  const once = useEntityList<JobRow>({
    basePath: `${BASE}/entities/job_schedule`,
    storageKeyPrefix: 'pb:jobs:once:',
    fixedFilters: [{ field: 'schedule_type', op: '=', value: 'once' }],
    onRowsLoaded: (rows) => void loadRunStats(rows),
  });

  const runs = useEntityList<JobRow>({
    basePath: `${BASE}/entities/job_run`,
    storageKeyPrefix: 'pb:jobs:runs:',
  });

  const rules = useEntityList<JobRow>({
    basePath: `${BASE}/entities/job_rule`,
    storageKeyPrefix: 'pb:jobs:rules:',
  });

  // ── manual schedule dialog ─────────────────────────────────────────
  let scheduleDialogOpen = $state(false);
  let schedName = $state('');
  let schedSpec = $state('@every 1h');
  let schedLane = $state<'system' | 'user'>('system');
  let schedTargetService = $state('');
  let schedTargetAction = $state('');
  let schedBusy = $state(false);

  async function submitSchedule() {
    schedBusy = true;
    try {
      const name = schedName.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      const target = `jobs.due.${schedLane}.${schedTargetService.trim()}.${schedTargetAction.trim()}`;
      await apiFetchExt(`${BASE}/actions/schedule-job`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: extJsonStringify({
          schedule_subject: `jobs.schedule.job.${name}`,
          schedule: schedSpec.trim(),
          target,
        }),
      });
      scheduleDialogOpen = false;
      pushNotification({ impact: 'LOW', message: $t('system.jobs.scheduledOk'), scope: 'jobs.schedule' });
      void recurring.refreshRows();
      void once.refreshRows();
    } catch (e) {
      pushNotification({
        impact: 'MEDIUM',
        message: e instanceof Error ? e.message : 'SCHEDULE_FAILED',
        scope: 'jobs.schedule',
      });
    } finally {
      schedBusy = false;
    }
  }

  async function init() {
    await Promise.allSettled([
      recurring.init(), once.init(), runs.init(), rules.init(),
    ]);
  }

  onMount(() => {
    void init();
  });

  onConnectivityRestored(() => {
    void init();
  });
</script>

<svelte:head>
  <title>{$t('system.jobs.title')} · Primebrick</title>
</svelte:head>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 flex-1 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('app.system') },
          { label: $t('system.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: appPage.url.pathname,
            searchParams: appPage.url.searchParams,
            t: (key) => $t(key)
          })
        ]}
      />
      <div class="flex items-center justify-between gap-2">
        <h1 class="truncate text-xl font-semibold leading-tight">{$t('system.jobs.title')}</h1>
        <Button size="sm" onclick={() => (scheduleDialogOpen = true)}>
          {$t('system.jobs.scheduleNew')}
        </Button>
      </div>
    </div>
  {/snippet}

  <div class="flex flex-col gap-8">
    <section class="space-y-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {$t('system.jobs.sections.recurring')}
      </h2>
      <JobEntityTable list={recurring} {runStats} bucketUnit={runStatsUnit} />
    </section>

    <section class="space-y-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {$t('system.jobs.sections.once')}
      </h2>
      <JobEntityTable list={once} {runStats} bucketUnit={runStatsUnit} />
    </section>

    <section class="space-y-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {$t('system.jobs.sections.rules')}
      </h2>
      <JobEntityTable list={rules} />
    </section>

    <section class="space-y-2">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {$t('system.jobs.sections.runs')}
      </h2>
      <JobEntityTable list={runs} />
    </section>
  </div>

  <DialogBordered bind:open={scheduleDialogOpen} class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{$t('system.jobs.scheduleDialog.title')}</Dialog.Title>
      <Dialog.Description>{$t('system.jobs.scheduleDialog.desc')}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-4 py-2">
      <div class="grid gap-1.5">
        <Label for="sched-name">{$t('system.jobs.scheduleDialog.name')}</Label>
        <TextInput id="sched-name" bind:value={schedName} placeholder="nightly-cleanup" />
      </div>
      <div class="grid gap-1.5">
        <Label for="sched-spec">{$t('system.jobs.scheduleDialog.spec')}</Label>
        <TextInput id="sched-spec" bind:value={schedSpec} placeholder="@every 1h / @daily / cron" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="grid gap-1.5">
          <Label>{$t('system.jobs.scheduleDialog.lane')}</Label>
          <select
            class="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
            bind:value={schedLane}
          >
            <option value="system">system</option>
            <option value="user">user</option>
          </select>
        </div>
        <div class="grid gap-1.5">
          <Label for="sched-tgt-svc">{$t('system.jobs.scheduleDialog.targetService')}</Label>
          <TextInput id="sched-tgt-svc" bind:value={schedTargetService} placeholder="ai" />
        </div>
      </div>
      <div class="grid gap-1.5">
        <Label for="sched-tgt-act">{$t('system.jobs.scheduleDialog.targetAction')}</Label>
        <TextInput id="sched-tgt-act" bind:value={schedTargetAction} placeholder="partition-maintenance" />
      </div>
      <p class="text-muted-foreground text-xs">
        {$t('system.jobs.scheduleDialog.preview', { values: {
          subject: `jobs.schedule.job.${schedName.trim() || '<name>'}`,
          target: `jobs.due.${schedLane}.${schedTargetService.trim() || '<svc>'}.${schedTargetAction.trim() || '<action>'}`,
        } })}
      </p>
    </div>
    <Dialog.Footer>
      <Dialog.Close class="text-sm">{$t('app.common.cancel')}</Dialog.Close>
      <Button
        size="sm"
        disabled={schedBusy || !schedName.trim() || !schedSpec.trim() || !schedTargetService.trim() || !schedTargetAction.trim()}
        onclick={() => void submitSchedule()}
      >
        {$t('system.jobs.scheduleDialog.arm')}
      </Button>
    </Dialog.Footer>
  </DialogBordered>
</AppPageScaffold>
