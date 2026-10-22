import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
	RemoteLoadError,
	deriveDepsManifestUrl,
	deriveStylesheetUrl,
	disposeMounted,
	ensureStylesheet,
	loadRemoteModule,
	normalizeIntegrity,
	parseWsServiceCode,
	resolveMountable,
	sha256Hex,
} from '../components/remote-page/remote-loader';
import { webcrypto } from 'node:crypto';

beforeAll(() => {
	// jsdom may not expose webcrypto.subtle / blob URLs — stub what the
	// integrity path needs (Node's own crypto is fine).
	if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto);
	URL.createObjectURL ??= () => 'blob:mock-object-url';
	URL.revokeObjectURL ??= () => undefined;
});

describe('normalizeIntegrity', () => {
	it('accepts bare lowercase hex', () => {
		const hex = 'a'.repeat(64);
		expect(normalizeIntegrity(hex)).toBe(hex);
	});
	it('normalizes uppercase hex', () => {
		expect(normalizeIntegrity('A'.repeat(64))).toBe('a'.repeat(64));
	});
	it('decodes sha256-<base64> SRI form', () => {
		// base64 of 32 bytes 0x00..0x1f
		const bytes = Array.from({ length: 32 }, (_, i) => i);
		const b64 = btoa(String.fromCharCode(...bytes));
		const expected = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
		expect(normalizeIntegrity(`sha256-${b64}`)).toBe(expected);
	});
	it('rejects malformed input', () => {
		expect(normalizeIntegrity('not-a-hash')).toBeNull();
		expect(normalizeIntegrity('sha256-%%%')).toBeNull();
	});
});

describe('deriveStylesheetUrl / parseWsServiceCode', () => {
	it('derives css from js chunk url', () => {
		expect(deriveStylesheetUrl('/ws/job/api/v1/module-assets/pages/jobs-page.js')).toBe(
			'/ws/job/api/v1/module-assets/pages/jobs-page.css',
		);
	});
	it('derives css preserving query string', () => {
		expect(deriveStylesheetUrl('/p/x.mjs?v=3')).toBe('/p/x.css?v=3');
	});
	it('parses service code from /ws prefix', () => {
		expect(parseWsServiceCode('/ws/job/api/v1/module-assets/pages/jobs-page.js')).toBe('job');
	});
	it('returns undefined outside /ws', () => {
		expect(parseWsServiceCode('/api/v1/module-assets/x.js')).toBeUndefined();
	});
});

describe('deriveDepsManifestUrl', () => {
	it('derives deps manifest from js chunk url', () => {
		expect(deriveDepsManifestUrl('/ws/job/api/v1/module-assets/pages/jobs-page.js')).toBe(
			'/ws/job/api/v1/module-assets/pages/jobs-page.deps.json',
		);
	});
	it('handles .mjs and preserves query string', () => {
		expect(deriveDepsManifestUrl('/p/x.mjs?v=3')).toBe('/p/x.deps.json?v=3');
	});
});

describe('sha256Hex', () => {
	it('matches the known empty-string vector', async () => {
		const buf = new TextEncoder().encode('').buffer as ArrayBuffer;
		expect(await sha256Hex(buf)).toBe(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
		);
	});
});

describe('ensureStylesheet', () => {
	it('injects a deduped stylesheet link', () => {
		const url = '/ws/job/api/v1/module-assets/pages/jobs-page.css';
		const a = ensureStylesheet(url);
		const b = ensureStylesheet(url);
		expect(b).toBe(a);
		expect(document.head.querySelector(`link[href="${url}"]`)).toBeTruthy();
		expect(document.head.querySelectorAll(`link[href="${url}"]`).length).toBe(1);
		a.remove();
	});
});

