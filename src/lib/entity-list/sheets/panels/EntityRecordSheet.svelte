<script lang="ts">
  /**
   * EntityRecordSheet — the `entity.record` host panel: the record view
   * opened by a `type:"ref"` cell's TEXT affordance.
   *
   * Resolution contract (uniform, no dedicated endpoints):
   *   uuid refs → the cell value IS the target uid → canonical
   *     `GET /entities/{entity}/{uuid}`;
   *   business-key refs (`ref.filter_field` ≠ uid) → the stored value
   *     identifies the target row through its `/list` filter →
   *     `rows[0][uid]` → same canonical GET.
   *
   * Layout: the target entity's census `page_props.form` placements
   * (order + col/row/row_span grid) when a form-bearing route exists,
   * else the fallback — every served `meta.columns` in declared order.
   *
   * Field rendering: `TableCell` — the canonical metadata-driven VALUE
   * renderer. This is a READ-ONLY display surface: no form widgets, no
   * dispatcher. Ref fields render the same link anatomy as the list
   * (text → a further `entity.record` sheet = drill-through; icon →
   * `_blank` filtered list), so nested references navigate the same panel.
   *
   * In-sheet links are `_blank`-only by contract.
   */
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { apiFetch, entityApiBase, routesCensusFromModules } from '$lib/api';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { fetchEntityMeta } from '$lib/entity-list';
  import { filteredEntityListHref } from '$lib/entity-list/entity-links';
  import { Badge, Button, DynamicIcon, SheetPanelFooter, SheetPanelLayout, toDisplayString } from '@primebrick/ui';
  import EntityRecordSheetBody from '../EntityRecordSheetBody.svelte';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { isEntityOpAllowed } from '$lib/permissions.svelte';
  import { findActionEndpoint, fillActionPath } from '$lib/entity-list/action-endpoints';
  import { extJsonStringify } from '$lib/api-ext';
  import { Check, ExternalLink, History, Pencil, X } from '@primebrick/ui/vendor/lucide';
  import { LoadingBar } from '$lib/components/ui/loading-bar';
  import type { MetaColumn, EntityMeta } from '$lib/entity-list/types';
  import type { FormFieldPlacement } from '@primebrick/ui';

  let {
    entity,
    value,
    ref,
  }: {
    /** Target entity API name (from `column.ref.entity`). */
    entity: string;
    /** The cell's raw value — the target uid for uuid refs. */
    value: unknown;
    /** The column's ref contract — drives business-key resolution. */
    ref?: MetaColumn['ref'];
  } = $props();

  // Props are stable within a sheet mount — the host remounts the panel
  // per open, so plain captures are the honest contract.
  // svelte-ignore state_referenced_locally
  const basePath = entityApiBase(entity);
  const routeCensus = $derived(routesCensusFromModules(shellNav.modules));

  /** The entity's declared form layout — first form-bearing route in the
   *  census (detail preferred over create). Absent → fallback columns. */
  const formFields = $derived.by<FormFieldPlacement[] | undefined>(() => {
    const routes = routeCensus.filter(
      (r) => r.entity === entity && r.page_props?.form?.fields?.length,
    );
    const detail = routes.find((r) => r.kind === 'detail') ?? routes[0];
    return detail?.page_props?.form?.fields;
  });
  /** Two-column grid only when the declared layout actually uses col 2. */
  const formTwoCol = $derived((formFields ?? []).some((p) => (p.col ?? 1) > 1));

  let meta = $state<EntityMeta | null>(null);
  let record = $state<Record<string, unknown> | null>(null);
  let loading = $state(true);
  let notFound = $state(false);
  let failed = $state(false);

  /** Edit mode — gated on `meta.actions`: the pencil renders iff the
   *  `update.single` op is enabled AND the user satisfies its declared
   *  permissions (same `isEntityOpAllowed` gate as row CTAs — fail-closed). */
  let editing = $state(false);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  /** Field surface draft — bound up from the body; readonly mode keeps it
   *  inert, edit mode collects writes. */
  let draft = $state<Record<string, unknown>>({});
  const canUpdate = $derived(
    meta ? isEntityOpAllowed(meta.actions, 'update.single') : false,
  );

  /** Entity icon — ONE authored source: the nav leaf pointing at the
   *  entity's censused list route; the route's own declared `icon` when no
   *  leaf carries one. `null` for uncensused entities → no icon renders
   *  (absent data → absent element, never an invented default). */
  const entityIcon = $derived.by(() => {
    const listRoute = routeCensus.find(
      (r) => r.entity === entity && (r.kind === 'list' || r.kind === 'dict'),
    );
    if (!listRoute) return null;
    for (const m of shellNav.modules) {
      const stack = [...(m.nav ?? [])];
      while (stack.length) {
        const leaf = stack.pop()!;
        if (leaf.href === listRoute.route && leaf.icon) return leaf.icon;
        if (leaf.children) stack.push(...leaf.children);
      }
    }
    return listRoute.icon ?? null;
  });

  const columnsMap = $derived.by<ReadonlyMap<string, MetaColumn>>(() => {
    const m = new Map<string, MetaColumn>();
    for (const c of meta?.columns ?? []) m.set(c.key, c);
    return m;
  });
  /** Form layout entries resolved to their column (drift-safe: a
   *  placement key absent from served meta is dropped, never invented). */
  const formPlacements = $derived.by(() => {
    if (!formFields) return [] as { col: MetaColumn; p: FormFieldPlacement }[];
    const out: { col: MetaColumn; p: FormFieldPlacement }[] = [];
    for (const p of formFields) {
      const col = columnsMap.get(p.key);
      if (col && !col.hidden) out.push({ col, p });
    }
    return out;
  });
  const titleText = $derived.by(() => {
    if (!meta) return entity;
    const disp = meta.display_field ? record?.[meta.display_field] : undefined;
    return disp !== undefined && disp !== null && disp !== ''
      ? toDisplayString(disp)
      : entity;
  });
  const listHref = $derived.by(() => {
    const uid = meta?.uid ?? 'uuid';
    const field = ref?.filter_field && ref.filter_field !== uid ? ref.filter_field : uid;
    const v = record?.[uid] ?? (field === uid ? value : undefined);
    if (v === undefined || v === null) return null;
    return filteredEntityListHref(routeCensus, entity, [
      { field, op: '=', value: String(v) },
    ]);
  });

  const rowUuid = $derived.by(() => {
    const uid = meta?.uid ?? 'uuid';
    const v = record?.[uid];
    return v === undefined || v === null ? null : String(v);
  });
  const versionValue = $derived(record?.version);

  /** Keys the PUT is allowed to carry — the SAME partition the body
   *  renders: declared placements when present, else served non-audit,
   *  non-uid, non-version, non-hidden columns. uid/version/audit never
   *  cross the write boundary. */
  const saveKeys = $derived.by<string[]>(() => {
    if (formPlacements.length)
      return formPlacements.filter(({ col }) => col.immutable !== true).map(({ col }) => col.key);
    const uid = meta?.uid ?? 'uuid';
    return (meta?.columns ?? [])
      .filter(
        (c) =>
          !c.hidden &&
          c.audited !== true &&
          c.immutable !== true &&
          c.key !== uid &&
          c.key !== 'version',
      )
      .map((c) => c.key);
  });

  /** Dirty-field diff — strict update schemas (`.strict()` DTOs) accept
   *  ONLY their declared writable set; sending unchanged read-only fields
   *  is a 400 by contract. Only what the user actually changed crosses
   *  the wire. */
  function dirtyFields(): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    if (!record) return fields;
    for (const k of saveKeys) {
      if (draft[k] !== record[k]) fields[k] = draft[k];
    }
    return fields;
  }

  async function save(): Promise<void> {
    if (!meta || !record || rowUuid === null) return;
    saving = true;
    saveError = null;
    try {
      const uid = meta.uid ?? 'uuid';
      const endpoint = findActionEndpoint(meta.actions, 'update.single');
      const url = endpoint
        ? fillActionPath(endpoint.path, record, uid)
        : `${basePath}/${encodeURIComponent(rowUuid)}`;
      const fields = dirtyFields();
      fields.version = record.version;
      const res = await apiFetch(url, {
        method: endpoint?.method ?? 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: extJsonStringify({ entity: fields }),
      });
      if (!res.ok) {
        saveError = `HTTP ${res.status}`;
        return;
      }
      editing = false;
      // Re-GET through the canonical path — the served row is the source
      // of truth, never the echoed payload.
      await load();
    } catch {
      saveError = 'save_failed';
    } finally {
      saving = false;
    }
  }

  function toggleEdit() {
    saveError = null;
    editing = !editing;
  }

  /** Version badge → `entity.versionHistory` stacked on the right: the
   *  record sheet slides left, history closes back into it. */
  function openVersionHistory() {
    if (!meta || rowUuid === null) return;
    openSheet(
      'entity.versionHistory',
      {
        entity,
        translationKey: meta.translation_key ?? entity,
        entities_ns: meta.entities_ns,
        rowUuid,
        columns: meta.columns ?? [],
      },
      { stack: true },
    );
  }

  async function load(): Promise<void> {
    loading = true;
    failed = false;
    notFound = false;
    try {
      meta = await fetchEntityMeta(basePath);
      const uid = meta.uid ?? 'uuid';
      let uuid = String(value);
      const ff = ref?.filter_field;
      if (ff && ff !== uid) {
        const params = new URLSearchParams();
        params.set('filters[0][field]', ff);
        params.set('filters[0][op]', '=');
        params.set('filters[0][value]', String(value));
        params.set('limit', '1');
        const listRes = await apiFetch(`${basePath}/list?${params.toString()}`);
        if (!listRes.ok) {
          failed = true;
          return;
        }
        const listBody = (await listRes.json()) as { rows?: Record<string, unknown>[] };
        const hit = listBody.rows?.[0];
        if (!hit?.[uid]) {
          notFound = true;
          return;
        }
        uuid = String(hit[uid]);
      }
      const res = await apiFetch(`${basePath}/${uuid}`);
      if (res.status === 404) {
        notFound = true;
        return;
      }
      if (!res.ok) {
        failed = true;
        return;
      }
      record = (await res.json()) as Record<string, unknown>;
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

<SheetPanelLayout>
  {#snippet icon()}
    <!-- Authored icon only — an entity with no censused route renders
         nothing, never an invented default (icon-no-fallback). -->
    {#if entityIcon}
      <span class="inline-flex" data-icon-name={entityIcon}>
        <DynamicIcon name={entityIcon} class="size-4" />
      </span>
    {/if}
  {/snippet}
  {#snippet title()}
    {titleText}
  {/snippet}
  {#snippet actions()}
    {#if canUpdate}
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        aria-pressed={editing}
        title={$t(editing ? 'app.common.cancel' : 'app.common.edit')}
        aria-label={$t(editing ? 'app.common.cancel' : 'app.common.edit')}
        onclick={toggleEdit}
        data-testid="entity-record-sheet-edit-toggle"
      >
        {#if editing}<X class="size-4" />{:else}<Pencil class="size-4" />{/if}
      </Button>
    {/if}
    {#if listHref}
      <a
        href={listHref}
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        title={$t('app.common.open_in_new_tab')}
        aria-label={$t('app.common.open_in_new_tab')}
        data-testid="entity-record-sheet-list-cta"
      >
        <ExternalLink class="size-4" />
      </a>
    {/if}
  {/snippet}

  <div class="h-full overflow-auto p-4" data-testid="entity-record-sheet">
    {#if loading}
      <LoadingBar />
    {:else if notFound}
      <p class="text-sm text-muted-foreground">{$t('app.common.not_found')}</p>
    {:else if failed || !record}
      <p class="text-sm text-muted-foreground">{$t('app.common.load_error')}</p>
    {:else if record && meta}
      <EntityRecordSheetBody
        {meta}
        {record}
        {formPlacements}
        {formTwoCol}
        {editing}
        bind:draft
      />
      {#if saveError}
        <p class="mt-3 text-sm text-destructive" data-testid="entity-record-sheet-save-error">
          {$t('app.common.save_failed')} — {saveError}
        </p>
      {/if}
    {/if}
  </div>

  {#snippet footer()}
    {#if record && (versionValue !== undefined && versionValue !== null || editing)}
      <SheetPanelFooter>
        {#snippet start()}
          {#if versionValue !== undefined && versionValue !== null}
            <!-- Version is record META content (the `start` slot's contract —
                 legend/meta, not commit CTAs) that doubles as the drill
                 affordance into `entity.versionHistory`. role/tabindex keep
                 the keyboard contract a plain Badge lacks. -->
            <Badge
              variant="secondary"
              role="button"
              tabindex={0}
              title={$t('system.common.fields.version')}
              onclick={openVersionHistory}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openVersionHistory();
                }
              }}
              data-testid="entity-record-sheet-version-badge"
            >
              <History class="mr-1 size-3" />
              v{versionValue}
            </Badge>
          {/if}
        {/snippet}
        {#if editing}
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onclick={toggleEdit}
            data-testid="entity-record-sheet-cancel"
          >
            {$t('app.common.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={saving}
            onclick={save}
            data-testid="entity-record-sheet-save"
          >
            <Check class="mr-1 size-4" />
            {$t('app.common.save')}
          </Button>
        {/if}
      </SheetPanelFooter>
    {/if}
  {/snippet}
</SheetPanelLayout>
