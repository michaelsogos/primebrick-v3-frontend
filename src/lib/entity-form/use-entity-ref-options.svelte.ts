/**
 * useEntityRefOptions — the ONE paged-options delegate for `type:"ref"`
 * filter columns: `col.ref.entity` → ComboSelect options fetched from the
 * target entity's `/list`.
 *
 * Wire contract (already native on both ends):
 *   - `GET {entityApiBase}/list?page_size=50&page=n&search=q` →
 *     `ListResponse` rows mapped to `{ value: row[uid], label:
 *     row[display_field] }` (the uid is the ref column's stored value,
 *     the display field is the human label).
 *   - `onSearchInput` — debounced server search (`defaultSearchGate`:
 *     ≥3 real chars or `\*` escape); never client-filters a partial
 *     page — a short query refetches, it doesn't lie about completeness.
 *   - `onLoadMore` — appends the next page into `options` when the
 *     popover scrolls near the bottom; `total` bounds it.
 *   - `ensureSelectedLabels(values)` — selections applied earlier (or
 *     restored from URL state) may not sit in the loaded pages; their
 *     labels resolve via one `IN` lookup so the trigger never shows
 *     raw uuids.
 *
 * Failures are silent-degraded: a ref option list that can't load
 * renders whatever is already selected — the filter value itself
 * remains truthful (uids are the stored contract).
 *
 * `filters` (optional) — extra `/list` scope conditions AND-ed into
 * every paged fetch: the `depends_on.filter_field` edge feeds them
 * (e.g. legal-form options scoped to the account's `country`). They
 * apply to the OPTIONS fetch only — `ensureSelectedLabels` deliberately
 * ignores them so a stale selection still resolves its display label.
 * A change in the serialized signature refetches from page 1.
 */
import { apiFetchWithTimeout, entityApiBase } from '$lib/api';
import { extJsonParse } from '$lib/api-ext';
import { fetchEntityMeta } from '$lib/entity-list/meta-cache';
import { defaultSearchGate } from '$lib/entity-list/search-gate';
import type {
	EntityMeta,
	FilterCondition,
	ListResponse,
	MetaColumn,
} from '$lib/entity-list/types';
import type { DeepReadonly } from '@primebrick/ui';
import { SvelteURLSearchParams } from 'svelte/reactivity';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EntityRefOption = {
	value: string;
	label: string;
	/** Raw uid — ComboSelect `display="detailed"` renders it as the
	 *  secondary line (the value IS the uid; kept for explicitness). */
	_sub: string;
};

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;

export interface EntityRefOptionsApi {
	readonly state: DeepReadonly<{
		options: EntityRefOption[];
		loading: boolean;
		loadingMore: boolean;
		total: number;
	}>;
	onSearchInput: (search: string) => void;
	onLoadMore: () => void;
	ensureSelectedLabels: (values: string[]) => void;
}

