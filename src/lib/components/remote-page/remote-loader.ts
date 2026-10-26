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
 * | `vendor`    | chunk's `vendor_requires` incompatible with host     |
 * | `import`    | bytes served but `import()` rejected (syntax, MIME)  |
 * | `contract`  | module exposes neither `mountPage` nor a default     |
 * | `mount`     | `mountPage()`/default mount threw (component-owned)  |
 */
import { mount, unmount, type Component } from 'svelte';
import {
	diffVendorRequirements,
	type HostMountHandle,
	type MountPageFn,
	type MountSheetFn,
	type RemoteDepsManifest,
	type VendorManifest,
	type VendorMismatch,
} from '@primebrick/ui';
import HostMountShell from './HostMountShell.svelte';

/** The `esm-mount` chunk shape: preferred self-mount export, default fallback. */
export type RemoteModule = {
	mountPage?: MountPageFn;
	/** Remote sheet entry — chunks declared in `nav.sheets[]` export this. */
	mountSheet?: MountSheetFn;
	default?: unknown;
	/**
	 * Named section mounts — `layout.sections` `remote:<export>` sources
	 * resolve the chunk export by this name (`mountModels`, `cell_mount`, …).
	 */
	[export_name: string]: unknown;
};

export type RemoteErrorKind =
	| 'network'
	| 'http'
	| 'integrity'
	| 'vendor'
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
	/** Host vendor manifest URL — defaults to the app.html-published path. */
	vendor_manifest_url?: string;
};

/** Where the host publishes its vendor version manifest (see `app.html`). */
export const VENDOR_MANIFEST_URL = '/vendor/vendor-manifest.json';

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
 * Predictable sibling convention — `pages/jobs-page.js` →
 * `pages/jobs-page.deps.json`. The chunk build emits it next to the chunk
 * (`vendor_requires` handshake); a missing manifest means a self-contained
 * chunk with no vendor requirements (404 is legal, not an error).
 */
export function deriveDepsManifestUrl(component_url: string): string {
	return component_url.replace(/\.m?js(\?.*)?$/, '.deps.json$1');
}

/**
 * Integrity sibling convention — `pages/jobs-page.js` →
 * `pages/jobs-page.sha256`, a build-emitted hex digest of the chunk bytes.
 * Because it is a build artifact served from the same module-assets
 * directory as the chunk, it can never disagree with a fresh rebuild the
 * way a registry-frozen declaration can: `fe:build` rewrites both files
 * together, and the next fetch sees the new hash.
 *
 * Content (sha256 hex or `sha256-<base64>`) is normalized through
 * {@link normalizeIntegrity}. A 404 means the build predates the
 * convention — legal, the load proceeds unverified.
 */
export function deriveIntegrityUrl(component_url: string): string {
	return component_url.replace(/\.m?js(\?.*)?$/, '.sha256$1');
}

/**
 * Resolve the integrity value a load should verify against.
 * An explicitly declared value always wins (registry-pinned deployments);
 * otherwise the build-emitted `<chunk>.sha256` sibling is fetched.
 * Returns `undefined` when neither exists — the load runs unverified.
 * The raw value is returned as found: validation (and its `integrity`
 * error) belongs to the load pipeline itself.
 */
export async function resolveRemoteIntegrity(
	component_url: string,
	declared: string | undefined,
	fetchFn: typeof fetch,
): Promise<string | undefined> {
	if (declared !== undefined) return declared;
	let res: Response;
	try {
		// The /svc proxy does not forward the service's Cache-Control, so the
		// request itself opts out — a rebuilt sibling must be re-read, never
		// served from browser heuristics.
		res = await fetchFn(deriveIntegrityUrl(component_url), { cache: 'no-cache' });
	} catch (e) {
		throw new RemoteLoadError('network', errorMessage(e));
	}
	if (res.status === 404) return undefined;
	if (!res.ok) {
		throw new RemoteLoadError(
			'http',
			`${deriveIntegrityUrl(component_url)} answered HTTP ${res.status}`,
			res.status,
		);
	}
	return (await res.text()).trim() || undefined;
}

function mismatchDetail(mismatches: VendorMismatch[]): string {
	return mismatches
		.map((m) =>
			m.kind === 'missing'
				? `${m.specifier}@${m.required} (not vendored by host)`
				: `${m.specifier}: requires ${m.required}, host provides ${m.provided}`,
		)
		.join('; ');
}

/**
 * Vendor handshake — verify the chunk's declared `vendor_requires` against
 * the host `vendor-manifest.json` BEFORE importing. Exact-match policy: a
 * chunk compiled against different vendor versions must be rebuilt, not
 * imported — the alternative is an opaque `import()` TypeError or, worse, a
 * split-instance runtime.
 */
