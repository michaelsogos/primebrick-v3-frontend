<script lang="ts">
  /**
   * MapperViewerPanel — read-only prose view of a DST mapper document
   * (VIEWER archetype). Opened by the mapper cell's "View map" CTA via
   * `openSheet('entity.mapperViewer', { value, entity, row, column_key,
   * title })`. Rows mirror the form builder's anatomy without inputs —
   * rendering lives in `PayloadMapViewer` (@primebrick/ui); the DST
   * contract (`PayloadMapEntry` vocabulary in @primebrick/core) is the
   * reuse axis for every mapper adopting it.
   *
   * The panel self-resolves the target callable's `payload_schema` from
   * the census (`row.target_subject`) so required markers, type icons
   * and the unmapped-fields accordion match the builder exactly.
   *
   * Two full-width endpoint badges head the sheet — the same
   * label+full-width-badge anatomy `EntityRecordUid` uses: SOURCE is the
   * emit the trigger subscribes (`event_subject`, wildcard emits cover
   * their concrete span; a schedule-only row shows its `schedule_spec`),
   * DEST EVENT is the callable the payload is delivered to. Labels
   * resolve through the census `label_key`/`description_key`
   * declarations — the same translation path the form combos use.
   */
  import { SheetPanelLayout, PayloadMapViewer } from '@primebrick/ui';
  import EndpointBadge from '../EndpointBadge.svelte';
  import { Waypoints } from '@primebrick/ui/vendor/lucide';
  import { t } from '$lib/i18n';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { useCensusSubjectOptions } from '$lib/entity-form/use-census-subject-options.svelte';

  let {
    value,
    row,
    title,
  }: {
    /** The cell's parsed DST document (string JSON — the editor contract). */
    value: unknown;
    /** The owning wire row — `target_subject` resolves the callable. */
    row?: Record<string, unknown>;
    /** Resolved sheet title — the cell passes the column's label. */
    title?: string;
  } = $props();

  const census = useCensusSubjectOptions(() => shellNav.modules);

  const targetCallable = $derived(
    row?.target_subject
      ? census.callableDecls.find((c) => c.subject === row.target_subject)
      : undefined,
  );

  /** NATS subject coverage — emit `pattern` covers `subject` token-wise
   *  (`*` one token, `>` the tail); same rule the JH wire gate applies. */
  function coveredBy(pattern: string, subject: string): boolean {
    const p = pattern.split('.');
    const s = subject.split('.');
    for (let i = 0; i < p.length; i++) {
      if (p[i] === '>') return true;
      const st = s[i];
      if (st === undefined || st === '>' || st === '*') return false;
      if (p[i] !== '*' && p[i] !== st) return false;
    }
    return p.length === s.length;
  }

  /** The emit decl covering `event_subject` — exact first, then the
   *  declared wildcard whose span covers it. */
  const sourceEmit = $derived.by(() => {
    const subject = typeof row?.event_subject === 'string' ? row.event_subject : undefined;
    if (!subject) return undefined;
    return (
      census.emitDecls.find((e) => e.subject === subject) ??
      census.emitDecls.find((e) => coveredBy(e.subject, subject))
    );
  });

  /** SOURCE badge — emit label via `label_key` (translated), raw subject
   *  fallback; a schedule-only row's source is the timer itself. */
  const sourceBadge = $derived.by(() => {
    if (sourceEmit) {
      return {
        icon: 'zap',
        iconColor: 'amber-500',
        text: sourceEmit.label_key ? $t(sourceEmit.label_key) : sourceEmit.subject,
        tip: `${sourceEmit.subject}${sourceEmit.description_key ? ` — ${$t(sourceEmit.description_key)}` : ''}`,
      };
    }
    const eventSubject = typeof row?.event_subject === 'string' ? row.event_subject : '';
    if (eventSubject) {
      return { icon: 'zap', iconColor: 'amber-500', text: eventSubject, tip: eventSubject };
    }
    const spec = typeof row?.schedule_spec === 'string' ? row.schedule_spec : '';
    return { icon: 'calendar-clock', iconColor: 'amber-500', text: spec || '—', tip: spec };
  });

  /** DEST EVENT badge — callable label via `label_key` (translated),
   *  raw subject fallback. */
  const destBadge = $derived.by(() => {
    const subject = typeof row?.target_subject === 'string' ? row.target_subject : '';
    const text = targetCallable?.label_key ? $t(targetCallable.label_key) : subject || '—';
    const tip = `${subject}${targetCallable?.description_key ? ` — ${$t(targetCallable.description_key)}` : ''}`;
    return { icon: 'send', iconColor: 'sky-500', text, tip };
  });

  /** Viewer prop contract is the raw JSON text (same bind the editor owns). */
  const mapText = $derived(
    typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2),
  );
</script>

<SheetPanelLayout>
  {#snippet icon()}
    <Waypoints class="size-4" />
  {/snippet}
  {#snippet title()}
    {title ?? $t('app.widgets.mapper.title')}
  {/snippet}

  <div class="h-full overflow-auto p-3 space-y-3">
    <EndpointBadge
      label_key="app.widgets.mapper.source"
      icon={sourceBadge.icon}
      icon_color={sourceBadge.iconColor}
      text={sourceBadge.text}
      tip={sourceBadge.tip}
      testid="mapper-viewer-source"
    />
    <EndpointBadge
      label_key="app.widgets.mapper.dest_event"
      icon={destBadge.icon}
      icon_color={destBadge.iconColor}
      text={destBadge.text}
      tip={destBadge.tip}
      testid="mapper-viewer-dest-event"
    />
    <PayloadMapViewer value={mapText} target_schema={targetCallable?.payload_schema} />
  </div>
</SheetPanelLayout>