export function useEntityRefOptions(
	column: () => MetaColumn | undefined,
	filters?: () => readonly FilterCondition[] | undefined,
): EntityRefOptionsApi {
	const _state = $state({
		options: [] as EntityRefOption[],
		loading: false,
		loadingMore: false,
		total: 0,
	});

	const entity = $derived(column()?.type === 'ref' ? column()?.ref?.entity : undefined);
	/** Stored-value column on the target — `ref.value_field` overrides
	 *  `meta.uid` (bigint `"id"` for true-FK pickers). */
	const valueField = $derived(column()?.ref?.value_field);
	let meta = $state<EntityMeta | null>(null);
	const metaBasePath = $derived(entity ? entityApiBase(entity) : undefined);

	// Paging state — `search` mirrors the last committed server query so
	// onLoadMore continues the same result set.
	let page = $state(1);
	let search = $state('');
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let seq = 0;

	function mapRows(rows: Record<string, unknown>[]): EntityRefOption[] {
		if (!meta) return [];
		const uidKey = valueField ?? meta.uid;
		const labelKey = meta.display_field;
		return rows.map((row) => {
			const raw = row[uidKey];
			const value =
				typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
					? String(raw)
					: '';
			const label = row[labelKey];
			return {
				value,
				label:
					typeof label === 'string' ||
					typeof label === 'number' ||
					typeof label === 'boolean'
						? String(label)
						: value,
				_sub: value,
			};
		});
	}

	const scopeFilters = $derived(filters?.() ?? []);

	async function fetchPage(nextPage: number, q: string, append: boolean) {
		if (!entity || !metaBasePath || !meta) return;
		const mySeq = ++seq;
		if (append) _state.loadingMore = true;
		else _state.loading = true;
		try {
			const qs = new SvelteURLSearchParams();
			qs.set('page', String(nextPage));
			qs.set('page_size', String(PAGE_SIZE));
			if (q) qs.set('search', q);
			let fi = 0;
			for (const f of scopeFilters) {
				qs.set(`filters[${fi}][field]`, f.field);
				qs.set(`filters[${fi}][op]`, f.op);
				if (Array.isArray(f.value)) {
					for (const v of f.value) qs.append(`filters[${fi}][value][]`, String(v));
				} else {
					qs.set(`filters[${fi}][value]`, String(f.value));
				}
				qs.set(`filters[${fi}][connector]`, 'AND');
				fi++;
			}
			const res = await apiFetchWithTimeout(
				`${metaBasePath}/list?${qs.toString()}`,
				undefined,
				15_000,
			);
			if (!res.ok || mySeq !== seq) return;
			const data = extJsonParse<ListResponse<Record<string, unknown>>>(await res.text());
			const mapped = mapRows(data.rows ?? []);
			_state.options = append ? [..._state.options, ...mapped] : mapped;
			_state.total = Number(data.total ?? 0);
			page = nextPage;
		} catch {
			// silent degradation — the combobox keeps what it has
		} finally {
			if (mySeq === seq) {
				_state.loading = false;
				_state.loadingMore = false;
			}
		}
	}

	// Selections whose labels still need resolving — stashed until meta +
	// first page are in (ensureSelectedLabels drops silently otherwise).
	let pendingSelected: string[] = [];

	// Boot: entity appears → load its meta (cached) then the first page.
	$effect(() => {
		const e = entity;
		const base = metaBasePath;
		if (!e || !base) return;
		let cancelled = false;
		void fetchEntityMeta(base)
			.then((m) => {
				if (cancelled) return;
				meta = m;
				void fetchPage(1, search, false).then(() => {
					const pending = pendingSelected;
					pendingSelected = [];
					ensureSelectedLabels(pending);
				});
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	// Scope-filter signature change (the depends_on pivot moved) → the
	// option vocabulary is a different set: refetch from page 1 with the
	// current search still applied.
	let lastFilterSig = '';
	$effect(() => {
		const sig = JSON.stringify(scopeFilters);
		if (!meta || sig === lastFilterSig) {
			lastFilterSig = sig;
			return;
		}
		lastFilterSig = sig;
		void fetchPage(1, search, false);
	});

	function onSearchInput(q: string) {
		if (!entity || !meta) return;
		const committed = defaultSearchGate(q) ? q : '';
		if (committed === search && page === 1) return;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			search = committed;
			void fetchPage(1, committed, false);
		}, SEARCH_DEBOUNCE_MS);
	}

	function onLoadMore() {
		if (!entity || !meta || _state.loadingMore || _state.loading) return;
		if (_state.options.length >= _state.total) return;
		void fetchPage(page + 1, search, true);
	}

	/** Resolve labels for selected uids not present in the loaded pages —
	 *  one `IN` lookup so the trigger shows display names, not uuids. */
	function ensureSelectedLabels(values: string[]) {
		if (values.length === 0) return;
		if (!entity || !meta || !metaBasePath) {
			pendingSelected = values;
			return;
		}
		const missing = values.filter(
			(v) => !_state.options.some((o) => o.value === v),
		);
		const uidKey = valueField ?? meta.uid;
		// A stored value that can never match the target column's physical
		// type is unresolvable by contract (e.g. the raw actor string
		// "system" on a uuid ref) — it must not enter the IN filter: the
		// wire would 500 on a pg cast. It stays raw — the same fallback the
		// list cell already shows.
		const uidCol = meta.columns?.find((c) => c.key === uidKey);
		const shaped =
			uidCol?.pg_type === 'uuid'
				? missing.filter((v) => UUID_RE.test(v))
				: missing;
		if (shaped.length === 0) return;
		const qs = new SvelteURLSearchParams();
		qs.set('page', '1');
		qs.set('page_size', String(Math.max(shaped.length, 1)));
		qs.set('filters[0][field]', uidKey);
		qs.set('filters[0][op]', 'IN');
		for (const v of shaped) qs.append('filters[0][value][]', v);
		qs.set('filters[0][connector]', 'AND');
		const mySeq = seq;
		void apiFetchWithTimeout(`${metaBasePath}/list?${qs.toString()}`, undefined, 15_000)
			.then(async (res) => {
				if (!res.ok || mySeq !== seq) return;
				const data = extJsonParse<ListResponse<Record<string, unknown>>>(await res.text());
				const found = mapRows(data.rows ?? []);
				if (found.length === 0) return;
				// Prepend resolved selections — order-independent (ComboSelect
				// matches by value).
				_state.options = [
					...found.filter((f) => !_state.options.some((o) => o.value === f.value)),
					..._state.options,
				];
			})
			.catch(() => {});
	}

	return {
		get state() {
			return _state as DeepReadonly<typeof _state>;
		},
		onSearchInput,
		onLoadMore,
		ensureSelectedLabels,
	};
}