describe('loadRemoteModule', () => {
	const url = '/ws/job/api/v1/module-assets/pages/jobs-page.js';
	const mod = { mountPage: () => ({}) };
	/** URL-aware fetch: `.deps.json` 404s (self-contained chunk), else `body`. */
	const fetchJs =
		(body = 'js', status = 200) =>
		async (u: RequestInfo | URL) =>
			new Response(String(u).endsWith('.deps.json') ? 'nf' : body, {
				status: String(u).endsWith('.deps.json') ? 404 : status,
			});

	it('returns the module on success (no integrity)', async () => {
		const result = await loadRemoteModule(url, undefined, {
			fetch_fn: fetchJs(),
			import_fn: async (u) => (u === url ? mod : null),
		});
		expect(result.mod).toBe(mod);
		expect(result.dispose_source).toBeUndefined();
	});

	it('classifies a network failure', async () => {
		await expect(
			loadRemoteModule(url, undefined, {
				fetch_fn: async () => {
					throw new TypeError('fetch failed');
				},
			}),
		).rejects.toMatchObject({ kind: 'network' } satisfies Partial<RemoteLoadError>);
	});

	it('classifies an http 404', async () => {
		await expect(
			loadRemoteModule(url, undefined, {
				fetch_fn: async (u) =>
					new Response('nope', { status: String(u).endsWith('.js') ? 404 : 404 }),
			}),
		).rejects.toMatchObject({ kind: 'http', status: 404 });
	});

	it('verifies integrity then imports the verified bytes', async () => {
		const payload = 'export function mountPage(){}';
		const bytes = new TextEncoder().encode(payload);
		const hex = await sha256Hex(bytes.buffer as ArrayBuffer);
		const importFn = vi.fn(async () => mod);
		const result = await loadRemoteModule(url, `sha256-hex-unreachable`, {
			fetch_fn: async (u) =>
				new Response(String(u).endsWith('.deps.json') ? 'nf' : bytes, {
					status: String(u).endsWith('.deps.json') ? 404 : 200,
				}),
			import_fn: importFn,
		}).catch((e) => e);
		// malformed integrity value → integrity error before import
		expect(result).toMatchObject({ kind: 'integrity' });
		expect(importFn).not.toHaveBeenCalled();

		const ok = await loadRemoteModule(url, hex, {
			fetch_fn: async (u) =>
				new Response(String(u).endsWith('.deps.json') ? 'nf' : bytes, {
					status: String(u).endsWith('.deps.json') ? 404 : 200,
				}),
			import_fn: importFn,
		});
		expect(ok.mod).toBe(mod);
		expect(importFn).toHaveBeenCalledWith(expect.stringMatching(/^blob:/));
		expect(() => ok.dispose_source?.()).not.toThrow();
	});

	it('rejects a tampered payload (sha256 mismatch)', async () => {
		const bytes = new TextEncoder().encode('tampered()');
		const other = await sha256Hex(new TextEncoder().encode('clean()').buffer as ArrayBuffer);
		const importFn = vi.fn(async () => mod);
		await expect(
			loadRemoteModule(url, other, {
				fetch_fn: async (u) =>
					new Response(String(u).endsWith('.deps.json') ? 'nf' : bytes, {
						status: String(u).endsWith('.deps.json') ? 404 : 200,
					}),
				import_fn: importFn,
			}),
		).rejects.toMatchObject({ kind: 'integrity' });
		expect(importFn).not.toHaveBeenCalled();
	});

	it('classifies an import rejection', async () => {
		await expect(
			loadRemoteModule(url, undefined, {
				fetch_fn: fetchJs(),
				import_fn: async () => {
					throw new TypeError('Failed to fetch dynamically imported module');
				},
			}),
		).rejects.toMatchObject({ kind: 'import' });
	});
});

