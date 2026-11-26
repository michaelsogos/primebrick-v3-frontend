<script lang="ts">
	/**
	 * EntityFormPage — the host-rendered entity form archetype. A route
	 * declared with `kind + entity + page_props.form` (and no `component_url`)
	 * resolves here: the service owns the metadata (entity meta served via
	 * `{base}/meta`, form placement via `page_props.form`), the host owns
	 * chrome: record load, service-availability gate, audit footer,
	 * footer CTAs.
	 *
	 * The form ENGINE is `EntityFormSurface` — schema + superform +
	 * dispatcher + guards + collab + draft + commit — the same surface
	 * `entity.record` mounts. ONE declaration, two chromes.
	 *
	 * `kind: 'create'` → the surface POSTs `create.single`, `onsaved`
	 * navigates back to the owning list route. `kind: 'detail'` (the
	 * update mode of the SAME archetype) → GET prefill, PUT
	 * `update.single` with optimistic `version`.
	 */

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		Button,
		DynamicIcon,
	} from '@primebrick/ui';
	import FormPageLayout from '$lib/components/FormPageLayout.svelte';
	import ServiceUnavailableView from '$lib/components/ServiceUnavailableView.svelte';
	import { serviceCodeOf, useServiceAvailability } from '$lib/composables/use-service-availability.svelte';
	import EntityFormSurface from './EntityFormSurface.svelte';
	import { fetchEntityMeta } from '$lib/entity-list/meta-cache';
	import { entityApiBase, type CensusRoute, type ModuleInfo } from '$lib/api';
	import { apiFetchExt } from '$lib/api-ext';
	import { t } from '$lib/i18n';
	import { buildAuditData } from '$lib/utils/audit-data';
	import type { EntityMeta } from '$lib/entity-list/types';

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

	let meta = $state<EntityMeta | null>(null);
	let record = $state<Record<string, unknown> | null>(null);
	let loadError = $state<string | null>(null);
	let loadStarted = $state(false);
	let surface = $state<EntityFormSurface | null>(null);

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
				record = await apiFetchExt<Record<string, unknown>>(`${basePath}/${recordUuid}`);
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

	const auditData = $derived(buildAuditData());

	/** Post-commit chrome decisions — the surface already rebaselined,
	 *  notified the parent list and cleared the draft slot. */
	function onsaved(row: Record<string, unknown> | null, op: 'create' | 'update') {
		if (window.opener) {
			window.close();
			return;
		}
		if (op === 'create') void goto(resolve(listHref as '/'));
	}

	/** Cancel — the surface's discard primitive (confirm → draft.clear +
	 *  baseline reset), then back/close. */
	async function handleCancel() {
		const ok = (await surface?.confirmDiscard()) ?? true;
		if (!ok) return;
		if (window.opener) {
			window.close();
		} else {
			history.back();
		}
	}
</script>

{#if !svc.available}
	<ServiceUnavailableView
		service={svcCode ?? decl.module}
		onRetry={() => void attemptLoad()}
	/>
{:else if loadError}
	<div class="p-6 text-destructive">{$t('app.common.load_error')}: {loadError}</div>
{:else if !meta || (isDetail && !record)}
	<div class="p-6 text-muted-foreground">{$t('app.common.loading')}</div>
{:else}
	<FormPageLayout
		entity={decl.entity!}
		rowUuid={recordUuid ?? ''}
		{auditData}
		auditingColumns={[]}
		isCreatePage={!isDetail}
	>
		<EntityFormSurface
			bind:this={surface}
			entity={decl.entity!}
			service={svcCode ?? undefined}
			mode={isDetail ? 'update' : 'create'}
			{meta}
			{record}
			{recordUuid}
			{modules}
			{formDecl}
			{onsaved}
		/>
		{#snippet footerActions()}
			<div class="flex gap-2">
				<Button
					variant="outline"
					disabled={!surface?.guard.hasChanges}
					onclick={() => void surface?.handleReset()}
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
					form={surface?.formId}
					disabled={!surface?.guard.canSave || surface?.guard.submitting}
					data-testid="entity-form-submit"
				>
					{$t(isDetail ? 'app.common.save' : 'app.common.create')}
				</Button>
			</div>
		{/snippet}
	</FormPageLayout>
{/if}
