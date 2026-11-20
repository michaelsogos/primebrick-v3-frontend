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
  import { onMount, untrack } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { t } from '$lib/i18n';
  import { apiFetch, entityApiBase } from '$lib/api';
  import { useEntityList } from '$lib/composables/useEntityList.svelte';
  import { useSelection, Button, Badge, Toolbar, RefreshButton, DynamicIcon } from '@primebrick/ui';
  import { SelectableFieldset, DeletionFilterToggle } from '@primebrick/ui';
  import { LoadingBar } from '$lib/components/ui/loading-bar';
  import { SearchBar, BulkActionsToolbar, PaginationControls, RangeLabel, useToolbarMode } from '$lib/components/entity-list-table';
  import { isColumnFilterable, searchableTextColumns, useEntitySheetSync } from '$lib/entity-list';
  import { Plus, Undo2, LoaderCircle, Funnel } from '@primebrick/ui/vendor/lucide';
  import { type MetaColumn, type EntityMeta } from '$lib/entity-list/types';
  import { entitiesNs } from '$lib/utils/entity-meta';
  import { isEntityOpAllowed } from '$lib/permissions.svelte';
  import { extJsonParse, extJsonStringify } from '$lib/api-ext';
  import FormFieldDispatcher from '$lib/entity-form/FormFieldDispatcher.svelte';
  import DictDraftRow from './DictDraftRow.svelte';
  import { pushNotification } from '$lib/errors/app-errors';
  import { clearPendingTranslations, dropPendingTranslation, getPendingTranslations, addPendingTranslation } from '$lib/i18n/pending-translations.svelte';
  import { flushPendingTranslations } from '$lib/i18n/flush-pending-translations';
  import { useDictDraft } from './use-dict-draft.svelte';
  import { userProfileState } from '$lib/user-profile-store.svelte';
  import { runEntityOp } from '$lib/entity-list/use-entity-op.svelte';
  import DictRow from './DictRow.svelte';
  import { isSnakeKey } from '@primebrick/ui';
  import { suggestedKeyFor } from './dict-suggestion';
  import type { CensusRoute } from '$lib/api';

  let { decl }: { decl: CensusRoute } = $props();

  // decl is stable within a mount — the caller {#key pathname} remounts
  // the page per route change; untrack marks the intentional one-time read.
  const entity = untrack(() => decl.entity ?? '');
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
      const parsed = raw ? (extJsonParse(raw) as unknown) : null;
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
      sessionStorage.setItem(skSelectedKeys, extJsonStringify([...selection.state.selected_ids]));
    } catch {
      // ignore quota / blocked storage
    }
  });

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

  /** Extras — update-editable columns outside the inline anatomy: the
   *  `entity.dictExtras` sheet's field set (value column stays inline;
   *  `order_field` is seeded + reorder-managed, never hand-edited). */
  const extrasColumns = $derived(
    updateEditableColumns.filter(
      (c) => c.key !== displayField && c.key !== 'label_key' && c.key !== orderField,
    ),
  );

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

  // ─── Drafts (composer) + pendings — the create-flow state machine ────
  // NEW → ONE composer (`drafts`, ≤1 — single-composer gate) → ✓ confirm
  // pushes a `pending[]` row (client-only, renders as a DictRow appended
  // after the saved stream) → bulk save POSTs every pending → real rows.
  type Draft = { __draft: string; values: Record<string, unknown> };
  let drafts = $state<Draft[]>([]);
  let pendings = $state<Draft[]>([]);
  let draftSeq = 0;

  /** Composer-rendered fields — `code` + the value column (display_field
   *  or label_key). The ✓ gate is scoped to THESE fields only (D1):
   *  extras the composer cannot render gate the SAVE, not confirm. */
  const composerKeys = $derived(
    new Set(
      [displayField, 'code', 'label_key'].filter((k): k is string => typeof k === 'string'),
    ),
  );

  /** Meta-derived cell validation (task 5): required (nullable===false),
   *  `max_length`/`min_length`, authored `pattern`, and the dict `code`
   *  charset (`isSnakeKey` — the seeded vocabulary is lowercase snake).
   *  `suggestion_eligible` names the columns whose empty value commits a
   *  convention suggestion at write — `label_key`/display_field on create;
   *  never on update (saved rows keep the hard-required gate). */
  function columnErrors(
    v: Record<string, unknown>,
    cols: MetaColumn[],
    suggestion_eligible?: ReadonlySet<string>,
  ): Record<string, string[]> {
    const errs: Record<string, string[]> = {};
    for (const c of cols) {
      const raw = v[c.key];
      const s = raw === null || raw === undefined ? '' : String(raw).trim();
      if (!s) {
        if (c.nullable === false && !suggestion_eligible?.has(c.key)) {
          errs[c.key] = [$t('app.common.errors.required')];
        }
        continue;
      }
      if (c.max_length !== undefined && s.length > c.max_length) {
        (errs[c.key] ??= []).push($t('app.common.validation.max_chars', { count: c.max_length }));
      }
      if (c.min_length !== undefined && s.length < c.min_length) {
        (errs[c.key] ??= []).push($t('app.common.validation.min_chars', { count: c.min_length }));
      }
      if (c.pattern && !new RegExp(c.pattern).test(s)) {
        (errs[c.key] ??= []).push($t('app.common.validation.regex_mismatch'));
      }
      if (c.key === 'code' && !isSnakeKey(s)) {
        (errs[c.key] ??= []).push($t('app.common.validation.snake_key'));
      }
    }
    return errs;
  }

  /** Composer errors — scoped to the fields the composer actually renders
   *  (D1); `label_key` is suggestion-eligible (empty → convention commit
   *  at save), `code` additionally carries the debounced unique probe. */
  function composerErrors(d: Draft): Record<string, string[]> {
    const errs = columnErrors(
      d.values,
      editableColumns.filter((c) => composerKeys.has(c.key)),
      new Set([displayField ?? 'label_key']),
    );
    if (codeProbe.exists) (errs['code'] ??= []).push($t('system.entities.dict.code_exists'));
    return errs;
  }

  function composerValid(d: Draft): boolean {
    return Object.keys(composerErrors(d)).length === 0 && !codeProbe.checking;
  }

  /** Code uniqueness probe (task 6) — debounced `/list` equality filter
   *  on the composer code; `exists` feeds the inline error, `checking`
   *  gates confirm (config-create `handleKeyInput` precedent, filters
   *  bracket-notation on the canonical wire format). */
  let codeProbe = $state({ checking: false, exists: false });
  let codeProbeTimer: ReturnType<typeof setTimeout> | null = null;
  const composerCode = $derived(String(drafts[0]?.values['code'] ?? '').trim());
  $effect(() => {
    const code = composerCode;
    if (codeProbeTimer) clearTimeout(codeProbeTimer);
    codeProbe.checking = false;
    codeProbe.exists = false;
    if (!code || !isSnakeKey(code)) return;
    codeProbe.checking = true;
    codeProbeTimer = setTimeout(() => {
      void (async () => {
        try {
          const qs = new URLSearchParams();
          qs.set('filters[0][field]', 'code');
          qs.set('filters[0][op]', '=');
          qs.set('filters[0][value]', code);
          qs.set('page_size', '1');
          const res = await apiFetch(`${basePath}/list?${qs}`);
          if (res.ok) {
            const data = (await res.text().then((t) => extJsonParse(t))) as { rows?: unknown[] };
            // Still the live composer value — a stale probe never sticks.
            if (String(drafts[0]?.values['code'] ?? '').trim() === code) {
              codeProbe.exists = (data.rows?.length ?? 0) > 0;
            }
          }
        } catch {
          // probe failure never blocks — the server unique constraint
          // still catches a duplicate at save (409 surfaces as error).
        } finally {
          codeProbe.checking = false;
        }
      })();
    }, 500);
  });

  /** Translations queued for a dying row's `*_key` values must die with
   *  it — otherwise they flush at the next save onto orphan keys (G3). */
  function dropQueuedTranslations(v: Record<string, unknown>) {
    for (const [k, val] of Object.entries(v)) {
      if (k.endsWith('_key') && typeof val === 'string' && val) {
        dropPendingTranslation(basePath, val);
      }
    }
  }

  function handleAddRow() {
    if (drafts.length > 0) return; // single-composer gate — one at a time
    const values: Record<string, unknown> = {};
    for (const c of editableColumns) values[c.key] = c.nullable === true ? null : '';
    if (orderField) {
      const maxSort = Math.max(
        0,
        ...list.rows.map((r) => Number(r[orderField] ?? 0)),
        ...pendings.map((d) => Number(d.values[orderField] ?? 0)),
      );
      // Seed convention is a ×10 step (10/20/30…) so later reorders have
      // integer room between neighbours — pendings continue the convention.
      values[orderField] = maxSort + 10;
    }
    drafts = [...drafts, { __draft: `d${++draftSeq}`, values }];
  }

  /** ✓ confirm — composer → pending[] (client move, zero server). */
  function handleConfirmDraft(d: Draft) {
    if (!composerValid(d)) return;
    pendings = [...pendings, d];
    drafts = drafts.filter((x) => x !== d);
  }

  /** ✕ discard — the composer dies; its queued translations die with it. */
  function handleDiscardDraft(d: Draft) {
    dropQueuedTranslations(d.values);
    drafts = drafts.filter((x) => x !== d);
  }

  /** Pending drop — "morte definitiva" (never persisted, zero server):
   *  drop the row, its selection entry and queued translations. */
  function handleDropPending(d: Draft) {
    dropQueuedTranslations(d.values);
    pendings = pendings.filter((x) => x !== d);
    if (selection.isSelected(d.__draft)) selection.toggleSelect(d.__draft, false);
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
      baselined = true;
    }
  });

  const taintedUids = $derived.by<ReadonlySet<string>>(() => {
    const tainted = new SvelteSet<string>();
    for (const r of list.rows) {
      const id = String(r[uid]);
      const curr = values[id];
      const orig = originals[id];
      if (!curr || !orig) continue;
      for (const c of updateEditableColumns) {
        if (String(curr[c.key] ?? '') !== String(orig[c.key] ?? '')) {
          tainted.add(id);
          break;
        }
      }
    }
    return tainted;
  });

  const hasChanges = $derived(taintedUids.size > 0 || pendings.length > 0);
  let saving = $state(false);

  /** Required-empty errors for one values map — same shape as the row
   *  `errors` prop so the failing cell carries the reason inline, never
   *  a silent save gate. */
  /** Pending save-gate — full meta validation over the create-editable
   *  set; `label_key` stays suggestion-eligible (empty commits the
   *  convention suggestion in `saveAll`, same promise the cell makes). */
  function pendingValid(d: Draft): boolean {
    return (
      Object.keys(
        columnErrors(d.values, editableColumns, new Set([displayField ?? 'label_key'])),
      ).length === 0
    );
  }

  /** Tainted rows whose required columns went empty or invalid — updates
   *  carry NO suggestion eligibility: empty label_key on a saved row is
   *  a real error. */
  const invalidRowUids = $derived.by<ReadonlySet<string>>(() => {
    const invalid = new SvelteSet<string>();
    for (const id of taintedUids) {
      if (Object.keys(columnErrors(values[id] ?? {}, updateEditableColumns)).length > 0) {
        invalid.add(id);
      }
    }
    return invalid;
  });

  const canSave = $derived(
    hasChanges && !saving && pendings.every(pendingValid) && invalidRowUids.size === 0,
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

  // ─── Draft persistence — refresh-surviving working state. Same
  //     useFormDraft contract (scoped key, debounced write, self-delete
  //     on pristine, replay tainted-keys-only) on the dict's three legs:
  //     taints + pendings + open composer. The translation queue rides
  //     along so restored label_keys never flush orphan keys. ──────────
  let baselined = $state(false);
  let draftRestored = $state(false);

  const taintMap = $derived.by<Record<string, Record<string, unknown>>>(() => {
    const m: Record<string, Record<string, unknown>> = {};
    for (const id of taintedUids) {
      const curr = values[id];
      const orig = originals[id];
      if (!curr || !orig) continue;
      const d: Record<string, unknown> = {};
      for (const c of updateEditableColumns) {
        if (String(curr[c.key] ?? '') !== String(orig[c.key] ?? '')) d[c.key] = curr[c.key];
      }
      if (Object.keys(d).length > 0) m[id] = d;
    }
    return m;
  });

  /** Composer worth persisting — any authored value (the seeded skeleton
   *  of nulls/empties is not work). */
  const composerHasContent = $derived(
    drafts.some((d) => Object.values(d.values).some((v) => v !== null && String(v ?? '') !== '')),
  );

  const dictDraft = useDictDraft({
    storageKey: () => {
      const org = userProfileState.current?.organization ?? userProfileState.current?.idp_org;
      const actor = userProfileState.current?.uuid;
      if (!actor || !entity) return null;
      return `pb:dict-draft:${org ?? 'local'}:${actor}:${entity}`;
    },
    // Writes gate until restore has RUN — a mount-time pristine read
    // must never delete the slot before it is read.
    ready: () => baselined && draftRestored,
    taints: () => taintMap,
    rowVersions: () => {
      const m: Record<string, number> = {};
      for (const id of Object.keys(taintMap)) {
        const r = list.rows.find((row) => String(row[uid]) === id);
        if (r) m[id] = Number(r['version'] ?? 0);
      }
      return m;
    },
    pendings: () => pendings.map((p) => ({ id: p.__draft, values: $state.snapshot(p.values) })),
    composer: () => {
      const d = drafts[0];
      return d && composerHasContent ? { values: $state.snapshot(d.values) } : null;
    },
    draftSeq: () => draftSeq,
    translations: () => {
      const m = getPendingTranslations(basePath);
      return m ? $state.snapshot(m) : undefined;
    },
    dirty: () => taintedUids.size > 0 || pendings.length > 0 || composerHasContent,
    restoreTaints: (tainted, _versions) => {
      const next = { ...values };
      let applied = 0;
      for (const [id, fields] of Object.entries(tainted)) {
        const curr = next[id];
        if (!curr || !originals[id]) continue; // row gone — anti-stale drop
        next[id] = { ...curr, ...fields };
        applied += Object.keys(fields).length;
      }
      values = next;
      return applied;
    },
    restorePendings: (rows, seq) => {
      draftSeq = Math.max(draftSeq, seq);
      pendings = [...pendings, ...rows.map((r) => ({ __draft: r.id, values: r.values }))];
    },
    restoreComposer: (c) => {
      if (drafts.length > 0) return; // single-composer gate
      drafts = [{ __draft: `d${++draftSeq}`, values: c.values }];
    },
    restoreTranslation: (key, langs) => addPendingTranslation(basePath, key, langs),
  });

  /** One-shot replay — after the rows baseline exists AND the actor has
   *  resolved (the storage key needs it); the composable's `restored`
   *  flag keeps it single-fire. */
  $effect(() => {
    if (!baselined || draftRestored || !userProfileState.current?.uuid) return;
    const n = dictDraft.restore();
    draftRestored = true;
    if (n > 0) {
      pushNotification({
        impact: 'NONE',
        toastImpact: 'LOW',
        message: $t('app.common.draft_restored', { count: n }),
        scopeKey: 'app.common.draft_restored_title',
        tags: [{ label: entity, tone: 'info' }],
      });
    }
  });

  /** RESET — the FormPageLayout footer contract: discard ALL unsaved work
   *  (tainted rows re-baseline, pendings + composer die with their queued
   *  translations, the draft slot clears) and the page returns pristine. */
  function handleReset() {
    values = $state.snapshot(originals);
    for (const p of [...pendings]) handleDropPending(p);
    for (const d of [...drafts]) handleDiscardDraft(d);
    clearPendingTranslations(basePath);
    dictDraft.clear();
  }

  // ─── Reorder — swap order_field values on adjacent rows, mark tainted ──
  const displayRows = $derived(
    orderField
      ? [...list.rows].sort(
          (a, b) => Number(a[orderField] ?? 0) - Number(b[orderField] ?? 0),
        )
      : list.rows,
  );

  /** The full reorder chain — saved rows (sorted) THEN pendings (append
   *  order, D2). Swaps cross the saved/pending boundary: saved endpoints
   *  write `values[uid]` (taint), pending endpoints write `d.values`
   *  directly, so the rendered order equals the post-save order. */
  const renderChain = $derived([
    ...displayRows.map((r) => String(r[uid])),
    ...pendings.map((p) => p.__draft),
  ]);

  function orderValueOf(chainId: string): unknown {
    const p = pendings.find((x) => x.__draft === chainId);
    if (p) return p.values[orderField!];
    const row = list.rows.find((r) => String(r[uid]) === chainId);
    return values[chainId]?.[orderField!] ?? row?.[orderField!];
  }

  function setOrderValue(chainId: string, v: unknown) {
    const p = pendings.find((x) => x.__draft === chainId);
    if (p) {
      p.values[orderField!] = v;
      return;
    }
    cellChange(chainId, orderField!, v);
  }

  function move(id: string, dir: -1 | 1) {
    if (!orderField) return;
    const idx = renderChain.indexOf(id);
    const other = renderChain[idx + dir];
    if (idx < 0 || other === undefined) return;
    const aSort = orderValueOf(id);
    const bSort = orderValueOf(other);
    setOrderValue(id, bSort);
    setOrderValue(other, aSort);
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
  /** Selectable ids — saved rows + pendings (select-all parity, D3). */
  const selectableUids = $derived(renderChain);
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
        // Update envelope = the update-mode editable set only — `immutable`
        // columns (create-set, e.g. `code`) never ride a PUT payload
        // (entity-metadata.mdx contract); the update schema .strict()-rejects
        // them server-side.
        const entityBody: Record<string, unknown> = { version: row['version'] };
        for (const c of updateEditableColumns) entityBody[c.key] = values[id]?.[c.key];
        const res = await apiFetch(`${basePath}/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: extJsonStringify({ entity: entityBody }),
        });
        if (!res.ok) throw await res.text().then((t) => extJsonParse<any>(t)).catch(() => new Error(`update failed (${res.status})`));
        originals = { ...originals, [id]: $state.snapshot(values[id]) };
      }
      for (const d of pendings) {
        // Empty label_key commits the convention suggestion — the
        // "(optional)" chip's promise (task 7, config-create parity).
        if (displayField && !String(d.values[displayField] ?? '').trim()) {
          const suggested = suggestedKeyFor(translationKey, d.values['code']);
          if (suggested) d.values[displayField] = suggested;
        }
        const res = await apiFetch(basePath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: extJsonStringify({ entity: d.values }),
        });
        if (!res.ok) throw await res.text().then((t) => extJsonParse<any>(t)).catch(() => new Error(`create failed (${res.status})`));
        pendings = pendings.filter((x) => x !== d);
      }
      // Pending translations → the standard translation gateway route —
      // the module is resolved PER KEY (prefix == module code: `custom.*`
      // rows land in custom.translations, never on the entity envelope).
      // Rows carrying {uuid,version} go through PUT (CAS); the rest POST.
      // Failures are requeued by the helper for this owner and reported
      // below — never silently dropped, never auto-retried.
      const failedTranslations = await flushPendingTranslations(basePath);
      originals = $state.snapshot(values);
      pendings = [];
      dictDraft.clear();
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

  /** Delete/restore ride the governed invoker — `runEntityOp` owns the
   *  mandatory confirm gate (the incident path), endpoint resolution,
   *  MFA step-up and RFC7807 surfacing. The page only declares intent. */
  async function deleteRow(r: Record<string, unknown>) {
    await runEntityOp({
      op: 'delete.single',
      entity,
      meta,
      row: r,
      onDone: () => list.refreshRows(),
    });
  }

  async function restoreRow(r: Record<string, unknown>) {
    await runEntityOp({
      op: 'restore.single',
      entity,
      meta,
      row: r,
      onDone: () => list.refreshRows(),
    });
  }

  /** Bulk restore = the invoker's per-row `restore.single` envelope (the
   *  entity-router exposes no bulk restore), confirmed once for the
   *  selection — same progressive-commit convention as `saveAll`. */
  async function bulkRestore() {
    const ok = await runEntityOp({
      op: 'restore.bulk',
      entity,
      meta,
      rows: selectedRows.filter(
        (r) => r['deleted_at'] !== null && r['deleted_at'] !== undefined,
      ),
      onDone: () => {
        selection.clearSelection();
        void list.refreshRows();
      },
    });
    void ok;
  }

  /** Bulk delete partitions the selection (D3): saved rows ride the
   *  governed `delete.bulk` path (confirm + soft-delete); selected
   *  pendings drop locally on confirm — "morte definitiva", they were
   *  never persisted (zero server work). A pending-only selection drops
   *  immediately — no request exists to confirm. */
  async function bulkDelete() {
    const pendingIds = new Set(
      [...selection.state.selected_ids].filter((id) =>
        pendings.some((p) => p.__draft === id),
      ),
    );
    if (selectedRows.length === 0 && pendingIds.size === 0) return;
    if (selectedRows.length > 0) {
      const ok = await runEntityOp({
        op: 'delete.bulk',
        entity,
        meta,
        rows: selectedRows,
        onDone: () => {
          selection.clearSelection();
          void list.refreshRows();
        },
      });
      if (!ok) return;
    }
    for (const p of pendings.filter((x) => pendingIds.has(x.__draft))) {
      handleDropPending(p);
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

  const rowProps = (r: Record<string, unknown>) => ({
    row: r,
    uid,
    entity,
    title_text: rowTitle(r),
    translation_key: translationKey,
    entities_ns,
    pending_owner: basePath,
    display_field: displayField,
    editable_columns: updateEditableColumns,
    extras_columns: extrasColumns,
    columns_map: columnMap,
    values: values[String(r[uid])] ?? {},
    errors: invalidRowUids.has(String(r[uid]))
      ? columnErrors(values[String(r[uid])] ?? {}, updateEditableColumns)
      : {},
    tainted: taintedUids.has(String(r[uid])),
    selected: selection.isSelected(String(r[uid])),
    deleted: r['deleted_at'] !== null && r['deleted_at'] !== undefined,
    can_update: canUpdate,
    can_delete: canDelete,
    can_restore: canRestore,
    orderable: orderField !== undefined,
    reorder_first: renderChain[0] === String(r[uid]),
    reorder_last: renderChain[renderChain.length - 1] === String(r[uid]),
    onchange: (key: string, v: unknown) => cellChange(String(r[uid]), key, v),
    onrevert: () => revertRow(String(r[uid])),
    ontoggle: (checked: boolean) => selection.toggleSelect(String(r[uid]), checked),
    ondelete: () => void deleteRow(r),
    onrestore: () => void restoreRow(r),
    onmoveup: () => move(String(r[uid]), -1),
    onmovedown: () => move(String(r[uid]), 1),
  });

  /** Pending rows — a confirmed-not-yet-saved `Draft` rendered through
   *  DictRow with the `pending` variant (D2 appended after the saved
   *  stream, D3 shared selection, D4 info accent). The row record is
   *  synthesized from `d.values` + the client `__draft` id under `uid`
   *  (`"d1"` never collides with a real uuid); no version/audit fields →
   *  L3 stays empty by construction. */
  const pendingProps = (p: Draft) => ({
    row: { ...p.values, [uid]: p.__draft },
    uid,
    entity,
    title_text: rowTitle({ ...p.values, [uid]: p.__draft }),
    translation_key: translationKey,
    entities_ns,
    pending_owner: basePath,
    display_field: displayField,
    editable_columns: updateEditableColumns,
    extras_columns: extrasColumns,
    columns_map: columnMap,
    values: p.values,
    errors: columnErrors(p.values, editableColumns, new Set([displayField ?? 'label_key'])),
    pending: true as const,
    selected: selection.isSelected(p.__draft),
    can_update: canUpdate,
    can_delete: false,
    can_restore: false,
    orderable: orderField !== undefined,
    reorder_first: renderChain[0] === p.__draft,
    reorder_last: renderChain[renderChain.length - 1] === p.__draft,
    onchange: (key: string, v: unknown) => {
      p.values[key] = v;
    },
    ontoggle: (checked: boolean) => selection.toggleSelect(p.__draft, checked),
    onpendingdelete: () => handleDropPending(p),
    onmoveup: () => move(p.__draft, -1),
    onmovedown: () => move(p.__draft, 1),
  });
</script>

<div class="flex h-full min-h-0 flex-col" data-testid="entity-dict-page" data-entity={entity}>
  <!-- Sticky toolbar, level 1: scoped search left | CTAs right (same
       contract as ELT's EntityListToolbar — the select-all moved down to
       the shared lower bar's leading zone).
       Level 2 is the shared ELT FILTER | BULK ACTIONS bar below — it owns
       the bottom border, so this wrapper stays borderless. -->
  <div class="shrink-0">
    <!-- Level 1 — the canonical `Toolbar card={false}` strip (task-19
         locked contract: muted/30 like every toolbar strip). Same ELT
         composition: left=search | CTA children | refresh | primary. -->
    <Toolbar card={false} class="rounded-none">
      {#snippet left()}
        <div class="min-w-0 flex-1 basis-0 sm:min-w-[260px] sm:max-w-[520px]">
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
      {/snippet}
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
        <Button
          variant="default"
          size="sm"
          disabled={drafts.length > 0}
          title={drafts.length > 0 ? $t('system.entities.dict.composer_open') : $t('app.common.new')}
          onclick={handleAddRow}
          data-testid="dict-toolbar-add"
        >
          <Plus class="size-4" />
          {$t('app.common.new')}
        </Button>
      {/if}
    </Toolbar>

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
            errors={composerErrors(d)}
            readonly={!canCreate}
            confirm_disabled={!composerValid(d)}
            onconfirm={() => handleConfirmDraft(d)}
            ondiscard={() => handleDiscardDraft(d)}
          />
        {/each}

        {#each ungrouped as r (String(r[uid]))}
          <DictRow {...rowProps(r)} />
        {/each}

        {#each [...grouped.keys()] as gk (gk)}
          <SelectableFieldset label={gk}>
            {#each grouped.get(gk) ?? [] as r (String(r[uid]))}
              <DictRow {...rowProps(r)} />
            {/each}
          </SelectableFieldset>
        {/each}

        <!-- Pendings — appended after the saved stream in insertion order
             (D2 todo-list semantics): the rendered order equals the
             post-save order, so the pending→saved transition is nearly
             invisible. -->
        {#each pendings as p (p.__draft)}
          <DictRow {...pendingProps(p)} />
        {/each}

        {#if list.rows.length === 0 && drafts.length === 0 && pendings.length === 0}
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

  <!-- Footer: taint explanation left, atomic save right — the form-page
       action-bar tone (bg-muted/50, FormPageLayout contract: dict is the
       list+form hybrid — strips are list-muted/30, save footer is
       form-muted/50). -->
  <div class="shrink-0 border-t bg-muted/50 p-4">
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
          {#if pendings.length > 0}
            <Badge variant="outline" class="border-primary/40 bg-primary/10 text-xs font-mono text-muted-foreground">
              +{pendings.length} {$t('app.common.new')}
            </Badge>
          {/if}
        {:else}
          <span class="text-xs text-muted-foreground/60">{$t('system.settings.configurations.no_changes')}</span>
        {/if}
      </div>
      <div class="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          disabled={(!hasChanges && drafts.length === 0) || saving}
          onclick={handleReset}
          title={$t('app.common.reset')}
          data-testid="dict-reset"
        >
          <DynamicIcon name="eraser" size={16} />
          {$t('app.common.reset')}
        </Button>
        <Button onclick={() => void saveAll()} disabled={!canSave} data-testid="dict-bulk-save">
          {saving ? $t('app.common.saving') : $t('app.common.save_changes')}
        </Button>
      </div>
    </div>
  </div>
</div>

