<script lang="ts">
  /**
   * BulkEditorPanel — the `entity.bulkEditor` sheet for `update.bulk`.
   *
   * Apply-to-all builder: pick an update-editable column, get the SAME
   * authoring widget the single-record form mounts (`FormFieldDispatcher`,
   * `surface="form"`), and the value lands uniformly on every selected row.
   * Wire shape: `{items: [{uuid, version}], set: {col: value}}` — every uuid
   * travels; the distribution strip is a FORECAST, it never rewrites the
   * payload (the diff-audit trail decides what actually changed).
   *
   * Field partition mirrors `EntityRecordSheetBody`: immutable/managed
   * columns render as read-only facts on top (uniform value or "Mixed
   * values"), audited columns collapse into the bottom accordion — never
   * widgets. Rows are a frozen open-time snapshot: the forecast is what
   * the user actually selected.
   *
   * The submit rides `runEntityOp` — the served `update.bulk` chrome
   * (`confirm_key`) gates it through the governed confirm dialog, MFA
   * step-up wraps the request uniformly, and a CAS failure surfaces
   * `extra.issues` (per-row stale/vanished diagnostics) in the governed
   * error dialog. Atomic by contract: all-or-nothing.
   */
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import {
    Button,
    ComboSelect,
    SheetPanelLayout,
    SheetPanelFooter,
    PrimeField,
    Accordion,
    formatListCellValue,
  } from '@primebrick/ui';
  import { openSheet, closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeaderAction from '$lib/shell/sheets/SheetHeaderAction.svelte';
  import FormFieldDispatcher from '$lib/entity-form/FormFieldDispatcher.svelte';
  import { useCensusSubjectOptions } from '$lib/entity-form/use-census-subject-options.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { orderedColumns } from '$lib/entity-list/types';
  import { apiFetch, entityApiBase, serviceApiPrefix } from '$lib/api';
  import { extJsonStringify } from '$lib/api-ext';
  import { findActionEndpoint } from '$lib/entity-list';
  import { runEntityOp } from '$lib/entity-list/use-entity-op.svelte';
  import { SquarePen, Plus, Trash2, RotateCcw } from '@primebrick/ui/vendor/lucide';
  import type { EntityMeta, MetaColumn } from '$lib/entity-list/types';

  let {
    entity,
    meta,
    rows,
    onApplied,
  }: {
    entity: string;
    meta: EntityMeta;
    rows: Record<string, unknown>[];
    onApplied?: () => void;
  } = $props();

  const uid = $derived(meta?.uid ?? 'uuid');
  const allColumns = $derived(orderedColumns(meta?.columns).filter((c) => !c.hidden));
  /** Update-editable columns — the same physical set the single-update
   *  schema allows: never audited, managed, immutable, calculated/virtual,
   *  the uid or `version`. */
  const editableColumns = $derived(
    allColumns.filter(
      (c) =>
        !c.audited && !c.managed && !c.immutable && !c.kind && c.key !== uid && c.key !== 'version',
    ),
  );
  const immutableColumns = $derived(
    allColumns.filter(
      (c) => (c.immutable === true || c.managed === true) && !c.audited && c.key !== uid && c.key !== 'version',
    ),
  );
  const auditColumns = $derived(allColumns.filter((c) => c.audited === true && c.key !== 'version'));

  const census = useCensusSubjectOptions(() => shellNav.modules);
  const columnsMap = $derived.by<ReadonlyMap<string, MetaColumn>>(() => {
    const m = new Map<string, MetaColumn>();
    for (const c of meta?.columns ?? []) m.set(c.key, c);
    return m;
  });

  // ── Builder state ────────────────────────────────────────────────────────
  let activeKeys = $state<string[]>([]);
  let values = $state<Record<string, unknown>>({});
  let addFieldValue = $state<string>('');
  let applying = $state(false);

  const availableColumns = $derived(editableColumns.filter((c) => !activeKeys.includes(c.key)));

  function addField(key: unknown) {
    const k = typeof key === 'string' ? key : null;
    addFieldValue = ''; // the picker re-opens for the next field
    if (!k || activeKeys.includes(k)) return;
    activeKeys = [...activeKeys, k];
    values[k] = null;
  }
  function removeField(key: string) {
    activeKeys = activeKeys.filter((k) => k !== key);
    delete values[key];
  }
  function reset() {
    activeKeys = [];
    values = {};
  }

  // ── Distribution + forecast ──────────────────────────────────────────────
  /** Bucket key — primitives ride as themselves (null/undefined/'' stay
   *  DISTINCT: null → '' is a real write), objects compare by wire shape. */
  function bucketKey(v: unknown): unknown {
    return typeof v === 'object' && v !== null ? extJsonStringify(v) : v;
  }
  /** Group the selected rows by their current value of `key` — the "conto"
   *  the user asked for: who holds which value before the patch lands. */
  function distribution(key: string): { value: unknown; count: number; rows: Record<string, unknown>[] }[] {
    const groups = new Map<unknown, { value: unknown; rows: Record<string, unknown>[] }>();
    for (const r of rows) {
      const v = r[key];
      const b = bucketKey(v);
      const g = groups.get(b) ?? { value: v, rows: [] };
      g.rows.push(r);
      groups.set(b, g);
    }
    return [...groups.values()]
      .sort((a, b) => b.rows.length - a.rows.length)
      .map((g) => ({ value: g.value, count: g.rows.length, rows: g.rows }));
  }
  /** Value-equality for the forecast — null/undefined/'' collapse to the
   *  same "unset" bucket (an unset row IS already up to date when the new
   *  value is unset). Objects compare by wire shape. */
  function sameValue(a: unknown, b: unknown): boolean {
    const ka = bucketKey(a);
    const kb = bucketKey(b);
    return ka === kb;
  }
  function affectedCount(key: string): number {
    const nv = values[key];
    return rows.filter((r) => !sameValue(r[key], nv)).length;
  }

  function valueLabel(col: MetaColumn, v: unknown): string {
    if (v === null || v === undefined || v === '') return $t('system.entities.bulk_editor.empty_value');
    return formatListCellValue(col, v, $uiLang);
  }

  function openRowsDrill(col: MetaColumn, bucketRows: Record<string, unknown>[]) {
    openSheet(
      'entity.bulkEditRows',
      {
        entity,
        uid,
        title: $t('system.entities.bulk_editor.rows_panel_title', { field: $t(col.label_key) }),
        rows: bucketRows,
        columns: displayColumns,
      },
      { stack: true },
    );
  }

  /** Row-summary columns for the drill-down — the first few visible
   *  business columns (uid excluded; it's the row's own glyph). */
  const displayColumns = $derived(
    allColumns.filter((c) => !c.audited && c.key !== uid && c.key !== 'version').slice(0, 4),
  );

  /** Uniform vs mixed for the read-only strip — all rows share the value
   *  → render it; otherwise the "Mixed values" affordance drills into the
   *  full distribution. */
  function uniformValue(key: string): { uniform: boolean; value: unknown } {
    if (rows.length === 0) return { uniform: true, value: undefined };
    const first = bucketKey(rows[0][key]);
    return rows.every((r) => bucketKey(r[key]) === first)
      ? { uniform: true, value: rows[0][key] }
      : { uniform: false, value: undefined };
  }

  const entityLabel = $derived($t(`${meta?.entities_ns ?? 'system'}.entities.${entity}.plural`));

  // ── Submit ───────────────────────────────────────────────────────────────
  async function apply() {
    if (activeKeys.length === 0 || applying) return;
    applying = true;
    try {
      const set = Object.fromEntries(activeKeys.map((k) => [k, values[k]]));
      const items = rows.map((r) => ({ uuid: String(r[uid]), version: r.version as number }));
      const ep = findActionEndpoint(meta?.actions, 'update.bulk');
      const url = ep ? serviceApiPrefix(entity) + ep.path : `${entityApiBase(entity)}/bulk-update`;
      const ok = await runEntityOp({
        op: 'update.bulk',
        entity,
        meta,
        rows,
        execute: (token) =>
          apiFetch(url, {
            method: ep?.method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'x-mfa-action-authorization': token } : {}),
            },
            body: extJsonStringify({ items, set }),
          }),
        onDone: () => {
          closeSheet();
          onApplied?.();
        },
      });
      void ok;
    } finally {
      applying = false;
    }
  }
