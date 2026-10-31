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
	import { onMount, untrack } from 'svelte';
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
	} from '@primebrick/ui';
	import FormPageLayout from '$lib/components/FormPageLayout.svelte';
	import FormFieldDispatcher from './FormFieldDispatcher.svelte';
	import { buildEntityFormSchema } from './build-entity-form-schema';
	import { fetchEntityMeta } from '$lib/entity-list/meta-cache';
	import { entityApiBase, apiFetch, type CensusRoute, type ModuleInfo } from '$lib/api';
	import { extJsonStringify, extJsonParse, apiFetchExt } from '$lib/api-ext';
	import { getTabSessionId } from '$lib/collaboration/tab-session';
	import { t } from '$lib/i18n';
	import { pushNotification } from '$lib/errors/app-errors';
	import { useFormGuard } from '$lib/composables/useFormGuard.svelte';
	import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte';
	import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
	import { useCollaborativeForm } from '$lib/collaboration/useCollaborativeForm.svelte';
	import { userProfileState } from '$lib/user-profile-store.svelte';
	import { buildAuditData } from '$lib/utils/audit-data';
	import type { MetaColumn } from '@primebrick/ui';

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

	// Census emits → detailed ComboSelect options — the 3-line event anatomy:
	// translated display name (`label_key`) on the label line, italic
	// description (`description_key`) underneath, raw subject last
	// (`_sub`), all behind an amber lightning icon (the archetype-level
	// "this is an event" marker — same chrome for every emitted subject).
	const emitsOptions = $derived(
		modules
			.flatMap((m) => m.events?.emits ?? [])
			.map((e) => ({
				value: e.subject,
				label: e.label_key ? $t(e.label_key) : e.subject,
				_desc: e.description_key ? $t(e.description_key) : '',
				_sub: e.subject,
				_icon: 'zap',
				_icon_color: 'amber-500',
			})),
	);

	const prepared = $derived.by(() => {
		if (!meta || !formDecl) return null;
		if (isDetail && !record) return null;
		return buildEntityFormSchema(meta, formDecl);
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

	$effect(() => {
		const p = prepared;
		if (!p || formObj) return;
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
		formObj = superForm(defaults(initial, zod4(p.schema)), {
			SPA: true,
			validators: zod4(p.schema),
			dataType: 'json',
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
						reset({ newState: $form });
						notifyParentRefresh();
						if (window.opener) window.close();
						return;
					}
					// Rebaseline BEFORE leaving: `newState` becomes the clean
					// baseline so superforms untaints — the unsaved-changes
					// beforeNavigate guard then lets the leave through. (Plain
					// `reset({data})` PRESERVES tainted for fields in `data`.)
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
	});

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

	onMount(async () => {
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
	});

	function fieldStyle(placement: { col?: number; span?: number; row_span?: number }): string {
		const parts: string[] = [];
		if (placement.col) parts.push(`grid-column-start:${placement.col}`);
		if (placement.span) parts.push(`grid-column-end:span ${placement.span}`);
		if (placement.row_span) parts.push(`grid-row-end:span ${placement.row_span}`);
		return parts.join(';');
	}

	/** Collaboration field chrome — conflict (destructive, readonly) wins
	 *  over live-edit (amber ring) wins over silent-merge (emerald flash). */
	function fieldCollabClass(key: string): string {
		if (collab.isConflicted(key)) return 'ring-2 ring-destructive/60 rounded-md';
		if (collab.isFieldBeingEdited(key)) return 'ring-2 ring-amber-500/60 rounded-md';
		if (collab.isMergedField(key)) return 'ring-2 ring-emerald-500/60 rounded-md';
		return '';
	}
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

{#if loadError}
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
										<div class="space-y-2">
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
											<FormFieldDispatcher
												column={col}
												{placement}
												{emitsOptions}
												controlProps={props}
												readonly={placement.readonly || collab.isConflicted(placement.key)}
												bind:value={$form[placement.key]}
											/>
											<TranslatedFormFieldErrors />
										</div>
									{/snippet}
								</FormControl>
							</FormField>
						</div>
					{/each}
				</div>
		</form>
		{#snippet footerActions()}
			<div class="flex gap-2">
				<Button variant="outline" onclick={handleCancel}>
					{$t('app.common.cancel')}
				</Button>
				<Button type="submit" form="entity-form" disabled={submitting} data-testid="entity-form-submit">
					{$t('app.common.save')}
				</Button>
			</div>
		{/snippet}
	</FormPageLayout>
{/if}
