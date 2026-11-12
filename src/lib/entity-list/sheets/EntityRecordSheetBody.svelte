<script lang="ts">
  /**
   * EntityRecordSheetBody — the loaded record surface.
   *
   * Layout contract (declared-form and fallback alike):
   *   - `meta.uid` column → identity BADGE pinned at the very top — it is
   *     the record's public identity, never an editable field;
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
  import { Badge, Separator, Label } from '@primebrick/ui';
  import { Copy, Check } from '@primebrick/ui/vendor/lucide';
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

  const allColumns = $derived((meta?.columns ?? []).filter((c) => !c.hidden));
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
      readonly={!editing}
      bind:value={draft[col.key]}
      record={draft}
    />
  </div>
{/snippet}

<div class="flex h-full flex-col gap-4">
  {#if uidValue !== undefined && uidValue !== null}
    <div class="flex items-center gap-2">
      <Label for="record-sheet-uid-badge">{$t('system.common.fields.uuid')}</Label>
      <Badge
        id="record-sheet-uid-badge"
        variant="outline"
        class="w-fit max-w-full truncate font-mono text-xs text-muted-foreground"
        title={String(uidValue)}
        data-testid="entity-record-sheet-uid-badge"
      >
        {uidValue}
        <button
          type="button"
          class="ml-1 inline-flex shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground"
          title={$t('app.common.copy')}
          aria-label={$t('app.common.copy')}
          onclick={copyUid}
          data-testid="entity-record-sheet-uid-copy"
        >
          {#if uidCopied}
            <Check class="size-3" />
          {:else}
            <Copy class="size-3" />
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
    <Separator />
    <section
      class="rounded-md bg-muted/50 px-3 py-2"
      aria-label={$t('system.common.sections.audit')}
      data-testid="entity-record-sheet-audit-section"
    >
      <dl class="grid grid-cols-1 gap-y-1.5 text-xs">
        {#each auditColumns as col (col.key)}
          <div class="flex items-baseline gap-x-2">
            <dt class="shrink-0 text-primary">{$t(col.label_key)}:</dt>
            <dd class="min-w-0 italic text-muted-foreground">
              {auditBox.formatValue(record[col.key], col)}
            </dd>
          </div>
        {/each}
      </dl>
    </section>
  {/if}
</div>