async function verifyVendorDeps(
	component_url: string,
	fetchFn: typeof fetch,
	manifest_url: string,
): Promise<void> {
	let res: Response;
	try {
		res = await fetchFn(deriveDepsManifestUrl(component_url), { cache: 'no-cache' });
	} catch (e) {
		throw new RemoteLoadError('network', errorMessage(e));
	}
	if (res.status === 404) return; // self-contained chunk — nothing declared
	if (!res.ok) {
		throw new RemoteLoadError(
			'http',
			`${deriveDepsManifestUrl(component_url)} answered HTTP ${res.status}`,
			res.status,
		);
	}
	let deps_manifest: RemoteDepsManifest;
	try {
		deps_manifest = (await res.json()) as RemoteDepsManifest;
	} catch {
		throw new RemoteLoadError('vendor', 'unreadable deps manifest (invalid JSON)');
	}
	const requires = deps_manifest.vendor_requires ?? {};
	if (Object.keys(requires).length === 0) return;

	let host_res: Response;
	try {
		host_res = await fetchFn(manifest_url, { cache: 'no-cache' });
	} catch (e) {
		throw new RemoteLoadError('network', errorMessage(e));
	}
	if (!host_res.ok) {
		throw new RemoteLoadError(
			'http',
			`${manifest_url} answered HTTP ${host_res.status}`,
			host_res.status,
		);
	}
	let host_manifest: VendorManifest;
	try {
		host_manifest = (await host_res.json()) as VendorManifest;
	} catch {
		throw new RemoteLoadError('vendor', 'unreadable host vendor manifest (invalid JSON)');
	}
	const mismatches = diffVendorRequirements(requires, host_manifest);
	if (mismatches.length > 0) {
		throw new RemoteLoadError(
			'vendor',
			`vendor mismatch — rebuild the module chunk: ${mismatchDetail(mismatches)}`,
		);
	}
}

/**
 * Fetch + import a remote ESM page module.
 *
 * Pipeline order — each step can short-circuit before the next runs:
 * 1. vendor handshake: `<chunk>.deps.json` `vendor_requires` vs host manifest
 * 2. probe `fetch`: real HTTP classification (import() failures are opaque)
 * 3. integrity: sha256 verify → `blob:` import over the verified bytes
 * 4. native `import()` — bare specifiers resolve via the document import map
 *    (blob-URL imports cannot resolve relative sub-chunks — a module that
 *    wants integrity must ship a single-file chunk, e.g. `inlineDynamicImports`;
 *    without integrity relative sub-chunks resolve against the real URL).
 */
export async function loadRemoteModule(
	component_url: string,
	integrity?: string,
	deps: RemoteLoadDeps = {},
): Promise<RemoteLoadResult> {
	const fetchFn = deps.fetch_fn ?? fetch;
	const importFn =
		deps.import_fn ?? ((url: string) => import(/* @vite-ignore */ url) as Promise<unknown>);

	await verifyVendorDeps(component_url, fetchFn, deps.vendor_manifest_url ?? VENDOR_MANIFEST_URL);

	let res: Response;
	try {
		// Byte-fresh fetch — the integrity comparison below is meaningless
		// if a heuristic cache serves bytes older than the emitted hash.
		res = await fetchFn(component_url, { cache: 'no-cache' });
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
 * Load-promise cache keyed by `component_url` + RESOLVED integrity.
 * `import()` is already deduped by the browser module map, but the
 * handshake+probe work (deps manifest fetch, vendor diff, integrity hash)
 * is not — caching the whole pipeline result means a warmed chunk mounts
 * with zero async work.
 *
 * The integrity is resolved BEFORE keying (`declared ?? <chunk>.sha256`
 * sibling): the cache becomes content-addressed — a rebuilt chunk hashes
 * differently, so the very next call misses the old entry and loads fresh
 * verified bytes through the `blob:` path (which also bypasses the
 * browser's own URL-keyed module map). This is what makes the error
 * panel's retry meaningful: a redeployed chunk is actually picked up.
 *
 * Failed loads are EVICTED, never cached: a prefetch failure must not
 * poison the user's real mount — the next call retries fresh.
 */
const remoteLoadCache = new Map<string, Promise<RemoteLoadResult>>();

export async function loadRemoteModuleCached(
	component_url: string,
	integrity?: string,
	deps: RemoteLoadDeps = {},
): Promise<RemoteLoadResult> {
	const resolved = await resolveRemoteIntegrity(
		component_url,
		integrity,
		deps.fetch_fn ?? fetch,
	);
	const key = `${component_url}#${resolved ?? ''}`;
	const cached = remoteLoadCache.get(key);
	if (cached) return cached;
	const promise = loadRemoteModule(component_url, resolved, deps);
	remoteLoadCache.set(key, promise);
	promise.catch(() => remoteLoadCache.delete(key));
	return promise;
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

/** `/svc/<service>/…` → `<service>` — the owning module code for ctx.api binding. */
export function parseSvcServiceCode(component_url: string): string | undefined {
	const m = /^\/svc\/([^/]+)\//.exec(component_url);
	return m?.[1];
}

/**
 * Mount a host-compiled component as a separate Svelte root inside remote
 * DOM — the `ModulePageHost.mount_host` implementation.
 *
 * Inline `<HostComp/>` inside a separately bundled remote tree cannot work:
 * component internals (template helpers, component-context stack) live in the
 * bundle that compiled the component. This bridge roots the component via the
 * HOST's own `mount()` — verified empirically by the cross-bundle spike.
 *
 * `HostMountShell` exposes an `update()` component export, giving the remote
 * an imperative reactive channel — no rune signals cross the boundary.
 */
export function mountHostComponent(
	component: unknown,
	el: HTMLElement,
	props: Record<string, unknown>,
): HostMountHandle {
	const ref = mount(HostMountShell, {
		target: el,
		props: {
			comp: component as Component<Record<string, unknown>>,
			initial: props,
		},
	}) as { update: (patch: Record<string, unknown>) => void };
	return {
		update: (patch) => ref.update(patch),
		destroy: () => unmount(ref),
	};
}
