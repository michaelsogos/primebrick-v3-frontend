<script lang="ts">
  /**
   * EntityRecordSheetBody — the loaded record surface.
   *
   * Layout contract (declared-form and fallback alike):
   *   - `meta.uid` column → identity BADGE pinned at the very top — it is
   *     the record's public identity, never an editable field. Anatomy:
   *     `secondary` pill + `file-key` icon (amber-500 accent — the
   *     canonical uuid glyph, same vocabulary as the payload-map format
   *     icons) + mono value + inner copy CTA;
   *   - business columns → `EntityFormField` — the SAME per-field anatomy
   *     `EntityFormPage` mounts (boolean→SwitchField, `type:"color"`→
   *     ColorSelector, `type:"ref"`→entity combo…), readonly here so the
   *     pencil toggle can later flip the same widgets into edit mode;
   *   - `column.audited` columns → audit section at the bottom, behind a
   *     horizontal divider, rendered through `TableCell` (the canonical
   *     metadata-driven VALUE formatter — datetimes formatted, ref actors
   *     with their display-name affordance). Audit facts are immutable:
   *     `EntityFormField` rejects them by construction, so they can never
   *     reach a form widget;
   *   - `version` → footer badge owned by the panel (opens version
   *     history) — excluded from the field surface.
   *
   * Field selection: `page_props.form` placements when the entity
   * declares a form-bearing route; else every served `meta.columns`.
   * The uid/audited/version partition applies to both paths — a declared
   * form never places system fields anyway.
   */
  import EntityFormField from '$lib/entity-form/EntityFormField.svelte';
  import { useAuditBox } from '$lib/composables/useAuditBox';
  import type { AuditData } from '$lib/utils/audit-data';
  import { setMetaUidContext } from '$lib/components/entity-list-table/context';
  import { useCensusSubjectOptions } from '$lib/entity-form/use-census-subject-options.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { t } from '$lib/i18n';
  import { Accordion, Badge, Label, DynamicIcon, colorCssFromToken } from '@primebrick/ui';
  import { Copy, Check } from '@primebrick/ui/vendor/lucide';
  import { orderedColumns } from '$lib/entity-list/types';
  import type { MetaColumn, EntityMeta } from '$lib/entity-list/types';
  import type { FormFieldPlacement } from '@primebrick/ui';

  let {
    meta,
    record,
    formPlacements,
    formTwoCol,
    editing = false,
    draft = $bindable({}),
  }: {
    meta: EntityMeta;
    record: Record<string, unknown>;
    /** Declared `page_props.form` layout resolved to served columns;
     *  empty → fallback (all served columns in order). */
    formPlacements: { col: MetaColumn; p: FormFieldPlacement }[];
    formTwoCol: boolean;
    /** Pencil-toggle state: false → readonly widgets (the default),
     *  true → the SAME widgets editable. */
    editing?: boolean;
    /** Writable mirror of `record` — bound back to the panel, which owns
     *  the save dispatch. */
    draft?: Record<string, unknown>;
  } = $props();

  const uidKey = $derived(meta?.uid ?? 'uuid');
  // Context is set once at mount — the served meta (and its uid key) is
  // stable for the sheet's lifetime.
  // svelte-ignore state_referenced_locally
  setMetaUidContext(uidKey);

  // Canonical display order (sticky → normal → audited, each by `order`;
  // absent `order` degrades to array index) — array position MUST NOT
  // matter, same contract the table consumes via `orderedColumns`.
  const allColumns = $derived(orderedColumns(meta?.columns).filter((c) => !c.hidden));
  /** Immutable audit facts — pinned to the bottom section, rendered as
   *  values (`TableCell`), never as widgets. `version` is audited too but
   *  its surface is the footer badge — never duplicated here. */
  const auditColumns = $derived(
    allColumns.filter((c) => c.audited === true && c.key !== 'version'),
  );
  /** Form surface — everything else except uid (top badge) and version
   *  (footer badge). */
  const formColumns = $derived(
    allColumns.filter(
      (c) => c.audited !== true && c.key !== uidKey && c.key !== 'version',
    ),
  );
  const uidValue = $derived(record[uidKey]);

  /** Audit values use the CANONICAL form-page formatter
   *  (`useAuditBox.formatValue` — datetime/badge/ref `_name` resolution,
   *  `-` for nulls), rendered as plain `label: value` text — the same
   *  anatomy FormPageLayout paints in its footer, never cell widgets. */
  const auditBox = $derived(
    useAuditBox({
      auditData: record as Partial<AuditData>,
      auditingColumns: auditColumns,
      isCreatePage: false,
      entity: meta?.entity ?? '',
      entities_ns: meta?.entities_ns,
      rowUuid: String(uidValue ?? ''),
    }),
  );

  /** uid copy affordance — the badge's inner right icon. Transient check
   *  swap confirms the copy without a toast (field-level, low-impact). */
  let uidCopied = $state(false);
  async function copyUid() {
    if (uidValue === undefined || uidValue === null) return;
    try {
      await navigator.clipboard.writeText(String(uidValue));
      uidCopied = true;
      setTimeout(() => (uidCopied = false), 1500);
    } catch {
      /* clipboard denied — silent, the badge still shows the value */
    }
  }

  /** Same census vocabulary the form page feeds the dispatcher —
   *  `census.emits`/`census.callables` columns get their options here
   *  too, never a second mapping. */
  const census = useCensusSubjectOptions(() => shellNav.modules);
  const columnsMap = $derived.by<ReadonlyMap<string, MetaColumn>>(() => {
    const m = new Map<string, MetaColumn>();
    for (const c of meta?.columns ?? []) m.set(c.key, c);
    return m;
  });

  /** Draft mirrors `record` — re-baselined when the record reloads AND
   *  on every edit-toggle exit (cancel/save discards pending writes). */
  $effect(() => {
    record;
    editing;
    draft = { ...record };
  });

  function placementStyle(p: FormFieldPlacement): string {
    const parts: string[] = [];
    if (p.col) parts.push(`grid-column-start:${p.col}`);
    if (p.span) parts.push(`grid-column-end:span ${p.span}`);
    if (p.row) parts.push(`grid-row-start:${p.row}`);
    if (p.row_span) parts.push(`grid-row-end:span ${p.row_span}`);
    return parts.join(';');
  }
