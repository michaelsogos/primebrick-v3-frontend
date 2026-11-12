/**
 * `usePivotRow` — resolves the PIVOT's picked row for `depends_on`
 * prop-reading facets (`disabled_when.prop`, `control_prop`).
 *
 * The pivot is a `type:"ref"` column: its stored value is the target
 * row's uid, so the row resolves through the target entity's `/list`
 * with a single `filters[0][field]=<uid>` lookup — the same wire
 * contract `useEntityRefOptions.ensureSelectedLabels` already uses.
 * One fetch per pivot change per dependent field; the picked row is the
 * ONLY thing returned (options vocabulary is the dependent's own
 * delegate, not this one).
 *
 * Fail-closed posture is the caller's (`depDisabled` treats an
 * unresolved row as "can't evaluate yet → disabled"); a failed fetch
 * leaves `row` undefined.
 */
import { apiFetchWithTimeout, entityApiBase } from '$lib/api';
import { extJsonParse } from '$lib/api-ext';
import { fetchEntityMeta } from '$lib/entity-list/meta-cache';
import type { EntityMeta, ListResponse, MetaColumn } from '$lib/entity-list/types';
import type { DeepReadonly } from '@primebrick/ui';
import { SvelteURLSearchParams } from 'svelte/reactivity';

export interface PivotRowApi {
	readonly state: DeepReadonly<{
		row: Record<string, unknown> | undefined;
		loading: boolean;
	}>;
}

export function usePivotRow(
	pivotColumn: () => MetaColumn | undefined,
	pivotValue: () => unknown,
): PivotRowApi {
	const _state = $state<{ row: Record<string, unknown> | undefined; loading: boolean }>({
		row: undefined,
		loading: false,
	});

	const entity = $derived(
		pivotColumn()?.type === 'ref' ? pivotColumn()?.ref?.entity : undefined,
	);
	/** The pivot's stored-value column on its target — `ref.value_field`
	 *  overrides `meta.uid` (bigint `"id"` true-FK pickers). */
	const valueField = $derived(pivotColumn()?.ref?.value_field);
	let meta = $state<EntityMeta | null>(null);
	let seq = 0;

	async function fetchRow(value: unknown) {
		if (!entity || !meta) return;
		if (value === undefined || value === null || value === '') {
			_state.row = undefined;
			return;
		}
		const mySeq = ++seq;
		_state.loading = true;
		try {
			const qs = new SvelteURLSearchParams();
			qs.set('page', '1');
			qs.set('page_size', '1');
			qs.set('filters[0][field]', valueField ?? meta.uid);
			qs.set('filters[0][op]', '=');
			qs.set(
				'filters[0][value]',
				typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
					? String(value)
					: '',
			);
			qs.set('filters[0][connector]', 'AND');
			const res = await apiFetchWithTimeout(
				`${entityApiBase(entity)}/list?${qs.toString()}`,
				undefined,
				15_000,
			);
			if (!res.ok || mySeq !== seq) return;
			const data = extJsonParse<ListResponse<Record<string, unknown>>>(await res.text());
			_state.row = data.rows?.[0];
		} catch {
			// unresolved row — the gate fails closed upstream
		} finally {
			if (mySeq === seq) _state.loading = false;
		}
	}

	// Pivot entity appears → resolve its meta once (cached), then the row.
	$effect(() => {
		const e = entity;
		if (!e) return;
		let cancelled = false;
		void fetchEntityMeta(entityApiBase(e))
			.then((m) => {
				if (cancelled) return;
				meta = m;
				void fetchRow(pivotValue());
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	// Pivot value changes → refetch the row (empty clears it directly).
	$effect(() => {
		const v = pivotValue();
		if (!meta) return;
		void fetchRow(v);
	});

	return {
		get state() {
			return _state as DeepReadonly<typeof _state>;
		},
	};
}
