<script lang="ts">
	/**
	 * EntityFormSurface — THE entity form engine, chrome-agnostic.
	 *
	 * ONE declaration (`page_props.form` or synthesized fallback) → ONE
	 * surface consumed identically by `EntityFormPage` (census
	 * `kind:"create"|"detail"` routes) and `entity.record` sheet
	 * (`meta.create.surface:"sheet"` / Modifica). The engine owns:
	 *
	 *   - `buildEntityFormSchema` (zod4, `nullable===false` → required,
	 *     closed `validators` registry — throws on decl/meta drift)
	 *   - `superForm` SPA mode: `oninput` validation, `$form/$errors/
	 *     $tainted`, `FormField`+`FormControl`+`TranslatedFormFieldErrors`
	 *     per-field chrome
	 *   - payload assembly + commit (`findActionEndpoint` → governed
	 *     action endpoints → canonical PUT/POST fallback, `version`
	 *     optimistic lock, ERR01 → collab conflict path)
	 *   - machine writes (`payload_map` seeding, `job_trigger_shape`
	 *     coercion) rebaselined untainted
	 *   - `formGuard` (hasChanges/canSave), `useFormDraft` persistence,
	 *     `useCollaborativeForm` (update only, `collaboration.enabled`),
	 *     `useSyncChannel` parent-list refresh, unsaved-changes guard
	 *     (nav + confirm-discard primitive for sheet close)
	 *   - reset: update → fresh refetch baseline; create → first-load
	 *     defaults; `draft.clear()` on confirmed discard (no stale data)
	 *   - `EntityRecordUid` identity pill first (update only)
	 *   - `@container` grid: page (wide) → declared cols; sheet (xs) →
	 *     `@max-xl` single-column collapse. SAME decl, width decides.
	 *
	 * The CHROME owns: page/sheet anatomy, heroes, audit render, pencil
	 * toggle (`editing` prop), footer CTA composition (`form={formId}`
	 * submits from outside the form element), nav-after-save (`onsaved`).
	 *
	 * Exposed to chrome via `bind:this`: `guard` (hasChanges/canSave/
	 * submitting), `formId`, `handleReset()`, `confirmDiscard()`.
	 */
	import { tick, untrack } from 'svelte';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import {
		FormField,
		FormControl,
		TranslatedFormFieldErrors,
	} from '@primebrick/ui';
	import EntityFormField from './EntityFormField.svelte';
	import EntityRecordUid from '../entity-list/sheets/EntityRecordUid.svelte';
	import { buildEntityFormSchema, synthesizeFormDecl } from './build-entity-form-schema';
	import { wireVersion } from './wire-version';
	import { entityApiBase, serviceApiPrefix, apiFetch, type ModuleInfo } from '$lib/api';
	import { serviceCodeOf } from '$lib/composables/use-service-availability.svelte';
	import { findActionEndpoint, fillActionPath } from '$lib/entity-list/action-endpoints';
	import { extJsonStringify, extJsonParse, apiFetchExt } from '$lib/api-ext';
	import { getTabSessionId } from '$lib/collaboration/tab-session';
	import { t } from '$lib/i18n';
	import { pushNotification } from '$lib/errors/app-errors';
	import { useFormGuard, useForceFormValidation } from '$lib/composables/useFormGuard.svelte';
	import { useUnsavedChangesGuard, guardConfirm } from '$lib/composables/useUnsavedChangesGuard.svelte';
	import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
	import { useCollaborativeForm } from '$lib/collaboration/useCollaborativeForm.svelte';
	import { useFormDraft } from '$lib/entity-form/use-form-draft.svelte';
	import { useCensusSubjectOptions } from './use-census-subject-options.svelte';
	import { setMetaUidContext } from '$lib/components/entity-list-table/context';
	import { userProfileState } from '$lib/user-profile-store.svelte';
	import { nextDayStartLocalIso } from './date-wire';
	import { computeInitials } from '$lib/utils/avatar-initials';
	import type { EntityMeta, MetaColumn } from '$lib/entity-list/types';
	import { i18nKeySuggestionFor } from '$lib/i18n/dict-suggestion';
	import type { FormPageDecl } from '@primebrick/ui';
	import { seedPayloadMapEntries, type PayloadMap } from '@primebrick/ui';

	import { SvelteMap } from 'svelte/reactivity';

	let {
		entity,
		service,
		mode,
		meta,
		record: recordProp,
		recordUuid,
		modules,
		formDecl: formDeclProp,
		editing = true,
		onsaved,
	}: {
		/** Entity API name. */
		entity: string;
		/** Owning service code — required for builtin/service-owned
		 *  entities (rides the `/svc/<code>` proxy). */
		service?: string;
		/** `create` → POST `create.single`; `update` → PUT `update.single`
		 *  + optimistic `version`. */
		mode: 'create' | 'update';
		/** Served entity meta — the chrome fetched it already. */
		meta: EntityMeta;
		/** The served row (update). Empty/absent on create. Re-assigning
		 *  it re-baselines the form (morph reload). */
		record?: Record<string, unknown> | null;
		/** The record uid (update) — collab channel + draft key + PUT. */
		recordUuid?: string | null;
		/** Census modules — `resolveCallable`/`resolveEmit` + subject
		 *  options vocabularies. */
		modules: ModuleInfo[];
		/** Authored `page_props.form` — absent → synthesized fallback from
		 *  `meta.columns` (writable columns only, declared order). */
		formDecl?: FormPageDecl;
		/** `false` → every field disabled (sheet readonly view; the
		 *  pencil toggle flips it). Pages pass nothing (always live). */
		editing?: boolean;
		/** Post-commit chrome hook — `(row, op)`; the chrome decides
		 *  navigate/morph/refresh. The surface already rebaselined. */
		onsaved?: (row: Record<string, unknown> | null, op: 'create' | 'update') => void;
	} = $props();

	const isCreate = $derived(mode === 'create');
	const basePath = $derived(entityApiBase(entity, service));
	const svcCode = $derived(serviceCodeOf(basePath));
	// Ref-widgets inside `EntityFormField` resolve the uid key through
	// context — set at mount: the chrome renders the surface only once
	// `meta` is present, so the key is always known at init.
	untrack(() => setMetaUidContext(meta?.uid ?? 'uuid'));

	/**
	 * The served row the form was baselined against — `recordProp` drives
	 * it (morph reload assigns a NEW object → effect below re-baselines);
	 * a successful update re-baselines on the RETURNING row internally.
	 */
	let servedRecord = $state<Record<string, unknown> | null>(untrack(() => recordProp ?? null));
	let recordVersion = $state<bigint>(
		untrack(() => wireVersion(recordProp?.version, `form baseline for '${entity}'`)),
	);

	// Prop-driven rebaseline — the sheet's create→update morph re-GETs the
	// record and re-passes it: the form rebuilds its baseline on the fresh
	// row (never a silent stale draft).
	$effect(() => {
		if (recordProp !== undefined && recordProp !== servedRecord) {
			servedRecord = recordProp;
			recordVersion = wireVersion(recordProp?.version, `form rebaseline for '${entity}'`);
			if (formObj) {
				draft.clear();
				seededFor = null;
				reset({ newState: buildInitial() });
			}
		}
	});

	/** The form declaration — authored prop, else synthesized from the
	 *  served columns (`synthesizeFormDecl`: hidden/audited/kind/managed/
	 *  uid/version never reach a form by contract). */
	const formDecl = $derived.by<FormPageDecl>(() => {
		if (formDeclProp) return formDeclProp;
		return synthesizeFormDecl(meta);
	});

	// Census subject vocabularies — emits/callables options + raw decls,
	// derived ONCE for every options_source surface.
	const census = useCensusSubjectOptions(() => modules);

	const prepared = $derived(
		buildEntityFormSchema(meta, formDecl, {
			resolveCallable: (subject) =>
				census.callableDecls.find((c) => c.subject === subject)?.payload_schema as
					| Record<string, unknown>
					| undefined,
			resolveEmit: (subject) =>
				census.emitDecls.find((e) => e.subject === subject)?.payload_schema as
					| Record<string, unknown>
					| undefined,
		}),
	);
	const columnMap = $derived(new SvelteMap((meta?.columns ?? []).map((c) => [c.key, c])));

	let formObj = $state<ReturnType<typeof superForm> | null>(null);
	type PreparedForm = NonNullable<typeof formObj>;
	let form = $state<PreparedForm['form']>()!;
	let errors = $state<PreparedForm['errors']>()!;
	let enhance = $state<PreparedForm['enhance']>()!;
	let tainted = $state<PreparedForm['tainted']>()!;
	let isTainted = $state<PreparedForm['isTainted']>()!;
	let reset = $state<PreparedForm['reset']>()!;
	let submitting = $state(false);

	const targetSubjectValue = $derived(
		formObj ? ($form['target_subject'] as string | undefined) : undefined,
	);
	const targetCallable = $derived(census.callableDecls.find((c) => c.subject === targetSubjectValue));
	const eventSubjectValue = $derived(
		formObj ? ($form['event_subject'] as string | undefined) : undefined,
	);
	const sourceEmit = $derived(census.emitDecls.find((e) => e.subject === eventSubjectValue));

	/** The form's baseline values — create: declared defaults + type
	 *  fallbacks; update: the record's values (JSON cols stringified for
	 *  their string-bound controls). Extracted so the reset button can
	 *  rebuild the SAME baseline from a freshly fetched record.
	 *  Default precedence: `placement.default_value` (per-surface) →
	 *  `column.default` (served: meta-authored or `defaultSql`-derived)
	 *  → type fallback. */
	/** `format:"i18n_key"` fields carry an ASSIGNED suggestion (convention
	 *  key tracking code/name) — it must live in the baseline, or the
	 *  dispatcher's mount-time assign reads as a user edit (born-tainted
	 *  form → false unsaved-changes confirm). Same formula the dispatcher
	 *  derives — one shared source in `dict-suggestion.ts`. */
	const i18nKeyInitial = (col: MetaColumn | undefined): string =>
		col?.format === 'i18n_key'
			? i18nKeySuggestionFor(meta.translation_key, servedRecord?.code ?? servedRecord?.name)
			: '';

	/** `MetaColumn.default` may carry a `ColumnDefaultSpec` (closed vocab —
	 *  `{kind:"next_day_start_local"}`) instead of a literal: the prefill
	 *  is computed client-side, same authored channel. Object defaults are
	 *  matched by `kind` membership ONLY — a literal jsonb object default
	 *  passes through verbatim. */
	const resolveColumnDefault = (dv: unknown): unknown =>
		typeof dv === 'object' &&
		dv !== null &&
		!Array.isArray(dv) &&
		(dv as { kind?: unknown }).kind === 'next_day_start_local'
			? nextDayStartLocalIso()
			: dv;

	function buildInitial(): Record<string, unknown> {
		const initial: Record<string, unknown> = {};
		for (const placement of formDecl.fields) {
			const col = columnMap.get(placement.key);
			const isJson = col?.format === 'json' || col?.pg_type === 'jsonb' || col?.pg_type === 'json';
			if (!isCreate && servedRecord) {
				const v = servedRecord[placement.key];
				if (isJson) initial[placement.key] = v == null ? '' : extJsonStringify(v);
				// seq-bound columns hold the DIRECTIVE slot, never the stored
				// literal — '' keeps the column omitted (untouched).
				else if (col?.format === 'sequence') initial[placement.key] = '';
				else if (col?.format === 'i18n_key') initial[placement.key] = (v as string | undefined) || i18nKeyInitial(col);
				else if (col?.type === 'boolean') initial[placement.key] = v ?? false;
				else initial[placement.key] = v ?? '';
			} else {
				const dv = placement.default_value ?? col?.default;
				if (dv !== undefined) initial[placement.key] = resolveColumnDefault(dv);
				else if (col?.type === 'boolean') initial[placement.key] = false;
				else if (col?.format === 'i18n_key') initial[placement.key] = i18nKeyInitial(col);
				else initial[placement.key] = '';
			}
		}
		return initial;
	}

	$effect(() => {
		const p = prepared;
		if (!p || formObj) return;
		const initial = buildInitial();
		formObj = superForm(defaults(initial, zod4(p.schema)), {
			// `id` MUST be explicit: without it the form inherits the zod4
			// adapter's schema-hash id — every same-entity surface then shares
			// one id and superforms' per-page registry warns "duplicate"
			// (it never prunes on unmount). The mount-unique formId keeps each
			// surface's data channel its own — stacked/remounted sheets safe.
			id: formId,
			SPA: true,
			validators: zod4(p.schema),
			validationMethod: 'oninput',
			dataType: 'json',
			onChange: forceValidate,
			async onUpdate({ form: updateForm, cancel }) {
				if (!updateForm.valid) return;
				cancel();
				submitting = true;
				try {
					const entityPayload: Record<string, unknown> = {};
					for (const placement of formDecl.fields) {
						const col = columnMap.get(placement.key) as MetaColumn | undefined;
						// `immutable` lifecycle — create-set, frozen for the record's
						// life: never crosses the update write boundary.
						if (!isCreate && col?.immutable === true) continue;
						let v = (updateForm.data as Record<string, unknown>)[placement.key];
						if (v === '' || v === undefined) {
							// seq-bound empty = untouched: the column is OMITTED —
							// never null-written (the resolver would reject a
							// non-directive write attempt).
							if (col?.format !== 'sequence' && col?.nullable) entityPayload[placement.key] = null;
							continue;
						}
						if (col?.format === 'json' || col?.pg_type === 'jsonb' || col?.pg_type === 'json') {
							v = typeof v === 'string' ? extJsonParse<unknown>(v) : v;
						}
						entityPayload[placement.key] = v;
					}
					// Avatar-initials derivation: `type:"avatar"` columns are
					// never form fields, but when their `initials_field`
					// sibling crosses the wire the derived initials ride with
					// it (the save and the preview share the one value).
					for (const col of meta?.columns ?? []) {
						const src = col.type === 'avatar' ? col.avatar?.initials_field : undefined;
						if (src && entityPayload[src] !== undefined) {
							entityPayload[col.key] = ($form as Record<string, unknown>)[col.key];
						}
					}
					if (!isCreate) entityPayload.version = recordVersion;
					// Governed endpoint resolution — `meta.actions` endpoints
					// (action paths may carry `:uuid` placeholders), canonical
					// `entities/{e}/{uuid}` as the unopinionated fallback.
					const endpoint = findActionEndpoint(
						meta.actions,
						isCreate ? 'create.single' : 'update.single',
					);
					const url = endpoint
						? serviceApiPrefix(entity, service) +
							fillActionPath(endpoint.path, servedRecord ?? {}, meta.uid ?? 'uuid')
						: isCreate
							? basePath
							: `${basePath}/${encodeURIComponent(String(recordUuid))}`;
					const res = await apiFetch(url, {
						method: endpoint?.method ?? (isCreate ? 'POST' : 'PUT'),
						headers: {
							'Content-Type': 'application/json',
							'X-Client-Session': getTabSessionId(),
						},
						body: extJsonStringify({ entity: entityPayload }),
					});
					if (!res.ok) {
						const detail = await res.text().then((t) => extJsonParse<{ internal_code?: string; error?: string }>(t)).catch(() => null);
						// ERR01 — optimistic lock lost: another write landed first.
						if (!isCreate && res.status === 409 && detail?.internal_code === 'ERR01') {
							await collab.handleVersionConflict();
							pushNotification({
								impact: 'MEDIUM',
								message: $t('app.collaboration.conflict_count', {
									count: collab.conflictCount || 1,
								}),
								scope: entity,
							});
							return;
						}
						pushNotification({
							impact: 'HIGH',
							message: detail?.error ?? $t('app.common.save_failed'),
							scope: entity,
						});
						return;
					}
					pushNotification({
						impact: 'NONE',
						message: $t('app.common.save_success'),
						scope: entity,
					});
					const body = await res.text().then((t) => extJsonParse<Record<string, unknown>>(t)).catch(() => null);
					if (!isCreate) {
						// RETURNING row is authoritative — realign the optimistic
						// lock to the new version, rebaseline, stay open.
						const updated = (body?.entity ?? body) as Record<string, unknown> | null;
						if (updated) {
							servedRecord = updated;
							recordVersion = wireVersion(updated.version, `save response for '${entity}'`);
						}
						draft.clear();
						reset({ newState: $form });
						notifyParentRefresh();
						onsaved?.(updated, 'update');
						return;
					}
					// Create — rebaseline so the form goes pristine, then the
					// chrome decides (page: back; sheet: morph to update).
					const created = (body?.entity ?? body) as Record<string, unknown> | null;
					draft.clear();
					reset({ newState: $form });
					notifyParentRefresh();
					onsaved?.(created, 'create');
				} catch {
					pushNotification({
						impact: 'HIGH',
						message: $t('app.common.save_failed'),
						scope: entity,
					});
				} finally {
					submitting = false;
				}
			},
		});
		({ form, errors, enhance, tainted, isTainted, reset } = formObj);
		// Draft replay — tainted keys onto the fresh baseline; a stale base
		// turns them into collab conflicts instead of silent overwrites.
		draft.restore();
		collab.addConflicts(draft.conflicts);
		if (draft.restoredCount > 0) {
			pushNotification({
				impact: 'NONE',
				toastImpact: 'LOW',
				message: $t('app.common.draft_restored', { count: draft.restoredCount }),
				scopeKey: 'app.common.draft_restored_title',
				tags: [{ label: entity, tone: 'info' }],
			});
		}
	});

	/**
	 * Declared `payload_map` automation — `x_inject`/`x_semantic` fields
	 * materialize their entries at data-assembly level (untainted).
	 */
	let seededFor = $state<string | null>(null);
	$effect(() => {
		if (!formObj) return;
		const pairKey = `${$form['event_subject'] as string}|${$form['target_subject'] as string}`;
		if (pairKey === seededFor) return;
		const schema = targetCallable?.payload_schema as Record<string, unknown> | undefined;
		if (!schema?.properties) return;
		seededFor = pairKey;
		const field = 'payload_map';
		let current: PayloadMap = {};
		try {
			const parsed = extJsonParse<unknown>((($form as Record<string, unknown>)[field] as string) || '{}');
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) current = parsed as PayloadMap;
		} catch {
			// unparseable authored JSON — the seeds merge onto an empty base
		}
		const seeded = seedPayloadMapEntries(
			schema,
			sourceEmit?.payload_schema as Record<string, unknown> | undefined,
			sourceEmit?.entity,
			current,
		);
		if (extJsonStringify(seeded) !== extJsonStringify(current)) {
			($form as Record<string, unknown>)[field] = extJsonStringify(seeded, 2);
			if ($tainted) ($tainted as Record<string, boolean>)[field] = false;
		}
	});

	/** Avatar-initials live derivation — `avatar.initials_field` siblings
	 *  derive the avatar seed while editing: the preview (MetaAvatar reads
	 *  `$form`) and the payload share the one derived value. */
	$effect(() => {
		if (!formObj || !editing) return;
		for (const col of meta?.columns ?? []) {
			const src = col.type === 'avatar' ? col.avatar?.initials_field : undefined;
			if (src) {
				($form as Record<string, unknown>)[col.key] = computeInitials(
					($form as Record<string, unknown>)[src] as string | undefined | null,
				);
			}
		}
	});

	// `job_trigger_shape` (closed-vocab validator) — live policy: with no
	const triggerShape = $derived(formDecl?.validators?.includes('job_trigger_shape') ?? false);
	$effect(() => {
		if (!triggerShape || !formObj) return;
		const data = $form as Record<string, unknown>;
		const hasSource = typeof data.event_subject === 'string' && data.event_subject.length > 0;
		if (!hasSource && data.run_as === 'originator') {
			void form.update((d) => ({ ...d, run_as: 'author' }), { taint: 'untaint' });
			void tick().then(() => {
				if ($tainted) ($tainted as Record<string, boolean>)['run_as'] = false;
			});
		}
	});

	const forceValidate = useForceFormValidation((opts) => formObj!.validateForm(opts));
	const formGuard = useFormGuard(
		() => $tainted,
		() => ($errors as Record<string, unknown>) ?? {},
		((path?: unknown) => (isTainted as ((p?: unknown) => boolean) | undefined)?.(path) ?? false) as (
			path?: unknown,
		) => boolean,
	);

	// Unsaved-changes guard — the SAME composable the form pages wire:
	// nav guard + beforeunload + the shared confirm channel. `editing`
	// gates it (a readonly sheet has nothing to lose). A confirmed leave
	// clears the draft slot — stale data never survives a discard.
	const { handleBeforeUnload } = useUnsavedChangesGuard(
		() => editing && formGuard.hasChanges,
		'app.common.unsaved_changes',
		() => draft.clear(),
	);

	// Sender — a parent surface showing this entity's list (receiver mode
	// via EntityTablePage `syncChannel`) refreshes its rows after our save.
	const { notifyParentRefresh } = useSyncChannel(`primebrick_${untrack(() => entity)}_sync`, {
		mode: 'sender',
	});

	/**
	 * Collaboration — update mode ONLY (create has nothing to compare
	 * against) AND `collaboration.enabled` on the served meta. The channel
	 * is registry-shared: one SSE connection, one session id, one tab —
	 * a page and a sheet on the same record share it.
	 */
	const collab = useCollaborativeForm({
		entity: untrack(() => entity),
		uuid: untrack(() => recordUuid ?? ''),
		service: untrack(() => service),
		enabled: () => mode === 'update' && recordUuid != null && meta?.collaboration?.enabled === true,
		actorUuid: () => userProfileState.current?.uuid,
		getField: (k) => ($form as Record<string, unknown>)[k],
		setField: (k, v) => {
			($form as Record<string, unknown>)[k] = v;
		},
		untaint: (k) => {
			if ($tainted) ($tainted as Record<string, boolean>)[k] = false;
		},
		isTainted: (k) =>
			formObj ? ((isTainted as (p?: unknown) => boolean)(k) ?? false) : false,
		columnOf: (k) => columnMap.get(k) as MetaColumn | undefined,
		getRecordVersion: () => recordVersion,
		setRecordVersion: (v) => {
			recordVersion = v;
		},
	});

	/**
	 * Draft persistence — scoped key org+actor+entity+mode+uuid. Page and
	 * sheet on the same record share the slot (the draft belongs to the
	 * record, not the container).
	 */
	const draft = useFormDraft({
		storageKey: () => {
			const org = userProfileState.current?.organization ?? userProfileState.current?.idp_org;
			const actor = userProfileState.current?.uuid;
			if (!actor) return null;
			return `pb:draft:${org ?? 'local'}:${actor}:${entity}:${isCreate ? 'create' : 'detail'}:${recordUuid ?? 'new'}`;
		},
		ready: () => formObj !== null,
		fieldKeys: () => formDecl.fields.map((f) => f.key),
		baseVersion: () => recordVersion,
		data: () => (formObj ? ($form as Record<string, unknown>) : {}),
		tainted: () => (formObj ? (($tainted as Record<string, boolean>) ?? {}) : {}),
		hasTainted: () =>
			formObj
				? (((isTainted as (p?: unknown) => boolean)($tainted as unknown)) ?? false)
				: false,
		setField: (k, v) => {
			($form as Record<string, unknown>)[k] = v;
		},
		taintField: (k) => {
			if ($tainted) ($tainted as Record<string, boolean>)[k] = true;
		},
	});

	/**
	 * Reset — create: back to first-load defaults; update: refetch the
	 * record FRESH from the service (stale data is the whole point), rebuild
	 * the baseline, untaint all, drop the draft slot.
	 */
	export async function handleReset() {
		if (!formObj) return;
		const draftConflictKeys = Object.keys(draft.conflicts);
		draft.clear();
		if (!isCreate && recordUuid) {
			try {
				const row = await apiFetchExt<Record<string, unknown>>(
					`${basePath}/${encodeURIComponent(String(recordUuid))}`,
				);
				servedRecord = row;
				recordVersion = wireVersion(row.version, `fresh fetch for '${entity}'`);
			} catch {
				pushNotification({
					impact: 'HIGH',
					message: $t('app.common.load_error'),
					scope: entity,
				});
				return;
			}
		}
		for (const k of draftConflictKeys) collab.resolveConflict(k, 'use_remote');
		seededFor = null;
		reset({ newState: buildInitial() });
	}

	/**
	 * The discard primitive — the sheet close-guard calls it before any
	 * close. Confirmed → draft slot cleared + baseline reset (a stale
	 * draft never restores an abandoned edit). Declined → false, the
	 * close vetoes.
	 */
	export async function confirmDiscard(): Promise<boolean> {
		if (!formObj || !editing || !formGuard.hasChanges) return true;
		// Native synchronous lock — the answer lands before control returns.
		if (!guardConfirm('app.common.unsaved_changes')) return false;
		draft.clear();
		reset({ newState: buildInitial() });
		return true;
	}

	/** Silent discard — the pencil-off toggle's semantics: pending edits
	 *  drop back to the current baseline, no confirm (the toggle IS the
	 *  explicit intent). */
	export function discardEdits(): void {
		if (!formObj) return;
		draft.clear();
		reset({ newState: buildInitial() });
	}

	function fieldStyle(placement: { col?: number; span?: number; row?: number; row_span?: number }): string {
		const parts: string[] = [];
		if (placement.col) parts.push(`grid-column-start:${placement.col}`);
		if (placement.span) parts.push(`grid-column-end:span ${placement.span}`);
		if (placement.row) parts.push(`grid-row-start:${placement.row}`);
		if (placement.row_span) parts.push(`grid-row-end:span ${placement.row_span}`);
		return parts.join(';');
	}

	function fieldCollabClass(key: string): string {
		if (collab.isConflicted(key)) return 'ring-2 ring-destructive/60 rounded-md';
		if (collab.isMergedField(key)) return 'ring-2 ring-emerald-500/60 rounded-md';
		return '';
	}

	// ── Chrome-facing exports ─────────────────────────────────────────
	/** Unique form element id per mount — footer submits via
	 *  `form={formId}` from outside the form; sheet stacking stays safe. */
	const formIdSuffix = Math.random().toString(36).slice(2, 10);
	export const formId = `entity-form-${formIdSuffix}`;

	export const guard = {
		get hasChanges() {
			return formGuard.hasChanges;
		},
		get canSave() {
			return formGuard.canSave;
		},
		get submitting() {
			return submitting;
		},
	};

	const uidValue = $derived(servedRecord?.[meta?.uid ?? 'uuid']);
	const formTwoCol = $derived(formDecl.fields.some((p) => (p.col ?? 1) > 1));
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<div class="@container flex h-full flex-col gap-4" data-testid="entity-form-surface">
	{#if mode === 'update' && uidValue !== undefined && uidValue !== null}
		<!-- Identity pill — the same `EntityRecordUid` the sheet hero states
		     carry: ONE declaration, both surfaces. -->
		<EntityRecordUid {meta} value={uidValue} {entity} />
	{/if}

	{#if formObj}
		<form
			id={formId}
			use:enhance
			class="contents"
			data-has-changes={formGuard.hasChanges}
			data-tainted={extJsonStringify($tainted ?? null)}
		>
			<!-- `@container` grid — the SAME decl drives both surfaces; the
			     container width decides the columns (page wide → declared
			     cols; sheet xs → single column via the @max-xl resets). -->
			<div class="grid gap-4 {formTwoCol ? '@xl:grid-cols-2' : 'grid-cols-1'}">
				{#each formDecl.fields as placement (placement.key)}
					{@const col = columnMap.get(placement.key) as MetaColumn}
					{#if col && !col.hidden}
						<div
							style={fieldStyle(placement)}
							class="space-y-2 @max-xl:col-start-auto! @max-xl:col-end-auto! @max-xl:row-start-auto! @max-xl:row-end-auto! {fieldCollabClass(placement.key)}"
							data-testid={`entity-form-field-${placement.key}`}
							onfocusin={() =>
								collab.channel?.sendEditing(
									placement.key,
									($form as Record<string, unknown>)[placement.key],
								)}
							onfocusout={() => collab.channel?.sendReading()}
						>
							<FormField form={formObj!} name={placement.key}>
								<FormControl>
									{#snippet children({ props })}
										<div class="space-y-2">
											<EntityFormField
												column={col}
												{placement}
												columns={columnMap}
												controlProps={props}
												inForm
												editingNames={collab.fieldEditorNames(placement.key)}
												emitsOptions={census.emitsOptions}
												callablesOptions={census.callablesOptions}
												{targetCallable}
												{sourceEmit}
												disabledBadgeValues={triggerShape &&
												col.key === 'run_as' &&
												!($form['event_subject'] as string)?.length
													? ['originator']
													: undefined}
												readonly={collab.isConflicted(placement.key)}
												disabled={!editing}
												{mode}
												served_record={servedRecord ?? undefined}
												service={svcCode ?? service}
												translation_key={meta.translation_key}
												pending_owner={basePath}
												bind:value={$form[placement.key]}
												bind:record={$form}
											/>
											<TranslatedFormFieldErrors />
										</div>
									{/snippet}
								</FormControl>
							</FormField>
						</div>
					{/if}
				{/each}
			</div>
		</form>
	{/if}
</div>
