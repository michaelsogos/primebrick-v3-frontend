/**
 * Remote page chunk loading — fetch/import/integrity for `esm-mount` modules.
 *
 * Pure async helpers (no svelte component state) so the pipeline is fully
 * unit-testable: `RemotePageMount` orchestrates, this file executes.
 *
 * Error model: `RemoteLoadError.kind` classifies every failure the loader can
 * produce — the component maps kinds to localized in-content error panels
 * (the app shell is never torn down).
 *
 * | kind        | meaning                                              |
 * |-------------|------------------------------------------------------|
 * | `network`   | fetch threw — service unreachable/offline            |
 * | `http`      | fetch answered non-2xx — 404/400/5xx on the asset    |
 * | `integrity` | declared sha256 did not match the fetched bytes      |
 * | `import`    | bytes served but `import()` rejected (syntax, MIME)  |
 * | `contract`  | module exposes neither `mountPage` nor a default     |
 * | `mount`     | `mountPage()`/default mount threw (component-owned)  |
 */
import { unmount } from 'svelte';
import type { MountPageFn } from '@primebrick/ui';

/** The `esm-mount` chunk shape: preferred self-mount export, default fallback. */
export type RemoteModule = {
	mountPage?: MountPageFn;
	default?: unknown;
};

export type RemoteErrorKind =
	| 'network'
	| 'http'
	| 'integrity'
	| 'import'
	| 'contract'
	| 'mount';

export class RemoteLoadError extends Error {
	override readonly name = 'RemoteLoadError';
	readonly kind: RemoteErrorKind;
	readonly status?: number;

	constructor(kind: RemoteErrorKind, message: string, status?: number) {
		super(message);
		this.kind = kind;
		this.status = status;
	}
}

export type RemoteLoadResult = {
	mod: RemoteModule;
	/**
	 * Releases the verified-bytes object URL (integrity path only). Call AFTER
	 * the module is imported — revoking early would unload the chunk.
	 */
	dispose_source?: () => void;
};

export type RemoteLoadDeps = {
	fetch_fn?: typeof fetch;
	import_fn?: (url: string) => Promise<unknown>;
};

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** sha256 of `buf` as lowercase hex (Web Crypto — works in browser + Node 24). */
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', buf);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalize a declared integrity value to the hex form produced by
 * {@link sha256Hex}. Accepts `sha256-<base64>` (SRI form) or bare 64-char hex.
 * Returns null on malformed input.
 */
export function normalizeIntegrity(integrity: string): string | null {
	const v = integrity.trim();
	if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase();
	if (v.startsWith('sha256-')) {
		try {
			const bin = atob(v.slice(7));
			return [...bin].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * Fetch + import a remote ESM page module.
 *
 * The probe `fetch` always runs first — `import()` failures are opaque
 * TypeErrors and cannot distinguish 404 from offline; the fetch status gives
 * real HTTP classification.
 *
 * - `integrity` declared → the fetched bytes are hashed and verified; the
 *   import then happens from a `blob:` URL over the *verified* bytes.
 *   NOTE: blob-URL imports cannot resolve relative sub-chunks — a module that
 *   wants integrity must ship a single-file chunk (e.g. `inlineDynamicImports`).
 * - no `integrity` → native `import(component_url)` so relative dynamic
 *   sub-chunks resolve against the real module URL.
 */
export async function loadRemoteModule(
	component_url: string,
	integrity?: string,
	deps: RemoteLoadDeps = {},
): Promise<RemoteLoadResult> {
	const fetchFn = deps.fetch_fn ?? fetch;
	const importFn =
		deps.import_fn ?? ((url: string) => import(/* @vite-ignore */ url) as Promise<unknown>);

	let res: Response;
	try {
		res = await fetchFn(component_url);
	} catch (e) {
		throw new RemoteLoadError('network', errorMessage(e));
	}
	if (!res.ok) {
		throw new RemoteLoadError('http', `${component_url} answered HTTP ${res.status}`, res.status);
	}

	if (integrity) {
		const expected = normalizeIntegrity(integrity);
		if (!expected) {
			throw new RemoteLoadError('integrity', `malformed integrity value: ${integrity}`);
		}
		const bytes = await res.arrayBuffer();
		const actual = await sha256Hex(bytes);
		if (actual !== expected) {
			throw new RemoteLoadError(
				'integrity',
				`sha256 mismatch (declared ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…)`,
			);
		}
		const object_url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
		try {
			const mod = (await importFn(object_url)) as RemoteModule;
			return { mod, dispose_source: () => URL.revokeObjectURL(object_url) };
		} catch (e) {
			URL.revokeObjectURL(object_url);
			throw new RemoteLoadError('import', errorMessage(e));
		}
	}

	// Non-integrity path: release the probe body (import() re-fetches — browser
	// HTTP cache makes the second hit cheap) and let the native loader resolve
	// relative sub-chunks against the real URL.
	void res.body?.cancel().catch(() => undefined);
	try {
		const mod = (await importFn(component_url)) as RemoteModule;
		return { mod };
	} catch (e) {
		throw new RemoteLoadError('import', errorMessage(e));
	}
}

/**
 * Which mount path the module supports — `mountPage` is the contract; a
 * default component export is the documented fallback. Null = incompatible.
 */
export function resolveMountable(mod: RemoteModule): 'mountPage' | 'default' | null {
	if (typeof mod.mountPage === 'function') return 'mountPage';
	if (mod.default != null) return 'default';
	return null;
}

/**
 * Dispose whatever `mountPage`/`mount()` returned: a custom dispose function,
 * or the `mount()` instance (disposed via `unmount`). Undefined is a no-op.
 */
export async function disposeMounted(result: unknown): Promise<void> {
	if (typeof result === 'function') {
		await (result as () => void | Promise<void>)();
	} else if (result != null && typeof result === 'object') {
		// Contract says mount() result — but a module returning some other
		// object must not break host teardown.
		try {
			await unmount(result as Parameters<typeof unmount>[0]);
		} catch {
			// not a mount instance — nothing to dispose
		}
	}
}

/**
 * Predictable CSS convention — `pages/jobs-page.js` → `pages/jobs-page.css`.
 * The remote build keeps stylesheet and chunk side by side; when a module
 * deviates it passes an explicit `css_url` instead.
 */
export function deriveStylesheetUrl(component_url: string): string {
	return component_url.replace(/\.m?js(\?.*)?$/, '.css$1');
}

/**
 * Inject the remote stylesheet as early as possible — CSS and JS travel in
 * parallel so the page never paints unstyled. Deduped by href; a missing
 * stylesheet is non-fatal (module may be styleless).
 */
export function ensureStylesheet(css_url: string): HTMLLinkElement {
	const doc = document;
	const existing = doc.querySelector<HTMLLinkElement>(`link[href="${css_url}"]`);
	if (existing) return existing;
	const link = doc.createElement('link');
	link.rel = 'stylesheet';
	link.href = css_url;
	link.dataset.remotePage = 'true';
	doc.head.appendChild(link);
	return link;
}

/** `/ws/<service>/…` → `<service>` — the owning module code for ctx.api binding. */
export function parseWsServiceCode(component_url: string): string | undefined {
	const m = /^\/ws\/([^/]+)\//.exec(component_url);
	return m?.[1];
}