</script>

<SheetPanelLayout contentClass="p-4" footer={applyFooter}>
  {#snippet icon()}
    <SquarePen class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('system.entities.bulk_editor.title')}
  {/snippet}
  {#snippet actions()}
    <SheetHeaderAction title={$t('app.common.reset')} onclick={reset} disabled={activeKeys.length === 0}>
      <RotateCcw class="size-3.5" />
    </SheetHeaderAction>
  {/snippet}

  <p class="text-xs text-muted-foreground mb-4" data-testid="bulk-editor-summary">
    {$t('system.entities.bulk_editor.selection_summary', { count: rows.length, entity: entityLabel })}
  </p>

  {#if immutableColumns.length > 0}
    <section class="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2" data-testid="bulk-editor-immutable">
      <h3 class="text-xs font-medium text-muted-foreground mb-2">
        {$t('system.entities.bulk_editor.immutable_section')}
      </h3>
      <dl class="grid grid-cols-1 gap-y-1.5 text-xs">
        {#each immutableColumns as col (col.key)}
          {@const u = uniformValue(col.key)}
          <div class="flex items-baseline gap-x-2">
            <dt class="shrink-0 text-primary">{$t(col.label_key)}:</dt>
            {#if u.uniform}
              <dd class="min-w-0 truncate italic text-muted-foreground">{valueLabel(col, u.value)}</dd>
            {:else}
              <dd class="min-w-0">
                <button
                  type="button"
                  class="italic text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                  onclick={() => openRowsDrill(col, rows)}
                >
                  {$t('system.entities.bulk_editor.mixed')}
                </button>
              </dd>
            {/if}
          </div>
        {/each}
      </dl>
    </section>
  {/if}

  <div class="space-y-4">
    {#each activeKeys as key (key)}
      {@const col = editableColumns.find((c) => c.key === key)}
      {#if col}
        <div class="rounded-md border border-border p-3" data-testid="bulk-editor-field-{key}">
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <PrimeField label={$t(col.label_key)} icon={col.icon} help={col} help_context="list">
                {#snippet control({ id })}
                  <FormFieldDispatcher
                    column={col}
                    bind:value={values[key]}
                    emitsOptions={census.emitsOptions}
                    callablesOptions={census.callablesOptions}
                    controlProps={{ id }}
                    record={values}
                  />
                {/snippet}
              </PrimeField>
            </div>
            <Button
              variant="ghost"
              size="xs"
              class="mt-6 shrink-0"
              onclick={() => removeField(key)}
              aria-label={$t('app.common.delete')}
            >
              <Trash2 class="size-3.5" />
            </Button>
          </div>

          <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs" data-testid="bulk-editor-dist-{key}">
            <span class="text-muted-foreground">{$t('system.entities.bulk_editor.distribution')}:</span>
            {#each distribution(key).slice(0, 3) as d (bucketKey(d.value))}
              <button
                type="button"
                class="rounded border border-border bg-muted/40 px-1.5 py-0.5 hover:bg-muted"
                onclick={() => openRowsDrill(col, d.rows)}
                data-testid="bulk-editor-dist-chip"
              >
                {valueLabel(col, d.value)} <span class="text-muted-foreground">×{d.count}</span>
              </button>
            {/each}
            {#if distribution(key).length > 3}
              <button
                type="button"
                class="rounded border border-border bg-muted/40 px-1.5 py-0.5 hover:bg-muted"
                onclick={() => openRowsDrill(col, rows)}
              >+{distribution(key).length - 3}</button>
            {/if}
            <span class="ml-auto text-muted-foreground" data-testid="bulk-editor-impact-{key}">
              {$t('system.entities.bulk_editor.affected', { count: affectedCount(key) })}
              {#if rows.length - affectedCount(key) > 0}
                · {$t('system.entities.bulk_editor.already_current', { count: rows.length - affectedCount(key) })}
              {/if}
            </span>
          </div>
        </div>
      {/if}
    {/each}

    {#if availableColumns.length > 0}
      <ComboSelect
        mode="single"
        options={availableColumns.map((c) => ({ value: c.key, label: $t(c.label_key) }))}
        bind:value={addFieldValue}
        onChange={addField}
        placeholder={$t('system.entities.bulk_editor.field_placeholder')}
        data-testid="bulk-editor-add-field"
      />
    {:else if editableColumns.length === 0}
      <p class="text-sm text-muted-foreground">{$t('system.entities.bulk_editor.no_editable')}</p>
    {/if}
  </div>

  {#if auditColumns.length > 0}
    <Accordion.Root type="single" class="w-full mt-4">
      <Accordion.Item value="audit">
        <Accordion.Trigger class="text-xs font-normal text-muted-foreground hover:no-underline">
          {$t('system.common.sections.audit')}
        </Accordion.Trigger>
        <Accordion.Content class="pb-0">
          <dl class="grid grid-cols-1 gap-y-1.5 text-xs">
            {#each auditColumns as col (col.key)}
              {@const u = uniformValue(col.key)}
              <div class="flex items-baseline gap-x-2">
                <dt class="shrink-0 text-primary">{$t(col.label_key)}:</dt>
                {#if u.uniform}
                  <dd class="min-w-0 truncate italic text-muted-foreground">{valueLabel(col, u.value)}</dd>
                {:else}
                  <dd class="min-w-0">
                    <button
                      type="button"
                      class="italic text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                      onclick={() => openRowsDrill(col, rows)}
                    >
                      {$t('system.entities.bulk_editor.mixed')}
                    </button>
                  </dd>
                {/if}
              </div>
            {/each}
          </dl>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  {/if}
</SheetPanelLayout>

{#snippet applyFooter()}
  <SheetPanelFooter>
    <div class="flex w-full items-center justify-end gap-2">
      <Button variant="ghost" size="sm" onclick={() => closeSheet()}>{$t('app.common.cancel')}</Button>
      <Button
        variant="default"
        size="sm"
        onclick={apply}
        disabled={activeKeys.length === 0 || applying}
        data-testid="bulk-editor-apply"
      >
        <Plus class="size-3.5" />
        {$t('system.entities.bulk_editor.apply', { count: rows.length })}
      </Button>
    </div>
  </SheetPanelFooter>
{/snippet}
