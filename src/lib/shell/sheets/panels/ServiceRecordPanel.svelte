<script lang="ts">
  /**
   * ServiceRecordPanel — the `service.record` host panel: the record view
   * for `service_registry` refs (lazy refs whose per-row `entity_field`
   * resolves to `service_registry`, e.g. audited `created_by` cells
   * carrying a `system:<code>` actor).
   *
   * `service_registry` is NOT entity-served — its record read is the
   * registry RPC `GET /api/v1/system/services/:code`, keyed by the
   * service's business key (`code`). No entity meta, no canonical GET —
   * the panel renders the registry payload plus the live instance view
   * from `servicesState` (the same SSE feed the modules page consumes).
   *
   * `context_row` carries the wire row that opened the drill: when it
   * brings the schedule arming triple (`trigger`, `schedule_spec`,
   * `run_as`) the panel surfaces it as the "armed schedule" section.
   *
   * In-sheet links are `_blank`-only by contract.
   */
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { fetchService } from '$lib/api';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { servicesState, aggregateStatus } from '$lib/services-store.svelte';
  import { Badge, badgeClassesFromToken, DynamicIcon, ScheduleSpecCell, SheetPanelLayout, StateHero, toDisplayString } from '@primebrick/ui';
  import { Blocks, ExternalLink } from '@primebrick/ui/vendor/lucide';
  import { LoadingBar } from '$lib/components/ui/loading-bar';
  import { resolve } from '$app/paths';
  import { cn } from '$lib/utils';
  import type { ServiceInfo } from '$lib/api-types';

  let {
    code,
    context_row,
  }: {
    /** `service_registry` business key — the service code. */
    code: string;
    /** The source wire row — surfaces the arming triple when present. */
    context_row?: Record<string, unknown>;
  } = $props();

  let service = $state<ServiceInfo | null>(null);
  let loading = $state(true);
  let failed = $state(false);

  /** Live instance rows for this code — the SSE-fed registry view the
   *  modules page consumes; falls back to the fetched record when the
   *  feed hasn't delivered yet. */
  const instances = $derived(
    servicesState.services.filter((s) => s.code === code),
  );
  const aggStatus = $derived(
    instances.length ? aggregateStatus(instances) : (service?.status ?? 'unknown'),
  );
  const healthyCount = $derived(instances.filter((i) => i.status === 'online').length);

  /** Service display name — the module census `label_key` wins (the same
   *  resolution `format:"service_code"` cells use), then the registry
   *  name, then the raw code. */
  const serviceLabel = $derived.by(() => {
    const module = shellNav.modules.find((m) => m.id === code);
    if (module?.label_key) return $t(module.label_key);
    return service?.name ?? module?.name ?? code;
  });

  /** The arming triple — present only when the drill came from a
   *  schedule row (e.g. its `created_by` service-actor cell). `trigger`
   *  is the schedule's display_field: the owning trigger's name,
   *  resolved live on the wire row. */
  const arming = $derived.by(() => {
    const trigger = context_row?.trigger;
    const schedule_spec = context_row?.schedule_spec;
    const run_as = context_row?.run_as;
    if (trigger === undefined && schedule_spec === undefined && run_as === undefined) return null;
    return { trigger, schedule_spec, run_as };
  });

  /** Badge `class=` is layout-only by contract — authored colors ride
   *  `style` through the token resolver (same contract as table cells). */
  function badgeStyle(token: string | null): string {
    const c = badgeClassesFromToken(token);
    return `background-color: ${c.bgColor}; color: ${c.textColor}; border-color: ${c.borderColor};`;
  }

  function statusColorToken(status: string): string {
    switch (status) {
      case 'online':
        return 'emerald';
      case 'going_live':
        return 'amber';
      case 'offline':
      case 'migration_failed':
        return 'red';
      case 'stale':
        return 'orange';
      default:
        return 'zinc';
    }
  }

  async function load(): Promise<void> {
    loading = true;
    failed = false;
    try {
      service = await fetchService(code);
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });
</script>

