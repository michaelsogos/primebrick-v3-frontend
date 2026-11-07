<script lang="ts">
	/**
	 * EntityFormPage — the host-rendered entity form archetype. A route
	 * declared with `kind + entity + page_props.form` (and no `component_url`)
	 * resolves here: the service owns the metadata (entity meta served via
	 * `{base}/meta`, form placement via `page_props.form`), the host owns
	 * schema derivation, field dispatch, guards and submit.
	 *
	 * `kind: 'create'` → `POST {entityApiBase}` with `{ entity: {...} }`, then
	 * navigate back to the owning list route. `kind: 'detail'` (the update
	 * mode of the SAME archetype) → `GET {base}/{uuid}` prefill, `PUT
	 * {base}/{uuid}` with `{ entity: {...fields, version} }` — same
	 * `page_props.form`, same dispatchers, optimistic locking on `version`.
	 */
	import { tick, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import {
		FormField,
		FormLabel,
		FormControl,
		TranslatedFormFieldErrors,
		FormLabelWithPriorityHelp,
		Button,
		DynamicIcon,
		SwitchField,
	} from '@primebrick/ui';
	import FormPageLayout from '$lib/components/FormPageLayout.svelte';
	import ServiceUnavailableView from '$lib/components/ServiceUnavailableView.svelte';
	import { serviceCodeOf, useServiceAvailability } from '$lib/composables/use-service-availability.svelte';
	import FormFieldDispatcher from './FormFieldDispatcher.svelte';
	import { buildEntityFormSchema } from './build-entity-form-schema';
	import { fetchEntityMeta } from '$lib/entity-list/meta-cache';
	import { entityApiBase, apiFetch, type CensusRoute, type ModuleInfo } from '$lib/api';
	import { extJsonStringify, extJsonParse, apiFetchExt } from '$lib/api-ext';
	import { getTabSessionId } from '$lib/collaboration/tab-session';
	import { t } from '$lib/i18n';
	import { pushNotification } from '$lib/errors/app-errors';
	import { useFormGuard, useForceFormValidation } from '$lib/composables/useFormGuard.svelte';
	import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte';
	import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
	import { useCollaborativeForm } from '$lib/collaboration/useCollaborativeForm.svelte';
	import { useFormDraft } from '$lib/entity-form/use-form-draft.svelte';
	import { useCensusSubjectOptions } from './use-census-subject-options.svelte';
	import FieldEditingBadge from '$lib/components/collaboration/FieldEditingBadge.svelte';
	import { userProfileState } from '$lib/user-profile-store.svelte';
	import { buildAuditData } from '$lib/utils/audit-data';
	import type { MetaColumn } from '@primebrick/ui';
	import { seedPayloadMapEntries, type PayloadMap } from '@primebrick/ui';

	interface Props {
		decl: CensusRoute;
		modules: ModuleInfo[];
	}
	let { decl, modules }: Props = $props();

	const basePath = $derived(entityApiBase(decl.entity!));
	const formDecl = $derived(decl.page_props?.form);
	const isDetail = $derived(decl.kind === 'detail');
	const listHref = $derived(decl.route.replace(/\/[^/]*$/, ''));

	/** Record uuid for detail mode — the pathname segment matching the
	 *  decl's `[param]` slot (same positional rule as PageHeader). */
	const recordUuid = $derived.by((): string | null => {
		if (!isDetail) return null;
		const p = decl.route.split('/').filter(Boolean);
		const u = page.url.pathname.split('/').filter(Boolean);
		const idx = p.findIndex((s) => s.startsWith('[') && s.endsWith(']'));
		return idx >= 0 ? (u[idx] ?? null) : null;
	});

	let meta = $state<Awaited<ReturnType<typeof fetchEntityMeta>> | null>(null);
	let record = $state<Record<string, unknown> | null>(null);
	let recordVersion = $state<number | bigint>(0);
	let loadError = $state<string | null>(null);
	let loadStarted = $state(false);

	/** The service the entity fetches actually go through — `/svc/<code>/`
	 *  in basePath (BE-owned entities → null → always "available"). */
	const svcCode = $derived(serviceCodeOf(basePath));
	const svc = useServiceAvailability(() => svcCode);

	async function attemptLoad() {
		loadStarted = true;
		loadError = null;
		try {
			meta = await fetchEntityMeta(basePath);
			if (isDetail && recordUuid) {
				// extJson: integer columns (id, version) decode as bigint.
				const row = await apiFetchExt<Record<string, unknown>>(`${basePath}/${recordUuid}`);
				record = row;
				recordVersion =
					typeof row.version === 'number' || typeof row.version === 'bigint'
						? row.version
						: 0;
			}
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		}
	}

	// SSE registry gate — while the owning microservice is not online no
	// fetch is fired at all and the dedicated view renders; the next
	// register/heartbeat event (stamp change) re-arms the load. A failure
	// while "online" gets a short bounded retry — the respawn race where
	// the registry row still reads online but the listener is not yet bound.
	let attempts = 0;
	let lastStamp: string | null = null;
	$effect(() => {
		const stamp = svc.stamp;
		const avail = svc.available;
		if (stamp !== lastStamp) {
			lastStamp = stamp;
			attempts = 0;
		}
		if (!avail) return;
		if (!loadStarted) {
			void attemptLoad();
		} else if (loadError && attempts < 3) {
			attempts++;
			const t = setTimeout(() => {
				if (loadError && svc.available) void attemptLoad();
			}, 1500);
			return () => clearTimeout(t);
		}
	});

	// Census subject vocabularies — emits/callables options + raw decls,
	// derived ONCE for every options_source surface by the shared
	// composable (it also loads contributor dicts so label_key/
	// description_key resolve in the declaring module's namespace).
	const census = useCensusSubjectOptions(() => modules);

	const prepared = $derived.by(() => {
		if (!meta || !formDecl) return null;
		if (isDetail && !record) return null;
		return buildEntityFormSchema(meta, formDecl, {
			// Live resolution: the closure reads `census.callableDecls` on
			// every validation pass — the schema stays static while the
			// contract follows the selected `target_subject`.
			resolveCallable: (subject) =>
				census.callableDecls.find((c) => c.subject === subject)?.payload_schema as
					| Record<string, unknown>
					| undefined,
			resolveEmit: (subject) =>
				census.emitDecls.find((e) => e.subject === subject)?.payload_schema as
					| Record<string, unknown>
					| undefined,
		});
	});
	const columnMap = $derived(new Map((meta?.columns ?? []).map((c) => [c.key, c])));

	// superForm needs a stable schema — created once `prepared` resolves.
	// The destructured pieces are assigned synchronously in the same $effect
	// that builds formObj — definite-assignment `()` + `!` marks that invariant.
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
	 *  fallbacks; detail: the record's values (JSON cols stringified for
	 *  their string-bound controls). Extracted so the reset button can
	 *  rebuild the SAME baseline from a freshly fetched record. */
	function buildInitial(): Record<string, unknown> {
		const initial: Record<string, unknown> = {};
		for (const placement of formDecl!.fields) {
			const col = columnMap.get(placement.key);
			const isJson = col?.format === 'json' || col?.pg_type === 'jsonb' || col?.pg_type === 'json';
			if (isDetail && record) {
				const v = record[placement.key];
				// JSON controls bind a STRING — serialize record objects;
				// null → '' (schema treats '' as absent on submit).
				if (isJson) initial[placement.key] = v == null ? '' : extJsonStringify(v);
				else if (col?.type === 'boolean') initial[placement.key] = v ?? false;
				else initial[placement.key] = v ?? '';
			} else if (placement.default_value !== undefined) {
				initial[placement.key] = placement.default_value;
			} else if (col?.type === 'boolean') {
				initial[placement.key] = false;
			} else {
				initial[placement.key] = '';
			}
		}
		return initial;
	}

	$effect(() => {
		const p = prepared;
		if (!p || formObj) return;
		const initial = buildInitial();
		formObj = superForm(defaults(initial, zod4(p.schema)), {
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
					const entity: Record<string, unknown> = {};
					for (const placement of formDecl!.fields) {
						const col = columnMap.get(placement.key) as MetaColumn | undefined;
						let v = (updateForm.data as Record<string, unknown>)[placement.key];
						if (v === '' || v === undefined) {
							if (col?.nullable) entity[placement.key] = null;
							continue;
						}
						if (col?.format === 'json' || col?.pg_type === 'jsonb' || col?.pg_type === 'json') {
							v = typeof v === 'string' ? JSON.parse(v) : v;
						}
						entity[placement.key] = v;
					}
					if (isDetail) entity.version = recordVersion;
					const res = await apiFetch(isDetail ? `${basePath}/${recordUuid}` : basePath, {
						method: isDetail ? 'PUT' : 'POST',
						headers: {
							'Content-Type': 'application/json',
							// Tab session — the server stamps it on the change marker
							// (`changed_by_session`) so another tab of the same user is
							// treated as a foreign writer, not a self-save.
							'X-Client-Session': getTabSessionId(),
						},
						body: extJsonStringify({ entity }),
					});
					if (!res.ok) {
						const detail = await res.json().catch(() => null);
						// ERR01 — optimistic lock lost: another write landed first.
						// Realign + surface conflicts; the user saves again after
						// resolving (version is now current).
						if (isDetail && res.status === 409 && detail?.internal_code === 'ERR01') {
							await collab.handleVersionConflict();
							pushNotification({
								impact: 'MEDIUM',
								message: $t('app.collaboration.conflict_count', {
									count: collab.conflictCount || 1,
								}),
								scope: decl.entity!,
							});
							return;
						}
						pushNotification({
							impact: 'HIGH',
							message: detail?.error ?? $t('app.common.saveFailed'),
							scope: decl.entity!,
						});
						return;
					}
					pushNotification({
						impact: 'NONE',
						message: $t('app.common.saveSuccess'),
						scope: decl.entity!,
					});
					if (isDetail) {
						// RETURNING row is authoritative — realign the optimistic
						// lock to the new version, rebaseline, keep the page open
						// (popups still close; same-tab stays on the record).
						const updated = extJsonParse<Record<string, unknown>>(
							await res.text(),
						) as Record<string, unknown> | null;
						if (
							updated &&
							(typeof updated.version === 'number' || typeof updated.version === 'bigint')
						) {
							record = updated;
							recordVersion = updated.version;
						}
						draft.clear();
						reset({ newState: $form });
						notifyParentRefresh();
						if (window.opener) window.close();
						return;
					}
					// Rebaseline BEFORE leaving: `newState` becomes the clean
					// baseline so superforms untaints — the unsaved-changes
					// beforeNavigate guard then lets the leave through. (Plain
					// `reset({data})` PRESERVES tainted for fields in `data`.)
					draft.clear();
					reset({ newState: $form });
					notifyParentRefresh();
					if (window.opener) {
						window.close();
					} else {
						await goto(resolve(listHref as '/'));
					}
				} catch {
					pushNotification({
						impact: 'HIGH',
						message: $t('app.common.saveFailed'),
						scope: decl.entity!,
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
				message: $t('app.common.draftRestored', { count: draft.restoredCount }),
				scopeKey: 'app.common.draftRestoredTitle',
				tags: [{ label: decl.entity!, tone: 'info' }],
			});
		}
	});

	/**
	 * Declared `payload_map` automation — `x_inject`/`x_semantic` fields
	 * materialize their entries HERE, at data-assembly level, never as a
	 * widget side-effect: machine-written values are rebaselined
	 * (untainted) so they never masquerade as user edits. Runs once per
	 * (event_subject, target_subject) pair — explicit edits/deletions
	 * inside the pair stay authoritative (explicit > declaration).
	 */
	let seededFor = $state<string | null>(null);
	$effect(() => {
		if (!formObj) return;
		const pairKey = `${$form['event_subject'] as string}|${$form['target_subject'] as string}`;
		if (pairKey === seededFor) return;
		const schema = targetCallable?.payload_schema as Record<string, unknown> | undefined;
		// Decl resolves asynchronously — do NOT consume the once-per-pair
		// guard before the schema is readable, or the seed never lands.
		if (!schema?.properties) return;
		seededFor = pairKey;
		const field = 'payload_map';
		let current: PayloadMap = {};
		try {
			const parsed = JSON.parse((($form as Record<string, unknown>)[field] as string) || '{}');
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
		if (JSON.stringify(seeded) !== JSON.stringify(current)) {
			($form as Record<string, unknown>)[field] = JSON.stringify(seeded, null, 2);
			if ($tainted) ($tainted as Record<string, boolean>)[field] = false;
		}
	});

	// `job_trigger_shape` (closed-vocab validator) — live policy: with no
	// event source the `user` lane is invalid, so its badge option disables
	// and a selected "user" coerces to "me" (the schedule-only default).
	// With a source present nothing is forced — "me" stays a valid choice.
	const triggerShape = $derived(formDecl?.validators?.includes('job_trigger_shape') ?? false);
	$effect(() => {
		if (!triggerShape || !formObj) return;
		const data = $form as Record<string, unknown>;
		const hasSource = typeof data.event_subject === 'string' && data.event_subject.length > 0;
		if (!hasSource && data.execution_context === 'user') {
			// Machine coercion — `taint:'untaint'` declares it NOT a user
			// edit; the `bind:value` widget echo re-marks the flag, so the
			// clear lands once more after the binding tick settles.
			void form.update((d) => ({ ...d, execution_context: 'me' }), { taint: 'untaint' });
			void tick().then(() => {
				if ($tainted) ($tainted as Record<string, boolean>)['execution_context'] = false;
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
	const { handleBeforeUnload, handleCancel } = useUnsavedChangesGuard(
		() => formGuard.hasChanges,
		'app.common.unsavedChanges',
	);
	// Sender — a parent tab showing this entity's list (receiver mode via
	// EntityTablePage `syncChannel`) refreshes its rows after our save. The
	// channel name is fixed at mount (decl is route-scoped, never mutates).
	const { notifyParentRefresh } = useSyncChannel(
		`primebrick_${untrack(() => decl.entity)}_sync`,
		{ mode: 'sender' },
	);

	/**
	 * Collaboration — detail mode ONLY (create has nothing to compare
	 * against) AND `collaboration.enabled` on the served meta (auditable
	 * entities). The channel is registry-shared with the PageHeader
	 * avatars: one SSE connection, one session id, one tab counted.
	 */
	const collab = useCollaborativeForm({
		// decl + route params are immutable per mount (catch-all remounts on
		// pathname change) — untracked reads are correct here.
		entity: untrack(() => decl.entity!),
		uuid: untrack(() => recordUuid ?? ''),
		enabled: () => isDetail && recordUuid != null && meta?.collaboration?.enabled === true,
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
	const auditData = $derived(buildAuditData());

	/**
	 * Draft persistence — unconditional for every entity form. Scoped key:
	 * org + actor + entity + mode + record uuid → no cross-account bleed on
	 * shared browsers. Restore replays tainted-marked keys only (the
	 * anti-stale rule); the slot self-deletes when the form goes pristine.
	 */
	const draft = useFormDraft({
		storageKey: () => {
			const org = userProfileState.current?.organization ?? userProfileState.current?.idp_org;
			const actor = userProfileState.current?.uuid;
			if (!actor || !decl.entity) return null;
			return `pb:draft:${org ?? 'local'}:${actor}:${decl.entity}:${isDetail ? 'detail' : 'create'}:${recordUuid ?? 'new'}`;
		},
		ready: () => formObj !== null,
		fieldKeys: () => (formDecl?.fields ?? []).map((f) => f.key),
		baseVersion: () => recordVersion,
		data: () => (formObj ? (get(form) as Record<string, unknown>) : {}),
		tainted: () => (formObj ? ((get(tainted) as Record<string, boolean>) ?? {}) : {}),
		// Same diff-semantics the form guard uses: `isTainted($tainted)`
		// compares CURRENT values against the taint baseline — undoing an
		// edit back to its original is "clean" again (no ghost drafts).
		hasTainted: () =>
			formObj
				? (((isTainted as (p?: unknown) => boolean)(get(tainted) as unknown)) ?? false)
				: false,
		setField: (k, v) => {
			($form as Record<string, unknown>)[k] = v;
		},
		taintField: (k) => {
			if ($tainted) ($tainted as Record<string, boolean>)[k] = true;
		},
	});

	/**
	 * Reset — create: back to first-load defaults; detail: refetch the
	 * record FRESH from the service (no cached row — stale data is the
	 * whole point of the button), rebuild the baseline, untaint all, drop
	 * the draft slot. `newState` (not `data`) rebaselines so superforms
	 * untaints — same trick as the save path.
	 */
	async function handleReset() {
		if (!formObj) return;
		// Draft-sourced conflicts live in the COLLAB map — the fresh row is
		// the truth, so every one resolves use_remote before the rebuild
		// (a stale conflict would pin the field readonly + ringed).
		const draftConflictKeys = Object.keys(draft.conflicts);
		draft.clear();
		if (isDetail && recordUuid) {
			try {
				const row = await apiFetchExt<Record<string, unknown>>(`${basePath}/${recordUuid}`);
				record = row;
				recordVersion =
					typeof row.version === 'number' || typeof row.version === 'bigint' ? row.version : 0;
			} catch {
				pushNotification({
					impact: 'HIGH',
					message: $t('app.common.loadError'),
					scope: decl.entity!,
				});
				return;
			}
		}
		for (const k of draftConflictKeys) collab.resolveConflict(k, 'use_remote');
		// Re-arm the payload_map seed — machine entries re-materialize onto
		// the fresh baseline (untainted, as at first load).
		seededFor = null;
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

	/** Collaboration field chrome — conflict (destructive, readonly) wins
	 *  over silent-merge (emerald flash). Live remote-editing surfaces as a
	 *  label badge (FieldEditingBadge), not a ring. */
	function fieldCollabClass(key: string): string {
		if (collab.isConflicted(key)) return 'ring-2 ring-destructive/60 rounded-md';
		if (collab.isMergedField(key)) return 'ring-2 ring-emerald-500/60 rounded-md';
		return '';
	}
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

{#if !svc.available}
	<ServiceUnavailableView
		service={svcCode ?? decl.module}
		status={svc.status}
		onRetry={() => void attemptLoad()}
	/>
{:else if loadError}
	<div class="p-6 text-destructive">{$t('app.common.loadError')}: {loadError}</div>
{:else if !prepared || !formObj}
	<div class="p-6 text-muted-foreground">{$t('app.common.loading')}</div>
{:else}
	<FormPageLayout
		entity={decl.entity!}
		rowUuid={recordUuid ?? ''}
		{auditData}
		auditingColumns={[]}
		isCreatePage={!isDetail}
	>
		<form
				id="entity-form"
				use:enhance
				data-testid="entity-form-page"
				data-has-changes={formGuard.hasChanges}
				data-tainted={JSON.stringify($tainted ?? null)}
			>
				<div class="grid grid-cols-2 gap-6 p-4">
					{#each formDecl!.fields as placement (placement.key)}
						{@const col = columnMap.get(placement.key) as MetaColumn}
						<!-- focusin/out bubble from any inner control — they drive
						     the EDITING/READING presence signal for this field. -->
						<div
							style={fieldStyle(placement)}
							data-testid={`entity-form-field-${placement.key}`}
							class={fieldCollabClass(placement.key)}
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
										{#if col.type === 'boolean' || col.pg_type === 'boolean'}
											<!-- Boolean = SwitchField anatomy (control-first,
											     label beside) — the ONLY sanctioned labelled
											     switch. The label-above anatomy is for
											     scalar controls. -->
											<div class="space-y-2">
												<div class="flex items-center gap-2 pb-1 pt-6">
													<SwitchField
														label={$t(col.label_key)}
														tooltip={col.tooltip && col.show_form_tooltip !== false
															? $t(col.tooltip)
															: undefined}
														tooltipTitle={col.tooltip_title
															? $t(col.tooltip_title)
															: undefined}
														tooltipPriority={col.tooltip_priority}
														disabled={placement.readonly || collab.isConflicted(placement.key)}
														bind:checked={$form[placement.key] as boolean}
														{...props}
													/>
													<FieldEditingBadge
														names={collab.fieldEditorNames(placement.key)}
													/>
												</div>
												<TranslatedFormFieldErrors />
											</div>
										{:else}
										<div class="space-y-2">
											<div class="flex items-center justify-between gap-2">
												<FormLabel for={props.id}>
													{#if col.icon}
														<DynamicIcon name={col.icon} size={14} class="inline-block" />
													{/if}
													{$t(col.label_key)}
													{#if col.tooltip && col.show_form_tooltip !== false}
														<FormLabelWithPriorityHelp
															text={$t(col.tooltip)}
															title={col.tooltip_title ? $t(col.tooltip_title) : undefined}
															priority={col.tooltip_priority}
														/>
													{/if}
												</FormLabel>
												<FieldEditingBadge names={collab.fieldEditorNames(placement.key)} />
											</div>
											<FormFieldDispatcher
												column={col}
												{placement}
												emitsOptions={census.emitsOptions}
												callablesOptions={census.callablesOptions}
												{targetCallable}
												{sourceEmit}
												controlProps={props}
												disabledBadgeValues={triggerShape &&
												col.key === 'execution_context' &&
												!($form['event_subject'] as string)?.length
													? ['user']
													: undefined}
												readonly={placement.readonly || collab.isConflicted(placement.key)}
												bind:value={$form[placement.key]}
												bind:record={$form}
											/>
											<TranslatedFormFieldErrors />
										</div>
										{/if}
									{/snippet}
								</FormControl>
							</FormField>
						</div>
					{/each}
				</div>
		</form>
		{#snippet footerActions()}
			<div class="flex gap-2">
				<Button
					variant="outline"
					disabled={!formGuard.hasChanges}
					onclick={() => void handleReset()}
					data-testid="entity-form-reset"
					title={$t('app.common.reset')}
				>
					<DynamicIcon name="eraser" size={16} />
					{$t('app.common.reset')}
				</Button>
				<Button variant="outline" onclick={handleCancel}>
					{$t('app.common.cancel')}
				</Button>
				<Button
					type="submit"
					form="entity-form"
					disabled={!formGuard.canSave || submitting}
					data-testid="entity-form-submit"
				>
					{$t('app.common.save')}
				</Button>
			</div>
		{/snippet}
	</FormPageLayout>
{/if}