describe('loadRemoteModule — vendor handshake', () => {
	const url = '/ws/job/api/v1/module-assets/pages/jobs-page.js';
	const mod = { mountPage: () => ({}) };
	const manifest = JSON.stringify({
		svelte: { url: '/vendor/svelte.js', version: '5.57.2' },
		'@primebrick/ui': { url: '/vendor/primebrick-ui.js', version: '3.0.0' },
	});
	const fetchWith = (depsBody: string | null, depsStatus = 200, manifestBody = manifest) =>
		vi.fn(async (u: RequestInfo | URL) => {
			const s = String(u);
			if (s.endsWith('.deps.json'))
				return new Response(depsBody ?? 'nf', { status: depsBody == null ? 404 : depsStatus });
			if (s.endsWith('vendor-manifest.json')) return new Response(manifestBody, { status: 200 });
			return new Response('js', { status: 200 });
		});

	it('passes when required versions match the host manifest', async () => {
		const fetch_fn = fetchWith(
			JSON.stringify({ vendor_requires: { svelte: '5.57.2', '@primebrick/ui': '3.0.0' } }),
		);
		const result = await loadRemoteModule(url, undefined, {
			fetch_fn,
			import_fn: async () => mod,
		});
		expect(result.mod).toBe(mod);
	});

	it('proceeds when the chunk has no deps manifest (self-contained)', async () => {
		const result = await loadRemoteModule(url, undefined, {
			fetch_fn: fetchWith(null),
			import_fn: async () => mod,
		});
		expect(result.mod).toBe(mod);
	});

	it('fails vendor on version mismatch — before fetching the chunk', async () => {
		const fetch_fn = fetchWith(JSON.stringify({ vendor_requires: { svelte: '5.58.0' } }));
		const import_fn = vi.fn(async () => mod);
		await expect(loadRemoteModule(url, undefined, { fetch_fn, import_fn })).rejects.toMatchObject({
			kind: 'vendor',
			message: expect.stringContaining('svelte: requires 5.58.0, host provides 5.57.2'),
		});
		// chunk itself was never fetched — fail fast on the cheapest check
		expect(fetch_fn.mock.calls.map((c) => String(c[0]))).not.toContainEqual(
			expect.stringContaining('jobs-page.js'),
		);
		expect(import_fn).not.toHaveBeenCalled();
	});

	it('fails vendor when a required specifier is not vendored', async () => {
		await expect(
			loadRemoteModule(url, undefined, {
				fetch_fn: fetchWith(JSON.stringify({ vendor_requires: { '@primebrick/core': '3.0.0' } })),
				import_fn: async () => mod,
			}),
		).rejects.toMatchObject({
			kind: 'vendor',
			message: expect.stringContaining('@primebrick/core@3.0.0 (not vendored by host)'),
		});
	});

	it('fails vendor on malformed deps manifest JSON', async () => {
		await expect(
			loadRemoteModule(url, undefined, {
				fetch_fn: fetchWith('not-json'),
				import_fn: async () => mod,
			}),
		).rejects.toMatchObject({ kind: 'vendor' });
	});

	it('classifies a deps-manifest http error', async () => {
		await expect(
			loadRemoteModule(url, undefined, {
				fetch_fn: fetchWith('', 500),
				import_fn: async () => mod,
			}),
		).rejects.toMatchObject({ kind: 'http', status: 500 });
	});

	it('classifies a host-manifest failure as http', async () => {
		const fetch_fn = vi.fn(async (u: RequestInfo | URL) => {
			const s = String(u);
			if (s.endsWith('.deps.json'))
				return new Response(JSON.stringify({ vendor_requires: { svelte: '5.57.2' } }), {
					status: 200,
				});
			if (s.endsWith('vendor-manifest.json')) return new Response('down', { status: 503 });
			return new Response('js', { status: 200 });
		});
		await expect(
			loadRemoteModule(url, undefined, { fetch_fn, import_fn: async () => mod }),
		).rejects.toMatchObject({ kind: 'http', status: 503 });
	});
});

describe('resolveMountable / disposeMounted', () => {
	it('prefers mountPage over default', () => {
		expect(resolveMountable({ mountPage: () => ({}), default: {} })).toBe('mountPage');
	});
	it('falls back to a default component', () => {
		expect(resolveMountable({ default: {} })).toBe('default');
	});
	it('rejects modules with neither export', () => {
		expect(resolveMountable({})).toBeNull();
	});
	it('calls a function dispose result', async () => {
		const dispose = vi.fn();
		await disposeMounted(dispose);
		expect(dispose).toHaveBeenCalledOnce();
	});
	it('no-ops on undefined', async () => {
		await expect(disposeMounted(undefined)).resolves.toBeUndefined();
	});
});