<SheetPanelLayout contentClass="px-4 pb-4">
  {#snippet icon()}
    {#if service?.icon && service.icon_type === 'icon'}
      <DynamicIcon name={service.icon} size={18} class="shrink-0 text-primary" />
    {:else}
      <Blocks class="size-4" />
    {/if}
  {/snippet}
  {#snippet title()}
    <span class="truncate">{serviceLabel}</span>
  {/snippet}
  {#snippet actions()}
    <a
      href={resolve('/(app)/system/settings/modules/[code]', { code })}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      title={$t('app.common.open_in_new_tab')}
      aria-label={$t('app.common.open_in_new_tab')}
      data-testid="service-record-panel-module-cta"
    >
      <ExternalLink class="size-4" />
    </a>
  {/snippet}

  <div class="h-full overflow-auto" data-testid="service-record-panel">
    {#if loading}
      <LoadingBar />
    {:else if failed || !service}
      <StateHero
        severity="destructive"
        icon="circle-alert"
        animation="none"
        title_key="system.entities.record.unavailable"
        params={{ entity_singular: $t('system.entities.service_registry.singular') }}
        test_id="service-record-panel-failed-hero"
      />
    {:else}
      <div class="space-y-5 py-1">
        {#if arming}
          <!-- Armed schedule — the trigger-arm parallel minimum: the job
               identity, the cadence, the execution lane. -->
          <section class="space-y-2" data-testid="service-record-arming">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {$t('system.entities.service_registry.armed_schedule')}
            </h3>
            <div class="space-y-2 rounded-lg border-primary-gradient p-3">
              {#if arming.trigger !== undefined && arming.trigger !== null}
                <div class="flex items-center justify-between gap-3 text-sm">
                  <!-- `job.*` dict keys — the job_schedule field labels are
                       module-owned (single source); the panel only ever
                       opens from a job_schedule row so the dict is loaded. -->
                  <span class="text-muted-foreground">{$t('job.entities.job_schedule.fields.trigger')}</span>
                  <span class="truncate font-mono text-xs" data-testid="service-record-arming-job">{toDisplayString(arming.trigger)}</span>
                </div>
              {/if}
              {#if typeof arming.schedule_spec === 'string' && arming.schedule_spec !== ''}
                <div class="flex items-center justify-between gap-3 text-sm">
                  <span class="text-muted-foreground">{$t('job.entities.job_schedule.fields.schedule_spec')}</span>
                  <ScheduleSpecCell value={arming.schedule_spec} />
                </div>
              {/if}
              {#if arming.run_as !== undefined && arming.run_as !== null}
                <div class="flex items-center justify-between gap-3 text-sm">
                  <span class="text-muted-foreground">{$t('job.entities.job_schedule.fields.run_as')}</span>
                  <Badge variant="secondary" data-testid="service-record-arming-run-as">
                    {$t(`job.entities.job_schedule.status.${toDisplayString(arming.run_as)}`)}
                  </Badge>
                </div>
              {/if}
            </div>
          </section>
        {/if}

        <!-- Service info — the registry payload plus the live instance
             view from the SSE feed. -->
        <section class="space-y-2" data-testid="service-record-info">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {$t('system.settings.modules.config.service_info')}
          </h3>
          <div class="space-y-2 rounded-lg border-primary-gradient p-3">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="text-muted-foreground">{$t('system.entities.service_registry.fields.status')}</span>
              <Badge style={badgeStyle(statusColorToken(aggStatus))}>
                {$t(`app.health.${aggStatus}`)}
              </Badge>
            </div>
            {#if instances.length > 0}
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="text-muted-foreground">{$t('system.settings.modules.instances')}</span>
                <Badge variant="outline">
                  {healthyCount}/{instances.length}
                </Badge>
              </div>
              {#each instances as inst (inst.base_url)}
                <div class="flex items-center justify-between gap-3 pl-3 text-xs">
                  <span class="truncate font-mono text-muted-foreground">{inst.base_url}</span>
                  <span class={cn('size-2 shrink-0 rounded-full', inst.status === 'online' ? 'bg-emerald-500' : inst.status === 'going_live' ? 'bg-yellow-500' : 'bg-red-500')}></span>
                </div>
              {/each}
            {/if}
            {#if service.last_health_check_at}
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="text-muted-foreground">{$t('system.settings.modules.last_seen')}</span>
                <span class="truncate text-xs">{new Date(service.last_health_check_at).toLocaleString()}</span>
              </div>
            {/if}
            {#if service.service_version || service.pkg_name}
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="text-muted-foreground">{$t('system.settings.modules.config.service_version')}</span>
                <span class="truncate font-mono text-xs">{service.service_version ?? service.pkg_name}</span>
              </div>
            {/if}
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="text-muted-foreground">{$t('system.settings.modules.config.base_url')}</span>
              <span class="truncate font-mono text-xs">{service.base_url}</span>
            </div>
            {#if service.part_of}
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="text-muted-foreground">{$t('system.entities.service_registry.fields.part_of')}</span>
                <Badge variant="secondary">{service.part_of}</Badge>
              </div>
            {/if}
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="text-muted-foreground">{$t('system.entities.service_registry.fields.is_enabled')}</span>
              <div class="flex items-center gap-1.5">
                <Badge style={badgeStyle(service.is_enabled ? 'emerald' : 'zinc')}>
                  {$t(service.is_enabled ? 'system.settings.modules.active' : 'system.settings.modules.inactive')}
                </Badge>
                {#if service.is_reserved}
                  <Badge variant="outline">{$t('system.settings.modules.reserved')}</Badge>
                {/if}
                {#if service.is_behind_scaler}
                  <Badge variant="outline">{$t('system.settings.modules.behind_scaler')}</Badge>
                {/if}
              </div>
            </div>
            {#if service.capabilities?.length}
              <div class="flex items-start justify-between gap-3 text-sm">
                <span class="text-muted-foreground">{$t('system.entities.service_registry.fields.capabilities')}</span>
                <div class="flex max-w-[70%] flex-wrap justify-end gap-1">
                  {#each service.capabilities as cap (cap)}
                    <Badge variant="outline">{cap}</Badge>
                  {/each}
                </div>
              </div>
            {/if}
            {#if service.schemas?.length}
              <div class="flex items-start justify-between gap-3 text-sm">
                <span class="text-muted-foreground">{$t('system.entities.service_registry.fields.schemas')}</span>
                <div class="flex max-w-[70%] flex-wrap justify-end gap-1">
                  {#each service.schemas as sch (sch)}
                    <Badge variant="outline">{sch}</Badge>
                  {/each}
                </div>
              </div>
            {/if}
            {#if service.description}
              <div class="flex items-start justify-between gap-3 text-sm">
                <span class="text-muted-foreground">{$t('system.settings.modules.config.description')}</span>
                <span class="max-w-[70%] text-right text-xs">{service.description}</span>
              </div>
            {/if}
            {#if service.author}
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="text-muted-foreground">{$t('system.settings.modules.config.author')}</span>
                <span class="truncate text-xs">{service.author}</span>
              </div>
            {/if}
          </div>
        </section>
      </div>
    {/if}
  </div>
</SheetPanelLayout>