</script>

{#snippet field(col: MetaColumn, p?: FormFieldPlacement)}
  <div class="space-y-2" style={p ? placementStyle(p) : undefined}>
    <EntityFormField
      column={col}
      placement={p}
      columns={columnsMap}
      controlProps={{ id: `record-sheet-field-${col.key}` }}
      emitsOptions={census.emitsOptions}
      callablesOptions={census.callablesOptions}
      disabled={!editing}
      bind:value={draft[col.key]}
      record={draft}
    />
  </div>
{/snippet}

<div class="flex h-full flex-col gap-4">
  {#if uidValue !== undefined && uidValue !== null}
    <!-- Same field anatomy as EntityFormField — label row, then the
         "control" slot below it (here the uid badge, never a widget). -->
    <div class="space-y-2">
      <Label for="record-sheet-uid-badge">{$t('system.common.fields.uuid')}</Label>
      <Badge
        id="record-sheet-uid-badge"
        variant="secondary"
        class="h-9 w-full max-w-full justify-start gap-2 truncate px-3 font-mono shadow-none [&>svg]:size-4"
        title={String(uidValue)}
        data-testid="entity-record-sheet-uid-badge"
      >
        <DynamicIcon name="file-key" size={16} class="shrink-0" style="color:{colorCssFromToken('amber-500')}" />
        <span class="truncate">{uidValue}</span>
        <button
          type="button"
          class="ml-auto inline-flex shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground"
          title={$t('app.common.copy')}
          aria-label={$t('app.common.copy')}
          onclick={copyUid}
          data-testid="entity-record-sheet-uid-copy"
        >
          {#if uidCopied}
            <Check class="size-4" />
          {:else}
            <Copy class="size-4" />
          {/if}
        </button>
      </Badge>
    </div>
  {/if}

  {#if formPlacements.length}
    <div class="grid gap-4 {formTwoCol ? 'grid-cols-2' : 'grid-cols-1'}">
      {#each formPlacements as { col, p } (col.key)}
        {@render field(col, p)}
      {/each}
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-3">
      {#each formColumns as col (col.key)}
        {@render field(col)}
      {/each}
    </div>
  {/if}

  {#if auditColumns.length}
    <!-- Audit fields live behind a collapsed accordion — the separator-line
         affordance is the canonical Accordion trigger. -->
    <Accordion.Root type="single" class="w-full">
      <Accordion.Item value="audit">
        <Accordion.Trigger class="text-xs font-normal text-muted-foreground hover:no-underline">
          {$t('system.common.sections.audit')}
        </Accordion.Trigger>
        <Accordion.Content class="pb-0">
          <section
            aria-label={$t('system.common.sections.audit')}
            data-testid="entity-record-sheet-audit-section"
          >
            <!-- gap-y-2 = the FormPageLayout audit-foot leading; values
                 ellipse (never wrap, never horizontal scroll). -->
            <dl class="grid grid-cols-1 gap-y-2 text-xs">
              {#each auditColumns as col (col.key)}
                <div class="flex items-baseline gap-x-2">
                  <dt class="shrink-0 text-primary">{$t(col.label_key)}:</dt>
                  <dd class="min-w-0 truncate italic text-muted-foreground" title={auditBox.formatValue(record[col.key], col)}>
                    {auditBox.formatValue(record[col.key], col)}
                  </dd>
                </div>
              {/each}
            </dl>
          </section>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  {/if}
</div>
