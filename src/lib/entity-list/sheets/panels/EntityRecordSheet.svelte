<script lang="ts">
  /**
   * EntityRecordSheet — the `entity.record` host panel: the record view
   * opened by a `type:"ref"` cell's TEXT affordance, a row's detail CTA,
   * or `meta.create.surface:"sheet"` create CTAs.
   *
   * Resolution contract (uniform, no dedicated endpoints):
   *   uuid refs → the cell value IS the target uid → canonical
   *     `GET /entities/{entity}/{uuid}`;
   *   business-key refs (`ref.filter_field` ≠ uid) → the stored value
   *     identifies the target row through its `/list` filter →
   *     `rows[0][uid]` → same canonical GET.
   *   `mode:"create"` → meta only, no fetch; the surface POSTs
   *     `create.single` then the panel morphs into update on the
   *     created row (canonical re-GET — the served row is truth).
   *
   * The FORM is `EntityFormSurface` — the SAME engine `EntityFormPage`
   * mounts (schema + superform + dispatcher + guards + collab + draft +
   * commit). ONE declaration, two chromes: the page's width decides the
   * placement grid; the sheet's narrow width collapses it.
   *
   * Sheet chrome the panel owns: ref-resolution, hero states, the pencil
   * edit-toggle (readonly default), uid/version/lifecycle/audit chrome,
   * the dirty-close guard registration (X/Escape/outside while editing
   * → the surface's unsaved-changes confirm; pencil-off discards
   * silently by contract).
   */
  import { onMount, untrack } from 'svelte';
  import { t } from '$lib/i18n';
  import { apiFetch, entityApiBase, routesCensusFromModules, ApiUnreachableError } from '$lib/api';
  import { serviceCodeOf } from '$lib/composables/use-service-availability.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { fetchEntityMeta, orderedColumns } from '$lib/entity-list';
  import { filteredEntityListHref } from '$lib/entity-list/entity-links';
  import { Accordion, Badge, Button, DynamicIcon, SheetPanelFooter, SheetPanelLayout, toDisplayString } from '@primebrick/ui';
  import EntityFormSurface from '$lib/entity-form/EntityFormSurface.svelte';
  import EntityRecordUid from '../EntityRecordUid.svelte';
  import { openSheet, closeSheet, setSheetCloseGuard } from '$lib/shell/sheets/sheet-manager.svelte';
  import { isEntityOpAllowed } from '$lib/permissions.svelte';
  import { useAuditBox } from '$lib/composables/useAuditBox';
  import type { AuditData } from '$lib/utils/audit-data';
  import { extJsonParse } from '$lib/api-ext';
  import { ExternalLink, Pencil, X } from '@primebrick/ui/vendor/lucide';
  import { LoadingBar } from '$lib/components/ui/loading-bar';
  import type { MetaColumn, EntityMeta } from '$lib/entity-list/types';
  import type { FormFieldPlacement } from '@primebrick/ui';
  import { isUUID, StateHero } from '@primebrick/ui';

  let {
    entity,
    value,
    ref,
    service,
    edit,
    mode: modeProp,
  }: {
    /** Target entity API name (from `column.ref.entity`). */
    entity: string;
    /** The cell's raw value — the target uid for uuid refs. Absent in
     *  `mode:"create"` (no record exists yet). */
    value?: unknown;
    /** The column's ref contract — drives business-key resolution. */
    ref?: MetaColumn['ref'];
    /** Owning service — required for builtin entities (census map is
     *  last-wins ambiguous; route context threads through or the sheet
     *  fetches the wrong schema). */
    service?: string;
    /** Open straight into edit mode — ELT Modifica fallback for
     *  entities without a `kind:"detail"` route. */
    edit?: boolean;
    /** `create` → SAME panel, no record fetch: meta only, widgets
     *  editable from mount, commit POSTs `create.single` then the panel
     *  morphs into update on the created row. `update` (default) → the
     *  ref-resolution + GET contract above. */
    mode?: 'create' | 'update';
  } = $props();

  /** Panel mode — `let` because a successful create morphs the sheet
   *  into update on the created row (props are mount-stable). */
  let mode = $state<'create' | 'update'>(untrack(() => modeProp ?? 'update'));
  const isCreate = $derived(mode === 'create');
  /** The ref value load() resolves — in create mode nothing exists until
   *  the POST lands, then it carries the created uid. */
  let resolvedValue = $state<unknown>(untrack(() => value));

  // Props are stable within a sheet mount — the host remounts the panel
  // per open; untrack marks the intentional one-time read.
  const basePath = untrack(() => entityApiBase(entity, service));
  const routeCensus = $derived(routesCensusFromModules(shellNav.modules));

  /** The entity's declared form layout — first form-bearing route in the
   *  census (detail preferred over create). Absent → the surface's
   *  fallback: every writable served column in declared order. */
  const formFields = $derived.by<FormFieldPlacement[] | undefined>(() => {
    const routes = routeCensus.filter(
      (r) => r.entity === entity && r.page_props?.form?.fields?.length,
    );
    const detail = routes.find((r) => r.kind === 'detail') ?? routes[0];
    return detail?.page_props?.form?.fields;
  });
  const formDecl = $derived(formFields ? { fields: formFields } : undefined);

  let meta = $state<EntityMeta | null>(null);
  let record = $state<Record<string, unknown> | null>(null);
  let loading = $state(true);
  let notFound = $state(false);
  let failed = $state(false);
  /** Owning service unreachable (proxy 502/503-scoped, network failure):
   *  distinct hero naming the responsible service — never the generic
   *  load_error when we KNOW who should have answered. */
  let unreachable = $state(false);
  /** Pseudo-actor ref (`system`, seed aliases): the target is not a uuid —
   *  never reaches the API, renders a warning hero instead. */
  let pseudoRef = $state(false);
  /** The uid the sheet resolved — business-key refs land on their target's
   *  uuid before GET; heroes keep showing it above the error state.
   *  Initial value = the cell's raw stored value (same prop-stability
   *  contract as `basePath` — the panel remounts per open). */
  let heroUid = $state<unknown>(untrack(() => value));

  /** Edit mode — gated on `meta.actions`: the pencil renders iff the
   *  `update.single` op is enabled AND the user satisfies its declared
   *  permissions (same `isEntityOpAllowed` gate as row CTAs — fail-closed). */
  // `edit` prop seeds the initial mode (ELT Modifica fallback — the
  // pencil gate still applies: `canUpdate` false → edit renders off).
  let editing = $state(untrack(() => edit === true || modeProp === 'create'));
  const canUpdate = $derived(
    meta ? isEntityOpAllowed(meta.actions, 'update.single') : false,
  );

  /** The mounted form surface — footer CTAs and the close guard reach
   *  its exports (guard/formId/handleReset/confirmDiscard). */
  let surface = $state<EntityFormSurface | null>(null);

  /** Translated entity singular — the `<ns>.entities.<tk>.singular`
   *  convention shared with `entityPageTitle`; interpolated into hero
   *  messages (`{entity_singular}`). Raw key fallback keeps the sheet
   *  readable when a dict entry is missing. */
  const entitySingular = $derived.by(() => {
    if (!meta) return entity;
    const ns = meta.entities_ns ?? 'system';
    const tk = meta.translation_key ?? entity;
    const resolved = $t(`${ns}.entities.${tk}.singular`);
    return resolved && !resolved.includes('.singular') ? resolved : entity;
  });

  /** The entity's owning service display name — the census `entities`
   *  declaration is the entity→service contract. `label_key` resolves the
   *  localized name, `name` is its authored fallback. `undefined` for
   *  BE-owned entities and services absent from the census — the hero
   *  then falls back to the generic message. */
  const ownerServiceName = $derived.by(() => {
    const mod = shellNav.modules.find((m) => m.entities?.includes(entity));
    if (!mod) return undefined;
    if (mod.label_key) {
      const resolved = $t(mod.label_key);
      if (resolved && resolved !== mod.label_key) return resolved;
    }
    return mod.name || undefined;
  });

  /** Record surfaces show ONE row — the authored list icon is mapped to
   *  its canonical singular variant when a pair exists (`users`→`user`).
   *  Icons without a record variant render the authored glyph unchanged. */
  const RECORD_ICON_VARIANTS: Record<string, string> = {
    users: 'user',
    'users-round': 'user-round',
  };

  /** Entity icon — ONE authored source: the nav leaf pointing at the
   *  entity's censused list route; the route's own declared `icon` when no
   *  leaf carries one. `null` for uncensused entities → no icon renders
   *  (absent data → absent element, never an invented default). */
  const entityIcon = $derived.by(() => {
    const listRoute = routeCensus.find(
      (r) => r.entity === entity && (r.kind === 'list' || r.kind === 'dict'),
    );
    if (!listRoute) return null;
    let icon: string | null = null;
    for (const m of shellNav.modules) {
      const stack = [...(m.nav ?? [])];
      while (stack.length) {
        const leaf = stack.pop()!;
        if (leaf.href === listRoute.route && leaf.icon) { icon = leaf.icon; break; }
        if (leaf.children) stack.push(...leaf.children);
      }
      if (icon) break;
    }
    icon ??= listRoute.icon ?? null;
    return icon ? (RECORD_ICON_VARIANTS[icon] ?? icon) : null;
  });

  const titleText = $derived.by(() => {
    if (!meta) return entity;
    if (isCreate) return entitySingular;
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
  /** Lifecycle state — `deleted_at` (soft-delete) wins over `suspended_at`:
   *  the footer badge and the destructive title follow the same record. */
  const isDeleted = $derived(Boolean(record?.deleted_at));
  const isSuspended = $derived(Boolean(record?.suspended_at));

  /** Immutable audit facts — the sheet's narrow space keeps them behind
   *  a collapsed accordion (the page's footer block is the wide-chrome
   *  anatomy). `version` lives on the footer badge, never duplicated. */
  const auditColumns = $derived(
    orderedColumns(meta?.columns).filter((c) => !c.hidden && c.audited === true && c.key !== 'version'),
  );
  const auditBox = $derived(
    useAuditBox({
      auditData: (record ?? {}) as Partial<AuditData>,
      auditingColumns: auditColumns,
      isCreatePage: isCreate,
      entity: meta?.entity ?? '',
      entities_ns: meta?.entities_ns,
      rowUuid: rowUuid ?? '',
    }),
  );

  /** Post-commit — the surface already rebaselined, notified the parent
   *  list and cleared the draft slot; the panel owns the morph. */
  function onsaved(row: Record<string, unknown> | null, op: 'create' | 'update') {
    if (!row) return;
    if (op === 'update') {
      record = row;
      editing = false;
      return;
    }
    // create → morph into update on the created row: the served record
    // is the source of truth, never the echoed payload — canonical re-GET.
    const uid = meta?.uid ?? 'uuid';
    resolvedValue = row[uid];
    heroUid = resolvedValue;
    mode = 'update';
    editing = false;
    record = row;
    void load();
  }

  /** Pencil toggle — OFF is the silent-discard path by contract: pending
   *  edits drop back to the baseline without a confirm (the toggle IS
   *  the explicit intent). */
  let prevEditing = $state(untrack(() => editing));
  $effect(() => {
    const e = editing;
    if (!e && prevEditing) surface?.discardEdits();
    prevEditing = e;
  });
  function toggleEdit() {
    editing = !editing;
  }

  // Dirty-close guard — X / Escape / outside while EDITING consults the
  // surface's unsaved-changes confirm through SheetHost's close funnel.
  // `editing=false` → pencil-off already discarded → close proceeds.
  $effect(() => {
    setSheetCloseGuard(async () => {
      if (!editing) return true;
      return (await surface?.confirmDiscard()) ?? true;
    });
    return () => setSheetCloseGuard(null);
  });

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
        service,
      },
      { stack: true },
    );
  }

  async function load(): Promise<void> {
    loading = true;
    failed = false;
    notFound = false;
    unreachable = false;
    try {
      meta = await fetchEntityMeta(basePath);
      // Create mode — no record exists yet: meta drives the empty form,
      // `record={}` keeps uid/audit/version/lifecycle chrome absent.
      if (mode === 'create') {
        record = {};
        return;
      }
      const uid = meta.uid ?? 'uuid';
      let uuid = String(resolvedValue);
      const ff = ref?.filter_field;
      // uid-keyed refs resolve `value` straight to `GET /record/<uuid>` — a
      // non-uuid target is a pseudo-actor ref (`system`, seed aliases):
      // warning hero, no API call. Business-key refs (`ff !== uid`) keep
      // their list lookup — `system` is a legit filter value there.
      if ((!ff || ff === uid) && !isUUID(uuid)) {
        pseudoRef = true;
        return;
      }
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
        const listBody = (await listRes.text().then((t) => extJsonParse<any>(t))) as { rows?: Record<string, unknown>[] };
        const hit = listBody.rows?.[0];
        if (!hit?.[uid]) {
          notFound = true;
          return;
        }
        uuid = String(hit[uid]);
      }
      heroUid = uuid;
      const res = await apiFetch(`${basePath}/${uuid}`);
      if (res.status === 404) {
        notFound = true;
        return;
      }
      if (!res.ok) {
        failed = true;
        return;
      }
      record = (await res.text().then((t) => extJsonParse<any>(t))) as Record<string, unknown>;
    } catch (e) {
      // ApiUnreachableError = the owning service (or the BE itself for
      // unmapped entities) can't be reached — proxy 502/503-scoped or a
      // network failure. Distinct hero: name WHO is unreachable instead
      // of the generic load error.
      if (e instanceof ApiUnreachableError) unreachable = true;
      else failed = true;
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
    <span class={isDeleted ? 'text-destructive' : undefined}>{titleText}</span>
  {/snippet}
  {#snippet actions()}
    {#if canUpdate && !isCreate}
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
    {:else if pseudoRef}
      <!-- Pseudo-actor ref (non-uuid): the subject was never censused.
           Identity stays visible — the stored value IS the ref we hold. -->
      <EntityRecordUid {meta} value={heroUid} {entity} />
      <StateHero
        severity="warning"
        icon="ghost"
        animation="pulse"
        title_key="system.entities.record.pseudo_subject"
        params={{ entity_singular: entitySingular }}
        test_id="entity-record-sheet-pseudo-hero"
      />
    {:else if notFound}
      <EntityRecordUid {meta} value={heroUid} {entity} />
      <StateHero
        severity="destructive"
        icon="user-x"
        animation="pulse"
        title_key="system.entities.record.unavailable"
        params={{ entity_singular: entitySingular }}
        test_id="entity-record-sheet-missing-hero"
      />
    {:else if unreachable}
      <!-- Owning service unreachable — the sheet still opens (identity
           block + watermark) and names the service when the census knows
           it; the generic message is the fallback when it doesn't. -->
      <EntityRecordUid {meta} value={heroUid} {entity} />
      <StateHero
        severity="destructive"
        icon="server-off"
        animation="none"
        title_key={ownerServiceName
          ? 'app.service.entity_owner_unreachable'
          : 'app.service.entity_owner_unreachable_generic'}
        params={{ service: ownerServiceName, entity: entitySingular }}
        test_id="entity-record-sheet-unreachable-hero"
      />
    {:else if failed || !record}
      <EntityRecordUid {meta} value={heroUid} {entity} />
      <StateHero
        severity="destructive"
        icon="circle-alert"
        animation="none"
        title_key="app.common.load_error"
        test_id="entity-record-sheet-failed-hero"
      />
    {:else if record && meta}
      <EntityFormSurface
        bind:this={surface}
        {entity}
        service={serviceCodeOf(basePath) ?? service}
        {mode}
        {meta}
        {record}
        recordUuid={rowUuid}
        modules={shellNav.modules}
        {formDecl}
        {editing}
        {onsaved}
      />
      {#if auditColumns.length && !isCreate}
        <!-- Audit fields live behind a collapsed accordion — the
             separator-line affordance is the canonical Accordion
             trigger. -->
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
                <!-- gap-y-2 = the FormPageLayout audit-foot leading;
                     values ellipse (never wrap, never horizontal
                     scroll). -->
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
    {/if}
  </div>

  {#snippet footer()}
    {#if record && (versionValue !== undefined && versionValue !== null || editing)}
      <SheetPanelFooter>
        {#snippet start()}
          {#if versionValue !== undefined && versionValue !== null}
            <!-- Version badge doubles as the drill affordance into
                 `entity.versionHistory` — canonical LEFT anatomy, same as
                 FormPageLayout / ConfigListRow / VersionHistoryPanel. -->
            <button
              type="button"
              onclick={openVersionHistory}
              class="inline-flex"
              title={$t('system.entities.version_history.title')}
              data-testid="entity-record-sheet-version-badge"
            >
              <Badge
                variant="outline"
                class="text-xs font-semibold border border-primary cursor-pointer hover:bg-primary/10"
              >
                v{versionValue}
              </Badge>
            </button>
          {/if}
          <!-- Lifecycle badge — destructive for soft-deleted records,
               emerald success-chip anatomy for suspended ones. -->
          {#if isDeleted}
            <Badge variant="destructive" data-testid="entity-record-sheet-status-badge">
              {$t('system.common.status.deleted')}
            </Badge>
          {:else if isSuspended}
            <Badge
              variant="outline"
              class="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              data-testid="entity-record-sheet-status-badge"
            >
              {$t('system.common.status.suspended')}
            </Badge>
          {/if}
        {/snippet}
        {#if editing}
          <Button
            variant="outline"
            size="sm"
            disabled={!surface?.guard.hasChanges}
            onclick={() => surface?.handleReset()}
            data-testid="entity-form-reset"
            title={$t('app.common.reset')}
          >
            <DynamicIcon name="eraser" size={16} />
            {$t('app.common.reset')}
          </Button>
          <Button
            size="sm"
            type="submit"
            form={surface?.formId}
            disabled={!surface?.guard.canSave || surface?.guard.submitting}
            data-testid="entity-form-submit"
          >
            {$t(isCreate ? 'app.common.create' : 'app.common.save')}
          </Button>
        {/if}
      </SheetPanelFooter>
    {/if}
  {/snippet}
</SheetPanelLayout>
