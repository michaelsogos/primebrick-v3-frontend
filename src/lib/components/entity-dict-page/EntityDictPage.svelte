<script lang="ts">
  /**
   * EntityDictPage — the `kind:"dict"` archetype: a compact inline-editable
   * list for dictionary/enum entities (rows add/edit in place; create and
   * update ARE the same surface).
   *
   * Anatomy (the ConfigList port onto served meta):
   *   - sticky toolbar, level 1: scoped search left (the canonical ELT
   *     SearchBar + `entity.searchIn` sheet) | CTAs right in the ELT
   *     order — deletion-view group (soft-delete entities) │divider│
   *     filters funnel + refresh │divider│ add-row CTA
   *   - sticky toolbar, level 2: the shared ELT SELECT ALL | FILTER | BULK
   *     bar (BulkActionsToolbar — select-all leading zone, filters↔bulk
   *     toggle, FilterBar, bulk CTAs; the dict-local revert rides the
   *     `bulkExtraActions` slot since it is a page-state op, not an
   *     `entity_op` route)
   *   - rows: DictRow — title + badges + audit meta left, one
   *     FormFieldDispatcher per editable column right (depends_on/uom/
   *     remote options resolved by the canonical control resolver)
   *   - fieldset groups ONLY when meta.dict.group_field is declared
   *   - pager strip: the canonical TableFooter anatomy at the BOTTOM —
   *     range | page-size dropdown + segmented first/prev/next/last +
   *     "Page x of y" (pagination never lives in the header toolbar).
   *   - footer: taint explanation left, atomic save right — one save
   *     applies every tainted row + reorder, entity writes per row under
   *     the standard {entity} envelope (the entity-router exposes no bulk
   *     update — "atomic" is the UX contract: all-or-notify, never half-
   *     silent). Row labels pending through takePendingTranslations flush
   *     to the standard translation gateway route.
   *   - reorder: chevrons mutate the order_field, mark rows tainted, and
   *     persist in the SAME bulk save (no dedicated endpoint).
   */
  import { onMount } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { t } from '$lib/i18n';
  import { apiFetch, entityApiBase } from '$lib/api';
  import { useEntityList } from '$lib/composables/useEntityList.svelte';
  import { useSelection, Button, Badge, Toolbar, RefreshButton } from '@primebrick/ui';
  import { SelectableFieldset, DeletionFilterToggle } from '@primebrick/ui';
  import { LoadingBar } from '$lib/components/ui/loading-bar';
  import { SearchBar, BulkActionsToolbar, PaginationControls, RangeLabel, useToolbarMode } from '$lib/components/entity-list-table';
  import { isColumnFilterable, searchableTextColumns, useEntitySheetSync } from '$lib/entity-list';
  import { Plus, Undo2, LoaderCircle, Funnel } from '@primebrick/ui/vendor/lucide';
  import { type MetaColumn, type EntityMeta } from '$lib/entity-list/types';
  import { entitiesNs } from '$lib/utils/entity-meta';
  import { isEntityOpAllowed } from '$lib/permissions.svelte';
  import { extJsonStringify } from '$lib/api-ext';
  import FormFieldDispatcher from '$lib/entity-form/FormFieldDispatcher.svelte';
  import DictDraftRow from './DictDraftRow.svelte';
  import { pushNotification } from '$lib/errors/app-errors';
  import { clearPendingTranslations } from '$lib/i18n/pending-translations.svelte';
  import { flushPendingTranslations } from '$lib/i18n/flush-pending-translations';
  import { useMfaStepUp } from '$lib/composables/useMfaStepUp.svelte';
  import MfaStepUpDialog from '$lib/components/auth/MfaStepUpDialog.svelte';
  import DictRow from './DictRow.svelte';
  import type { CensusRoute } from '$lib/api';

  let { decl }: { decl: CensusRoute } = $props();

  // decl is stable within a mount — the caller {#key pathname} remounts
  // the page per route change, so plain captures are the honest contract.
  // svelte-ignore state_referenced_locally
  const entity = decl.entity ?? '';
  // svelte-ignore state_referenced_locally
  const basePath = entityApiBase(entity);
  /** Translation writes resolve their module PER KEY (prefix == module
   *  code) — `custom.*` keys land in custom.translations. */

  const list = useEntityList<Record<string, unknown>>({
    basePath,
    storageKeyPrefix: `pb:dict:${entity}:`,
    errorScopeKey: 'app.common.errors.scope.dict_list',
    t: (k, p) => $t(k, p),
  });

  const skSelectedKeys = `pb:dict:${entity}:selectedKeys`;
  onMount(() => {
    try {
      const raw = sessionStorage.getItem(skSelectedKeys);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((k): k is string => typeof k === 'string');
        if (ids.length) selection.toggleSelectAll(ids, true);
      }
    } catch {
      // ignore bad storage payloads
    }
    void list.init();
  });

  // The pending-translation queue is session-scoped — leaving the page with
  // unsaved drafts must never persist queued labels (config-create rule).
  $effect(() => () => clearPendingTranslations(basePath));

  $effect(() => {
    try {
      sessionStorage.setItem(skSelectedKeys, JSON.stringify([...selection.state.selected_ids]));
    } catch {
      // ignore quota / blocked storage
    }
  });

  const stepUp = useMfaStepUp();

  // ─── Meta-derived contract ───────────────────────────────────────────
  const meta = $derived(list.meta as EntityMeta | null);
  const uid = $derived(meta?.uid ?? 'uuid');
  const dictFacet = $derived(meta?.dict);
  const displayField = $derived(meta?.display_field);

  const columnMap = $derived.by<ReadonlyMap<string, MetaColumn>>(() => {
    const m = new SvelteMap<string, MetaColumn>();
    for (const c of meta?.columns ?? []) m.set(c.key, c);
    return m;
  });

  /**
   * Editable columns — the dict row's dynamic inputs. A column is editable
   * when it is a PHYSICAL writable field: not audited, not server-managed
   * (`id`/`uuid`), not hidden, not calculated/virtual, and never the uid
   * itself. This is the same universe a `page_props.form` placement could
   * declare — derived, not re-authored per page.
   */
  const editableColumns = $derived(
    (meta?.columns ?? []).filter(
      (c) =>
        !c.audited &&
        !c.managed &&
        !c.hidden &&
        !c.kind &&
        c.key !== uid &&
        c.key !== 'id',
    ),
  );

  /** Update-mode editable set — `immutable` columns are create-set and
   *  frozen afterwards: they stay editable on the DRAFT (create) row but
   *  drop out of existing-row editing. */
  const updateEditableColumns = $derived(editableColumns.filter((c) => c.immutable !== true));

  const orderField = $derived(
    dictFacet?.order_field ?? (columnMap.has('sort') ? 'sort' : undefined),
  );
  const groupField = $derived(dictFacet?.group_field);

  /**
   * The dict label convention — `label_key` is rendered by the dedicated
   * TranslationKeyCell (key pick/create over `*.entities.<tk>.rows.*`,
   * `custom.*`-only create) and its languages CTA queues translations into
   * the standard pending-translations store, flushed on save.
   */
  const translationKey = $derived(meta?.translation_key ?? entity);
  const entities_ns = $derived(entitiesNs(meta));

  // ─── Toolbar contract — same derivations ELT owns for its two-level
  //     bar: searchable/filterable column sets and the soft-delete flag
  //     (audited `deleted_at`/`deleted_by` presence drives the view group). ──
  const allColumns = $derived(meta?.columns ?? []);
  const searchableColumns = $derived(searchableTextColumns(allColumns));
  const filterableColumns = $derived(allColumns.filter((c) => isColumnFilterable(c)));
  const hasSoftDelete = $derived(
    allColumns.some((c) => c.audited === true && (c.key === 'deleted_at' || c.key === 'deleted_by')),
  );

  // Entities without soft-delete columns must never send `deleted_records`
  // or show the view group — same guard ELT applies. It must wait for meta:
  // firing while columns are empty clobbers the restored sessionStorage mode.
  $effect(() => {
    if (allColumns.length > 0 && !hasSoftDelete && list.deletionFilterMode !== 'non_deleted') {
      list.onDeletionFilterModeChange('non_deleted');
    }
  });

  const canCreate = $derived(isEntityOpAllowed(meta?.actions, 'create.single'));
  const canUpdate = $derived(isEntityOpAllowed(meta?.actions, 'update.single'));
  const canDelete = $derived(isEntityOpAllowed(meta?.actions, 'delete.single'));
  const canRestore = $derived(isEntityOpAllowed(meta?.actions, 'restore.single'));
  const canBulkDelete = $derived(isEntityOpAllowed(meta?.actions, 'delete.bulk'));

  // ─── Drafts (add-row) — local rows not yet persisted ──────────────────
  type Draft = { __draft: string; values: Record<string, unknown> };
  let drafts = $state<Draft[]>([]);
  let draftSeq = 0;

  function requiredColumns(): MetaColumn[] {
    return editableColumns.filter((c) => c.nullable === false);
  }

  function handleAddRow() {
    const values: Record<string, unknown> = {};
    for (const c of editableColumns) values[c.key] = c.nullable === true ? null : '';
    if (orderField) {
      const maxSort = Math.max(
        0,
        ...list.rows.map((r) => Number(r[orderField] ?? 0)),
        ...drafts.map((d) => Number(d.values[orderField] ?? 0)),
      );
      // Seed convention is a ×10 step (10/20/30…) so later reorders have
      // integer room between neighbours — drafts continue the convention.
      values[orderField] = maxSort + 10;
    }
    drafts = [...drafts, { __draft: `d${++draftSeq}`, values }];
  }

  // ─── Taint tracking — per-row value maps over the served rows ─────────
  let values = $state<Record<string, Record<string, unknown>>>({});
  let originals = $state<Record<string, Record<string, unknown>>>({});
  let lastRowsKey = $state('');

  $effect(() => {
    const key = list.rows.map((r) => `${r[uid]}:${r['version']}`).join('|');
    if (key !== lastRowsKey) {
      const next: Record<string, Record<string, unknown>> = {};
      for (const r of list.rows) {
        const v: Record<string, unknown> = {};
        for (const c of editableColumns) v[c.key] = r[c.key];
        next[String(r[uid])] = v;
      }
      values = next;
      originals = $state.snapshot(next);
      lastRowsKey = key;
    }
  });

  const taintedUids = $derived.by<ReadonlySet<string>>(() => {
    const tainted = new SvelteSet<string>();
    for (const r of list.rows) {
      const id = String(r[uid]);
      const curr = values[id];
      const orig = originals[id];
      if (!curr || !orig) continue;
      for (const c of editableColumns) {
        if (String(curr[c.key] ?? '') !== String(orig[c.key] ?? '')) {
          tainted.add(id);
          break;
        }
      }
    }
    return tainted;
  });

  const hasChanges = $derived(taintedUids.size > 0 || drafts.length > 0);
  let saving = $state(false);

  /** Required-empty errors for one values map — same shape as the row
   *  `errors` prop so the failing cell carries the reason inline, never
   *  a silent save gate. */
  function missingRequired(v: Record<string, unknown>): Record<string, string[]> {
    const errs: Record<string, string[]> = {};
    for (const c of requiredColumns()) {
      const val = v[c.key];
      if (val === null || val === undefined || String(val).trim() === '') {
        errs[c.key] = [$t('app.common.errors.required')];
      }
    }
    return errs;
  }

  function draftValid(d: Draft): boolean {
    return Object.keys(missingRequired(d.values)).length === 0;
  }

  /** Tainted rows whose required columns went empty — same gate as drafts. */
  const invalidRowUids = $derived.by<ReadonlySet<string>>(() => {
    const invalid = new SvelteSet<string>();
    for (const id of taintedUids) {
      if (Object.keys(missingRequired(values[id] ?? {})).length > 0) invalid.add(id);
    }
    return invalid;
  });

  const canSave = $derived(
    hasChanges && !saving && drafts.every(draftValid) && invalidRowUids.size === 0,
  );

  function cellChange(id: string, key: string, value: unknown) {
    const v = { ...(values[id] ?? {}) };
    v[key] = value;
    values = { ...values, [id]: v };
  }

  function revertRow(id: string) {
    const orig = originals[id];
    if (!orig) return;
    values = { ...values, [id]: $state.snapshot(orig) };
  }

  /** Bulk revert = the SELECTED tainted rows only (the toolbar badge
   *  counts exactly that set) — drafts are not selectable and stay. */
  function revertSelected() {
    for (const id of selection.state.selected_ids) {
      if (taintedUids.has(id)) revertRow(id);
    }
  }

  // ─── Reorder — swap order_field values on adjacent rows, mark tainted ──
  const displayRows = $derived(
    orderField
      ? [...list.rows].sort(
          (a, b) => Number(a[orderField] ?? 0) - Number(b[orderField] ?? 0),
        )
      : list.rows,
  );

  function move(id: string, dir: -1 | 1) {
    if (!orderField) return;
    const idx = displayRows.findIndex((r) => String(r[uid]) === id);
    const other = displayRows[idx + dir];
    if (idx < 0 || !other) return;
    const a = displayRows[idx];
    const aId = String(a[uid]);
    const bId = String(other[uid]);
    const aSort = values[aId]?.[orderField] ?? a[orderField];
    const bSort = values[bId]?.[orderField] ?? other[orderField];
    cellChange(aId, orderField, bSort);
    cellChange(bId, orderField, aSort);
  }

  // ─── Grouping — flat unless meta.dict.group_field is declared ─────────
  const ungrouped = $derived(
    groupField
      ? displayRows.filter((r) => {
          const g = r[groupField];
          return g === null || g === undefined || String(g).trim() === '';
        })
      : displayRows,
  );

  const grouped = $derived.by<ReadonlyMap<string, Record<string, unknown>[]>>(() => {
    const map = new SvelteMap<string, Record<string, unknown>[]>();
    if (!groupField) return map;
    for (const r of displayRows) {
      const g = r[groupField];
      if (g === null || g === undefined || String(g).trim() === '') continue;
      const k = String(g);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return map;
  });

  // ─── Selection + bulk actions ────────────────────────────────────────
  const selection = useSelection();
  const selectableUids = $derived(displayRows.map((r) => String(r[uid])));
  const allSelected = $derived(
    selectableUids.length > 0 && selectableUids.every((id) => selection.isSelected(id)),
  );
  const someSelected = $derived(selection.selected_count > 0 && !allSelected);
  const selectedTaintedCount = $derived(
    [...selection.state.selected_ids].filter((id) => taintedUids.has(id)).length,
  );
  const selectedRows = $derived(
    displayRows.filter((r) => selection.isSelected(String(r[uid]))),
  );
  const selectedKeys = $derived([...selection.state.selected_ids]);
  const hasDeletedSelected = $derived(
    selectedRows.some((r) => r['deleted_at'] !== null && r['deleted_at'] !== undefined),
  );
  const allSelectedDeleted = $derived(
    selectedRows.length > 0 &&
      selectedRows.every((r) => r['deleted_at'] !== null && r['deleted_at'] !== undefined),
  );

  /** Filters↔bulk mode of the shared lower bar — same auto-switch
   *  behaviour ELT owns (selection → bulk, applied filters → filters). */
  const toolbarMode = useToolbarMode({
    selectedKeys: () => selectedKeys,
    filterValues: () => list.filterValues,
    advancedFilters: () => list.advancedFilters,
  });

  // ─── Sheets — the shared sync contract (same panels ELT owns:
  //  `entity.searchIn` via SearchBar, `entity.filters` via the funnel).
  //  filtersOpen/toggle are the derived pair — no parallel boolean. ──────
  const sheetSync = useEntitySheetSync({
    panels: {
      'entity.searchIn': () => ({
        searchInKeys: list.searchInKeys,
        searchableColumns,
        onSearchInKeysChange: list.onSearchInKeysChange,
        toggleSearchKey: list.toggleSearchKey,
      }),
      'entity.filters': () => ({
        entity,
        filterableColumns,
        filterValues: list.filterValues ?? {},
        onFilterValuesChange: list.onFilterValuesChange,
        onResetFilters: list.onResetFilters,
        advancedFilters: list.advancedFilters ?? [],
        onAdvancedFiltersChange: list.onAdvancedFiltersChange,
      }),
    },
  });

  /** Standard bulk CTAs the dict supports — export/duplicate have no dict
   *  route; delete/restore follow the entity_op gates. */
  const bulkCapabilities = $derived({
    export: false,
    htmlExport: false,
    duplicate: false,
    delete: canBulkDelete,
    restore: canRestore,
  });

  /** Tainted row titles for the footer anatomy (ConfigList's field badges,
   *  keyed on the row's human identity instead). */
  const taintedRowTitles = $derived(
    displayRows
      .filter((r) => taintedUids.has(String(r[uid])))
      .map((r) => rowTitle(r)),
  );

  function rowTitle(r: Record<string, unknown>): string {
    if (displayField) {
      const v = r[displayField];
      if (typeof v === 'string' && v) return $t(v) === v ? String(r['code'] ?? v) : $t(v);
    }
    return String(r['code'] ?? r[uid] ?? '');
  }

  // ─── Writes — standard {entity} envelopes on the entity-router ────────
  // Progressive commit: each successful write drops its pending marker
  // (draft leaves `drafts`, tainted row re-baselines) so a retry after a
  // mid-save failure re-attempts ONLY the remaining work — re-posting an
  // already-created row or re-putting on a stale version would 409.
  async function saveAll() {
    if (!canSave) return;
    saving = true;
    try {
      for (const id of taintedUids) {
        const row = list.rows.find((r) => String(r[uid]) === id);
        if (!row) continue;
        const res = await apiFetch(`${basePath}/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: extJsonStringify({
            entity: { ...values[id], version: row['version'] },
          }),
        });
        if (!res.ok) throw await res.json().catch(() => new Error(`update failed (${res.status})`));
        originals = { ...originals, [id]: $state.snapshot(values[id]) };
      }
      for (const d of drafts) {
        const res = await apiFetch(basePath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: extJsonStringify({ entity: d.values }),
        });
        if (!res.ok) throw await res.json().catch(() => new Error(`create failed (${res.status})`));
        drafts = drafts.filter((x) => x !== d);
      }
      // Pending translations → the standard translation gateway route —
      // the module is resolved PER KEY (prefix == module code: `custom.*`
      // rows land in custom.translations, never on the entity envelope).
      // Rows carrying {uuid,version} go through PUT (CAS); the rest POST.
      // Failures are requeued by the helper for this owner and reported
      // below — never silently dropped, never auto-retried.
      const failedTranslations = await flushPendingTranslations(basePath);
      originals = $state.snapshot(values);
      drafts = [];
      if (failedTranslations.length > 0) {
        pushNotification({
          impact: 'HIGH',
          messageKey: 'app.common.translations.flush_failed',
          detail: failedTranslations.map((f) => `${f.key} [${f.language}]`).join(', '),
        });
      } else {
        pushNotification({ impact: 'NONE', messageKey: 'app.common.save_success' });
      }
      await list.refreshRows();
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && 'type' in err) {
        pushNotification(err as never);
      } else {
        pushNotification({
          impact: 'HIGH',
          messageKey: 'app.common.save_failed',
          detail: err instanceof Error ? err.message : undefined,
        });
      }
    } finally {
      saving = false;
    }
  }

  async function deleteRow(r: Record<string, unknown>) {
    const id = String(r[uid]);
    const res = await stepUp.executeWithToken(
      (token) =>
        apiFetch(`${basePath}/${encodeURIComponent(id)}?version=${r['version']}`, {
          method: 'DELETE',
          headers: token ? { 'x-mfa-action-authorization': token } : {},
        }),
      { action: 'delete', target_resource: entity },
    );
    if (res.ok) {
      pushNotification({ impact: 'NONE', messageKey: 'app.common.delete_success' });
      await list.refreshRows();
    } else {
      const body = await res.json().catch(() => null);
      pushNotification(
        body && typeof body === 'object' && 'type' in body
          ? (body as never)
          : { impact: 'HIGH', messageKey: 'app.common.delete_failed' },
      );
    }
  }

  async function restoreOne(r: Record<string, unknown>): Promise<boolean> {
    const id = String(r[uid]);
    const res = await apiFetch(`${basePath}/${encodeURIComponent(id)}/restore?version=${r['version']}`, {
      method: 'POST',
    });
    return res.ok;
  }

  async function restoreRow(r: Record<string, unknown>) {
    if (await restoreOne(r)) await list.refreshRows();
  }

  /** Bulk restore = the single-row restore envelope per selected deleted
   *  row (the entity-router exposes no bulk restore), then one refresh —
   *  same progressive-commit convention as `saveAll`. */
  async function bulkRestore() {
    for (const r of selectedRows.filter(
      (r) => r['deleted_at'] !== null && r['deleted_at'] !== undefined,
    )) {
      await restoreOne(r);
    }
    selection.clearSelection();
    await list.refreshRows();
  }

  async function bulkDelete() {
    const items = selectedRows.map((r) => ({ uuid: String(r[uid]), version: r['version'] }));
    if (items.length === 0) return;
    const res = await stepUp.executeWithToken(
      (token) =>
        apiFetch(`${basePath}/bulk-delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-mfa-action-authorization': token } : {}),
          },
          body: JSON.stringify({ items }),
        }),
      { action: 'bulk_delete', target_resource: entity },
    );
    if (res.ok) {
      selection.clearSelection();
      pushNotification({ impact: 'NONE', messageKey: 'app.common.delete_success' });
      await list.refreshRows();
    } else {
      const body = await res.json().catch(() => null);
      pushNotification(
        body && typeof body === 'object' && 'type' in body
          ? (body as never)
          : { impact: 'HIGH', messageKey: 'app.common.delete_failed' },
      );
    }
  }

  // ─── Pagination — bounded: meta.table.page_size_options ───────────────
  const totalPages = $derived(Math.max(1, Math.ceil(Number(list.total) / list.pageSize)));
  const pageSizeOptions = $derived(meta?.table?.page_size_options ?? [10, 25, 50]);
  const rangeStart = $derived(
    Number(list.total) === 0 ? 0 : (list.page - 1) * list.pageSize + 1,
  );
  const rangeEnd = $derived(
    Number(list.total) === 0
      ? 0
      : Math.min(list.page * list.pageSize, Number(list.total)),
  );

  const rowProps = (r: Record<string, unknown>, idx: number) => ({
    row: r,
    uid,
    entity,
    title_text: rowTitle(r),
    translation_key: translationKey,
    entities_ns,
    pending_owner: basePath,
    display_field: displayField,
    editable_columns: updateEditableColumns,
    columns_map: columnMap,
    values: values[String(r[uid])] ?? {},
    errors: invalidRowUids.has(String(r[uid]))
      ? missingRequired(values[String(r[uid])] ?? {})
      : {},
    tainted: taintedUids.has(String(r[uid])),
    selected: selection.isSelected(String(r[uid])),
    deleted: r['deleted_at'] !== null && r['deleted_at'] !== undefined,
    can_update: canUpdate,
    can_delete: canDelete,
    can_restore: canRestore,
    orderable: orderField !== undefined,
    reorder_first: idx === 0,
    reorder_last: idx === displayRows.length - 1,
    onchange: (key: string, v: unknown) => cellChange(String(r[uid]), key, v),
    onrevert: () => revertRow(String(r[uid])),
    ontoggle: (checked: boolean) => selection.toggleSelect(String(r[uid]), checked),
    ondelete: () => void deleteRow(r),
    onrestore: () => void restoreRow(r),
    onmoveup: () => move(String(r[uid]), -1),
    onmovedown: () => move(String(r[uid]), 1),
  });
