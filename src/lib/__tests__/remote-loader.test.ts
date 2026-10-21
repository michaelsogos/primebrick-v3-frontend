import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
	RemoteLoadError,
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

	it('returns the module on success (no integrity)', async () => {
		const result = await loadRemoteModule(url, undefined, {
			fetch_fn: async () => new Response('js', { status: 200 }),
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
				fetch_fn: async () => new Response('nope', { status: 404 }),
			}),
		).rejects.toMatchObject({ kind: 'http', status: 404 });
	});

	it('verifies integrity then imports the verified bytes', async () => {
		const payload = 'export function mountPage(){}';
		const bytes = new TextEncoder().encode(payload);
		const hex = await sha256Hex(bytes.buffer as ArrayBuffer);
		const importFn = vi.fn(async () => mod);
		const result = await loadRemoteModule(url, `sha256-hex-unreachable`, {
			fetch_fn: async () => new Response(bytes, { status: 200 }),
			import_fn: importFn,
		}).catch((e) => e);
		// malformed integrity value → integrity error before import
		expect(result).toMatchObject({ kind: 'integrity' });
		expect(importFn).not.toHaveBeenCalled();

		const ok = await loadRemoteModule(url, hex, {
			fetch_fn: async () => new Response(bytes, { status: 200 }),
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
				fetch_fn: async () => new Response(bytes, { status: 200 }),
				import_fn: importFn,
			}),
		).rejects.toMatchObject({ kind: 'integrity' });
		expect(importFn).not.toHaveBeenCalled();
	});

	it('classifies an import rejection', async () => {
		await expect(
			loadRemoteModule(url, undefined, {
				fetch_fn: async () => new Response('js', { status: 200 }),
				import_fn: async () => {
					throw new TypeError('Failed to fetch dynamically imported module');
				},
			}),
		).rejects.toMatchObject({ kind: 'import' });
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
