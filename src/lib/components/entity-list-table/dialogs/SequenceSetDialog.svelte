<script lang="ts">
  /**
   * SequenceSetDialog — the governed counter-set surface for builtin
   * `sequence` registry rows (`sequence_set` row CTA). The op is
   * parametric: `next` (the next-to-emit counter value) is operator
   * input the generic endpoint dispatch cannot produce — this dialog
   * collects it, informed by `sequence-analyze` (max in use, suggested
   * start, overlap warnings).
   *
   * The write itself rides `runEntityOp` — the meta-served `confirm_key`
   * opens the anatomy confirm, the route-declared `mfa` wraps dispatch
   * in the step-up challenge; this dialog never bypasses either gate.
   * Success posts on `primebrick_<entity>_sync` — the hosting list
   * refreshes by convention.
   */
  import { t } from '$lib/i18n';
  import { Button, Label, Dialog, BorderedDialog, NumericInput, TextInput, DateWheelPicker, getResolvedIanaTimeZone, toDisplayString } from '@primebrick/ui';
  import { CalendarDateTime } from '@internationalized/date';
  import { calendarDateToUtcIso } from '$lib/entity-form/date-wire';
  import { pushNotification } from '$lib/errors/app-errors';
  import { apiFetch, entityApiBase } from '$lib/api';
  import { extJsonParse, extJsonStringify } from '$lib/api-ext';
  import { untrack } from 'svelte';
  import { runEntityOp, fetchEntityMeta, type EntityMeta } from '$lib/entity-list';
  import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';


  /** Wire contract — `sequence-analyze` response (snake_case verbatim). */
  interface SequenceAnalyze {
    table: string;
    column: string;
    in_use: bigint;
    max_value: bigint | null;
    suggested_start: bigint | null;
    next_proposed: string | null;
    next_in_use: boolean | null;
    conflicts_above: bigint | null;
    partitions?: { partition_key: string; in_use: bigint; max_value: bigint | null }[];
    ambiguous?: string[];
  }

  interface SequenceSetDialogProps<TRow extends Record<string, unknown>> {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    row: TRow | null;
    uid: string;
    entity: string;
    /** Owning module code (`crm`) — builtin entities mount on every
     *  service; the census map is ambiguous for them, so the explicit
     *  module context is mandatory (same contract as EntityDictPage). */
    service?: string;
  }

  let {
    open = $bindable(),
    onOpenChange,
    row,
    uid,
    entity,
    service,
  }: SequenceSetDialogProps<Record<string, unknown>> = $props();

  const basePath = $derived(entityApiBase(entity, service));
  const svcPrefix = $derived(service ? `/svc/${service}` : '');
  // entity/service are immutable per dialog mount — the channel name is
  // captured once (EntityDictPage convention).
  const { notifyParentRefresh } = useSyncChannel(
    `primebrick_${untrack(() => entity)}_sync`,
    { mode: 'sender' },
  );

  let meta = $state<EntityMeta | null>(null);
  let analysis = $state<SequenceAnalyze | null>(null);
  let analyzeFailed = $state(false);
  let nextValue = $state('');
  let sezValues = $state<Record<'sez' | 'sez2' | 'sez3', string>>({ sez: '', sez2: '', sez3: '' });
  let atValue = $state<CalendarDateTime | null>(null);
  let atTz = $state(getResolvedIanaTimeZone() ?? 'UTC');
  let isSubmitting = $state(false);

  /** Partition slots the row's pattern declares — `{sez}`/`{sez2}`/`{sez3}`
   *  tokens decide which inputs the dialog renders (the counter is
   *  partition-scoped; no slot → no input). */
  const sezSlots = $derived.by<('sez' | 'sez2' | 'sez3')[]>(() => {
    const pattern = toDisplayString(row?.pattern ?? '');
    return (['sez', 'sez2', 'sez3'] as const).filter((s) => pattern.includes(`{${s}}`));
  });

  const rowCode = $derived(toDisplayString(row?.code ?? ''));
  const canSubmit = $derived(nextValue.trim() !== '' && !isSubmitting && meta !== null);

  function sezBody(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const s of sezSlots) {
      const v = sezValues[s].trim();
      if (v !== '') out[s] = v;
    }
    return out;
  }

  async function runAnalyze() {
    if (!row) return;
    analyzeFailed = false;
    try {
      const res = await apiFetch(`${svcPrefix}/api/v1/actions/sequence-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: extJsonStringify({
          uuid: toDisplayString(row[uid]),
          ...sezBody(),
          ...(atValue ? { at: calendarDateToUtcIso(atValue, atTz, 'datetime') } : {}),
        }),
      });
      if (!res.ok) {
        analyzeFailed = true;
        analysis = null;
        return;
      }
      analysis = extJsonParse<SequenceAnalyze>(await res.text());
      // Prefill ONLY on the first analysis of this dialog session — the
      // operator's edit must never be clobbered by a re-analysis.
      if (nextValue === '' && analysis.suggested_start !== null) {
        nextValue = toDisplayString(analysis.suggested_start);
      }
    } catch {
      analyzeFailed = true;
      analysis = null;
    }
  }

  $effect(() => {
    if (!open || !row) return;
    // Seed the dialog session — every field/context resets (the row may
    // differ from the previous open).
    nextValue = '';
    sezValues = { sez: '', sez2: '', sez3: '' };
    atValue = null;
    analysis = null;
    analyzeFailed = false;
    void fetchEntityMeta(basePath)
      .then((m) => {
        meta = m;
      })
      .catch(() => {
        meta = null;
      });
  });

  // Re-analyze when the partition/period context changes — the analysis is
  // context-scoped, a stale suggestion is worse than a slow one. The
  // prefill guard keeps the operator's `next` edit untouched.
  let analyzeGen = 0;
  $effect(() => {
    if (!open || !row) return;
    // track context deps
    void sezValues.sez;
    void sezValues.sez2;
    void sezValues.sez3;
    void atValue;
    const g = ++analyzeGen;
    const timer = setTimeout(() => {
      if (g === analyzeGen) void runAnalyze();
    }, 250);
    return () => clearTimeout(timer);
  });

  async function handleSubmit() {
    if (!row || !canSubmit || !meta) return;
    isSubmitting = true;
    try {
      const body = {
        uuid: toDisplayString(row[uid]),
        next: BigInt(nextValue),
        ...sezBody(),
        ...(atValue ? { at: calendarDateToUtcIso(atValue, atTz, 'datetime') } : {}),
      };
      const ok = await runEntityOp({
        op: 'sequence_set',
        entity,
        meta,
        row,
        // Route-declared `mfa` mints the action label — `sequence.set`
        // (dotted), distinct from the op name `sequence_set`.
        mfaAction: 'sequence.set',
        execute: (token) =>
          apiFetch(`${svcPrefix}/api/v1/actions/sequence-set`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'x-mfa-action-authorization': token } : {}),
            },
            body: extJsonStringify(body),
          }),
        onDone: () => {
          pushNotification({
            impact: 'LOW',
            messageKey: 'app.common.done',
            scope: $t('app.common.errors.scope.custom_action_api'),
            toast: true,
          });
          notifyParentRefresh();
          open = false;
          onOpenChange?.(false);
        },
      });
      if (!ok) return;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      pushNotification({
        impact: 'HIGH',
        messageKey: 'app.common.errors.scope.custom_action_api',
        detail,
        toast: true,
      });
    } finally {
      isSubmitting = false;
    }
  }

  function handleCancel() {
    open = false;
    onOpenChange?.(false);
  }
</script>

<BorderedDialog bind:open {onOpenChange} severity="warning" class="sm:max-w-md" showCloseButton={false}>
  <Dialog.Header class="pb-4">
    <Dialog.Title>{$t('app.widgets.sequence.set.title')} — {rowCode}</Dialog.Title>
    <Dialog.Description>{$t('app.widgets.sequence.set.description')}</Dialog.Description>
  </Dialog.Header>

  <div class="space-y-4 py-2">
    <!-- analysis strip — read-only operator context -->
    <div class="rounded-md border bg-muted/40 px-3 py-2 text-sm" data-testid="sequence-set-analysis">
      {#if analysis}
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            {$t('app.widgets.sequence.set.in_use')}:
            <strong>{analysis.in_use.toLocaleString()}</strong>
          </span>
          {#if analysis.max_value !== null}
            <span>
              {$t('app.widgets.sequence.set.max')}:
              <strong>{analysis.max_value.toLocaleString()}</strong>
            </span>
          {/if}
          {#if analysis.next_proposed !== null}
            <span>
              {$t('app.widgets.sequence.next')}:
              <strong>{analysis.next_proposed}</strong>
            </span>
          {/if}
        </div>
        {#if analysis.next_in_use === true}
          <p class="mt-1 text-warning">{$t('app.widgets.sequence.set.next_in_use')}</p>
        {/if}
        {#if analysis.conflicts_above !== null && analysis.conflicts_above > 0n}
          <p class="mt-1 text-warning">
            {$t('app.widgets.sequence.set.conflicts', { count: toDisplayString(analysis.conflicts_above) })}
          </p>
        {/if}
        {#if analysis.ambiguous && analysis.ambiguous.length > 0}
          <p class="mt-1 text-muted-foreground">
            {$t('app.widgets.sequence.set.ambiguous', { codes: analysis.ambiguous.join(', ') })}
          </p>
        {/if}
      {:else if analyzeFailed}
        <p class="text-muted-foreground">{$t('app.widgets.sequence.set.analyze_failed')}</p>
      {:else}
        <p class="text-muted-foreground">{$t('app.common.loading')}</p>
      {/if}
    </div>

    <div class="space-y-2">
      <Label for="sequence-set-next" class="text-sm font-medium leading-none">
        {$t('app.widgets.sequence.set.next_label')}
        <span class="text-destructive">*</span>
      </Label>
      <NumericInput
        id="sequence-set-next"
        kind="bigint"
        min="0"
        unsigned
        bind:value={nextValue}
        disabled={isSubmitting}
        data-testid="sequence-set-next"
      />
    </div>

    {#each sezSlots as slot (slot)}
      <div class="space-y-2">
        <Label for={`sequence-set-${slot}`} class="text-sm font-medium leading-none">
          {$t(`app.widgets.sequence.sez_${slot}`)}
        </Label>
        <TextInput
          id={`sequence-set-${slot}`}
          bind:value={sezValues[slot]}
          disabled={isSubmitting}
          data-testid={`sequence-set-${slot}`}
        />
      </div>
    {/each}

    <div class="space-y-2">
      <Label for="sequence-set-at" class="text-sm font-medium leading-none">
        {$t('app.widgets.sequence.set.at_label')}
      </Label>
      <DateWheelPicker
        id="sequence-set-at"
        includeTime
        bind:value={atValue}
        bind:timezone={atTz}
        disabled={isSubmitting}
        dataTestId="sequence-set-at"
      />
    </div>
  </div>

  <Dialog.Footer class="gap-2 sm:space-x-0">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={handleCancel}
      disabled={isSubmitting}
    >
      {$t('app.common.cancel')}
    </Button>
    <Button
      class="hover:scale-105 transition-all"
      onclick={handleSubmit}
      disabled={!canSubmit}
      data-testid="sequence-set-submit"
    >
      {#if isSubmitting}
        {$t('app.common.saving')}
      {:else}
        {$t('app.widgets.sequence.set.submit')}
      {/if}
    </Button>
  </Dialog.Footer>
</BorderedDialog>