</script>

<div class="flex h-full min-h-0 flex-col" data-testid="entity-dict-page" data-entity={entity}>
  <!-- Sticky toolbar, level 1: scoped search left | CTAs right (same
       contract as ELT's EntityListToolbar — the select-all moved down to
       the shared lower bar's leading zone).
       Level 2 is the shared ELT FILTER | BULK ACTIONS bar below — it owns
       the bottom border, so this wrapper stays borderless. -->
  <div class="shrink-0 bg-background/90 backdrop-blur-sm supports-backdrop-filter:bg-background/70">
    <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <div class="min-w-0 flex-1 basis-0 sm:min-w-[200px] sm:max-w-[520px]">
          <SearchBar
            search={list.search}
            onSearchInput={list.onSearchInput}
            searchInKeys={list.searchInKeys}
            searchableColumns={searchableColumns}
            onSearchInKeysChange={list.onSearchInKeysChange}
            toggleSearchKey={list.toggleSearchKey}
            data_testid="dict-search"
          />
        </div>
      </div>

      <!-- Right cluster — the ELT divider contract: a gradient divider
           AFTER every button group (the deletion view group here), single
           CTAs (filters, refresh) flow free, divider before the primary
           New CTA. -->
      <div class="flex items-center justify-end gap-2">
        {#if hasSoftDelete}
          <DeletionFilterToggle
            deletionFilterMode={list.deletionFilterMode}
            onDeletionFilterModeChange={list.onDeletionFilterModeChange}
            test_id="dict-deletion-filter"
          />
          <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>
        {/if}
        {#if filterableColumns.length > 0}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onclick={sheetSync.toggleFiltersSheet}
            aria-label={$t('system.entities.list.filters')}
            title={$t('system.entities.list.filters')}
            data-testid="dict-filters"
          >
            <Funnel class="size-4" />
            <span class="hidden lg:inline">{$t('system.entities.list.filters')}</span>
          </Button>
        {/if}
        <RefreshButton
          onclick={() => void list.refreshRows()}
          loading={list.rowsLoading}
          testid="dict-refresh"
        />
        <div class="h-6 w-px divider-primary-gradient" aria-hidden="true"></div>
        {#if canCreate}
          <Button variant="default" size="sm" onclick={handleAddRow} data-testid="dict-toolbar-add">
            <Plus class="size-4" />
            {$t('app.common.new')}
          </Button>
        {/if}
      </div>
    </div>

    <!-- Level 2 — the shared ELT lower bar. Leading zones: select-all
         only. NO `sort` here on purpose: dict ordering is semantic — the
         `order_field` canonical order is what the chevron reorder and the
         persisted sequence mean; a user sort would corrupt that meaning
         (and confuse move semantics). Do not wire a SortBuilder onto dict
         pages — sorting belongs to ELT's card/table views only. -->
    <BulkActionsToolbar
      toolbarMode={toolbarMode.state.toolbarMode}
      hasAppliedFilters={toolbarMode.hasAppliedFilters}
      filterValues={list.filterValues}
      advancedFilters={list.advancedFilters}
      selectedKeys={selectedKeys}
      hasDeletedSelected={hasDeletedSelected}
      allSelectedDeleted={allSelectedDeleted}
      filterableColumns={filterableColumns}
      onResetFilters={list.onResetFilters}
      onFilterValuesChange={list.onFilterValuesChange}
      onAdvancedFiltersChange={list.onAdvancedFiltersChange}
      onToggleToolbarMode={toolbarMode.toggle}
      onBulkExport={() => {}}
      onHtmlExport={() => {}}
      onBulkDuplicate={() => {}}
      onBulkDelete={() => void bulkDelete()}
      onBulkRestore={() => void bulkRestore()}
      bulkCapabilities={bulkCapabilities}
      selectAll={{
        checked: allSelected,
        indeterminate: someSelected,
        onToggle: () => selection.toggleSelectAll(selectableUids, !allSelected),
        test_id: 'dict-toolbar-select-all'
      }}
    >
      {#snippet bulkExtraActions()}
        {#if selectedTaintedCount > 0}
          <Button variant="warning" size="xs" onclick={revertSelected} data-testid="dict-toolbar-bulk-revert">
            <Undo2 class="size-3.5" />
            {$t('app.common.bulk_revert')}
            <span class="ml-1 text-xs opacity-70">({selectedTaintedCount})</span>
          </Button>
        {/if}
      {/snippet}
    </BulkActionsToolbar>

    <!-- Activity strip — fixed-height track right under the toolbar so
         load start/stop never shifts the rows (dict has no table chrome
         to host ELT's in-body LoadingBar). -->
    <div class="h-0.5 w-full overflow-hidden" aria-hidden="true">
      {#if list.rowsLoading}
        <LoadingBar size="xs" />
      {/if}
    </div>
  </div>

  <!-- Rows -->
  <div class="flex-1 overflow-auto p-4">
    {#if list.rowsLoading}
      <div class="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <LoaderCircle class="size-4 animate-spin" />
        {$t('app.common.loading')}
      </div>
    {:else if list.error}
      <div class="py-8 text-center text-sm text-destructive">{list.error}</div>
    {:else}
      <div class="space-y-3">
        {#each drafts as d (d.__draft)}
          <DictDraftRow
            display_field={displayField}
            editable_columns={editableColumns}
            columns_map={columnMap}
            translation_key={translationKey}
            pending_owner={basePath}
            bind:values={d.values}
            errors={missingRequired(d.values)}
            readonly={!canCreate}
          />
        {/each}

        {#each ungrouped as r, i (String(r[uid]))}
          <DictRow {...rowProps(r, i)} />
        {/each}

        {#each [...grouped.keys()] as gk (gk)}
          <SelectableFieldset label={gk}>
            {#each grouped.get(gk) ?? [] as r (String(r[uid]))}
              <DictRow {...rowProps(r, displayRows.indexOf(r))} />
            {/each}
          </SelectableFieldset>
        {/each}

        {#if list.rows.length === 0 && drafts.length === 0}
          <div class="py-8 text-center text-sm text-muted-foreground">
            {$t('app.common.no_results')}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Pager strip — the canonical TableFooter anatomy at the BOTTOM:
       range left | shared PaginationControls right. Dict-scoped: no
       SelectionCounter (bulk CTAs live in the header toolbar), no
       keyboard legend (no bound keys). -->
  <Toolbar card={false} class="gap-3 rounded-t-none border-t text-xs">
    {#snippet left()}
      <RangeLabel start={rangeStart} end={rangeEnd} total={Number(list.total)} test_id="dict-range" />
    {/snippet}
    <PaginationControls
      page={list.page}
      totalPages={totalPages}
      pageSize={list.pageSize}
      pageSizeOptions={pageSizeOptions}
      onPageChange={list.onPageChange}
      onPageSizeChange={list.onPageSizeChange}
      test_id_prefix="dict"
    />
  </Toolbar>

  <!-- Footer: taint explanation left, atomic save right -->
  <div class="shrink-0 border-t bg-muted p-4">
    <div class="grid grid-cols-2 gap-4">
      <div class="flex flex-wrap items-center gap-2">
        {#if hasChanges}
          <span class="text-xs text-primary">
            {$t('system.settings.configurations.changes_pending_fields')}
          </span>
          {#each taintedRowTitles.slice(0, 5) as title (title)}
            <Badge variant="outline" class="border-warning/40 bg-warning/10 text-xs font-mono text-muted-foreground">
              {title}
            </Badge>
          {/each}
          {#if taintedRowTitles.length > 5}
            <Badge variant="outline" class="border-warning/40 bg-warning/10 text-xs font-mono text-muted-foreground">
              +{taintedRowTitles.length - 5}
            </Badge>
          {/if}
          {#if drafts.length > 0}
            <Badge variant="outline" class="border-primary/40 bg-primary/10 text-xs font-mono text-muted-foreground">
              +{drafts.length} {$t('app.common.new')}
            </Badge>
          {/if}
        {:else}
          <span class="text-xs text-muted-foreground/60">{$t('system.settings.configurations.no_changes')}</span>
        {/if}
      </div>
      <div class="flex items-center justify-end">
        <Button onclick={() => void saveAll()} disabled={!canSave} data-testid="dict-bulk-save">
          {saving ? $t('app.common.saving') : $t('app.common.save_changes')}
        </Button>
      </div>
    </div>
  </div>
</div>

<MfaStepUpDialog
  bind:open={stepUp.dialogOpen}
  action={stepUp.pendingAction}
  target_resource={stepUp.pendingTargetResource}
  onauthorized={stepUp.handleAuthorized}
/>

