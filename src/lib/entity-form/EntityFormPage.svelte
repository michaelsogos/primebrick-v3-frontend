<script lang="ts">
	/**
	 * EntityFormPage — the host-rendered entity form archetype. A route
	 * declared with `kind + entity + page_props.form` (and no `component_url`)
	 * resolves here: the service owns the metadata (entity meta served via
	 * `{base}/meta`, form placement via `page_props.form`), the host owns
	 * schema derivation, field dispatch, guards and submit.
	 *
	 * Write contract: `POST {entityApiBase}` with `{ entity: {...} }`, then
	 * navigate back to the owning list route (the route minus its last
	 * segment — `/…/create` → `/…`).
	 */
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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
	import { extJsonStringify } from '$lib/api-ext';
	import { t } from '$lib/i18n';
	import { pushNotification } from '$lib/errors/app-errors';
	import { useFormGuard } from '$lib/composables/useFormGuard.svelte';
	import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte';
	import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
	import { buildAuditData } from '$lib/utils/audit-data';
	import type { MetaColumn } from '@primebrick/ui';

	interface Props {
		decl: CensusRoute;
		modules: ModuleInfo[];
	}
	let { decl, modules }: Props = $props();

	const basePath = $derived(entityApiBase(decl.entity!));
	const formDecl = $derived(decl.page_props?.form);
	const listHref = $derived(decl.route.replace(/\/[^/]*$/, ''));

	let meta = $state<Awaited<ReturnType<typeof fetchEntityMeta>> | null>(null);
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
			if (placement.default_value !== undefined) initial[placement.key] = placement.default_value;
			else if (columnMap.get(placement.key)?.type === 'boolean') initial[placement.key] = false;
			else initial[placement.key] = '';
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
					const res = await apiFetch(basePath, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: extJsonStringify({ entity }),
					});
					if (!res.ok) {
						const detail = await res.json().catch(() => null);
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
	const auditData = $derived(buildAuditData());

	onMount(async () => {
		try {
			meta = await fetchEntityMeta(basePath);
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
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

{#if loadError}
	<div class="p-6 text-destructive">{$t('app.common.loadError')}: {loadError}</div>
{:else if !prepared || !formObj}
	<div class="p-6 text-muted-foreground">{$t('app.common.loading')}</div>
{:else}
	<FormPageLayout
		entity={decl.entity!}
		rowUuid=""
		{auditData}
		auditingColumns={[]}
		isCreatePage
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
						<div style={fieldStyle(placement)} data-testid={`entity-form-field-${placement.key}`}>
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
												readonly={placement.readonly}
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
