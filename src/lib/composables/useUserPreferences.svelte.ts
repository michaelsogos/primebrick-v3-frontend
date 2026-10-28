import { browser } from '$app/environment';
import { apiFetch } from '$lib/api';

/**
 * useUserPreferences — the consolidated-cache-chain store for the
 * `public.user_preferences` KV surface (`GET/PUT/DELETE
 * /api/v1/auth/me/preferences*`).
 *
 * Chain position: Redis (`@Cached` on the BE entity) → ETag/304 on the GET
 * route → this store's sessionStorage mirror — read-on-init so the UI never
 * waits on the network for a warm value, write-through on every mutation,
 * cleared on logout/login transitions alongside `userProfileStore.clear()`.
 *
 * Preference VALUES are per-key JSON contracts — the store is shape-blind;
 * typed helpers (`favorites`/`isFavorite`/`toggleFavorite`) own the
 * `favorite_pages` contract (`string[]` of FE route paths — the concrete
 * pathname, so a detail-page favorite remembers its row).
 */

const STORAGE_KEY = 'pb:user_preferences';
/** The one preference key the shell consumes today — `string[]` of routes. */
export const FAVORITE_PAGES_KEY = 'favorite_pages';

interface UserPreferencesState {
	/** The `{key: value}` preference map — last server-known or cached. */
	data: Record<string, unknown>;
	/** First successful server read completed (sessionStorage seeds before). */
	loaded: boolean;
}

function readSessionCache(): Record<string, unknown> {
	if (!browser) return {};
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		const parsed = raw ? (JSON.parse(raw) as unknown) : {};
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

const _state = $state<UserPreferencesState>({ data: readSessionCache(), loaded: false });

function writeSessionCache(): void {
	if (!browser) return;
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_state.data));
	} catch {
		// quota/serialization — the server stays authoritative; ignore.
	}
}

async function load(): Promise<void> {
	const res = await apiFetch('/api/v1/auth/me/preferences');
	if (!res.ok) return; // fail-soft — cached mirror keeps working
	const body = (await res.json()) as { preferences?: Record<string, unknown> };
	_state.data = body.preferences ?? {};
	_state.loaded = true;
	writeSessionCache();
}

async function set(key: string, value: unknown): Promise<void> {
	const res = await apiFetch(`/api/v1/auth/me/preferences/${encodeURIComponent(key)}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ value }),
	});
	if (!res.ok) return;
	_state.data = { ..._state.data, [key]: value };
	writeSessionCache();
}

async function remove(key: string): Promise<void> {
	const res = await apiFetch(`/api/v1/auth/me/preferences/${encodeURIComponent(key)}`, {
		method: 'DELETE',
	});
	if (!res.ok) return;
	const next = { ..._state.data };
	delete next[key];
	_state.data = next;
	writeSessionCache();
}

function favorites(): string[] {
	const v = _state.data[FAVORITE_PAGES_KEY];
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * The reactive preference facade — plain getters/functions (never
 * `$derived` exports, which unwrap into frozen snapshots). Reads inside a
 * consumer's `$derived`/`$effect` track `_state` normally.
 */
export const userPreferences = {
	get loaded() {
		return _state.loaded;
	},
	/** Raw `{key: value}` map — shape-blind, for consumers owning other keys. */
	get data() {
		return _state.data;
	},
	load,
	set,
	remove,
	/** `favorite_pages` contract — concrete FE route paths. */
	favorites,
	isFavorite(route: string): boolean {
		return favorites().includes(route);
	},
	async toggleFavorite(route: string): Promise<void> {
		const favs = favorites();
		const next = favs.includes(route) ? favs.filter((r) => r !== route) : [...favs, route];
		await set(FAVORITE_PAGES_KEY, next);
	},
	/** Logout/login transition — mirrors `userProfileStore.clear()`. */
	clear(): void {
		_state.data = {};
		_state.loaded = false;
		if (browser) sessionStorage.removeItem(STORAGE_KEY);
	},
};

/** Composable form for consumers preferring the `use*` call shape. */
export function useUserPreferences() {
	return userPreferences;
}
