/**
 * useAuditActorOptions — the ONE options delegate for
 * `options_source:"audit.actors"` filter columns (`created_by` /
 * `updated_by` / `deleted_by`).
 *
 * Wire contract:
 *   GET {entityApiBase}/audit-actors → { items: [{ value, label }] }
 *
 * The endpoint serves the DISTINCT writers of the entity's own audit
 * columns — uuid actors label-resolved server-side through
 * `public.user_profiles`, fictitious actors (`system`, `migration-*`,
 * nats subjects) raw. That is the whole point of the source: the vocab
 * is "actors that wrote THIS table", which a `user_profile` entity-ref
 * combo could never offer (fictitious writers have no profile row).
 *
 * Cardinality is small and append-mostly → one fetch per entity, no
 * paging, no server search. Client-side filtering inside ComboSelect
 * is CORRECT here (unlike entity refs): the loaded set IS the complete
 * vocabulary, not a page of it.
 *
 * The vocabulary is per-ENTITY, not per-column — every instance of the
 * composable (one per audit-column control: created_by / updated_by /
 * deleted_by, possibly mounted on both tabs) shares the SAME request.
 * Without a shared cache the panel fired one GET per control instance
 * (9 parallel requests for identical data). `_cache` dedupes in-flight
 * requests and serves a short TTL so staggered mounts join too.
 *
 * Failures degrade silently to the empty list — the criterion's stored
 * values stay truthful (raw actor strings are the wire contract).
 */
import { apiFetchWithTimeout, entityApiBase } from '$lib/api';
import { extJsonParse } from '$lib/api-ext';
import type { DeepReadonly } from '@primebrick/ui';

export type AuditActorOption = {
	value: string;
	label: string;
};

/** Short freshness window: covers staggered mounts (tab switch, sheet
 *  reopen) while still refetching on the next panel open. */
const CACHE_TTL_MS = 30_000;

const _cache = new Map<string, { at: number; promise: Promise<AuditActorOption[]> }>();

function fetchActors(entity: string): Promise<AuditActorOption[]> {
	const hit = _cache.get(entity);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
	const promise = apiFetchWithTimeout(`${entityApiBase(entity)}/audit-actors`, undefined, 15_000)
		.then(async (res) => {
			if (!res.ok) return [] as AuditActorOption[];
			const data = extJsonParse<{ items?: AuditActorOption[] }>(await res.text());
			return (data.items ?? []).map((i) => ({
				value: String(i.value),
				label: String(i.label ?? i.value),
			}));
		})
		.catch(() => [] as AuditActorOption[]);
	_cache.set(entity, { at: Date.now(), promise });
	return promise;
}

export interface AuditActorOptionsApi {
	readonly state: DeepReadonly<{
		options: AuditActorOption[];
		loading: boolean;
	}>;
}

export function useAuditActorOptions(
	entity: () => string | undefined,
): AuditActorOptionsApi {
	const _state = $state({
		options: [] as AuditActorOption[],
		loading: false,
	});

	let loadedFor: string | undefined;

	$effect(() => {
		const e = entity();
		if (!e || e === loadedFor) return;
		loadedFor = e;
		let cancelled = false;
		_state.loading = true;
		fetchActors(e)
			.then((items) => {
				if (!cancelled) _state.options = items;
			})
			.finally(() => {
				if (!cancelled) _state.loading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	return {
		get state() {
			return _state as DeepReadonly<typeof _state>;
		},
	};
}
