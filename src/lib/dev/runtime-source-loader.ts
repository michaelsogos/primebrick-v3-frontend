/**
 * DEV-ONLY runtime source loader — spike for "ship .svelte source, compile in
 * the host browser" (model B). Simulates the production remote loader through
 * the Vite dev server (?raw fetches).
 *
 * Resolution model (mirrors the production contract):
 *   svelte, svelte/*, @primebrick/*     → bare → host importmap → vendor bundles
 *   <file>.svelte (component source)     → fetched raw → compile() → blob (recursive)
 *   everything else project-local        → per-specifier PROXY module:
 *       blob(`import * as _ns from '<dev-url>'; export * from '<dev-url>'; export default _ns.default`)
 *     — the host instance (api, i18n, rune singletons, ui barrels). In production
 *     these arrive via ctx / vendored ui, never compiled. Proxy preserves named,
 *     default AND namespace imports without a flat-export collision.
 *   @lucide/svelte                       → host-env.ts shim (export *)
 *   bits-ui                              → host-env-bits.ts shim (own file —
 *                                          `export *` collides with lucide names)
 */

export interface LoadResult {
	url: string;
	kind: 'component' | 'module' | 'proxy';
	blobUrl: string;
	css: string | null;
	specifiers: string[];
	compileMs: number;
}

export interface LoaderReport {
	modules: LoadResult[];
	failed: { url: string; stage: string; error: string }[];
	renamedImports: { from: string; to: string }[];
	totalMs: number;
}

// NOTE: inside blob: modules, root-relative `/...` specifiers do NOT resolve
// (blob: is not a hierarchical scheme). All rewritten URLs must be absolute.
const abs = (p: string) => new URL(p, location.origin).href;
const HOST_ENV = () => abs('/src/lib/dev/host-env.ts');
const HOST_ENV_BITS = () => abs('/src/lib/dev/host-env-bits.ts');
const SPEC_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

type Compiler = typeof import('svelte/compiler');
let compilerPromise: Promise<Compiler> | null = null;

export function loadCompiler(): Promise<Compiler> {
	compilerPromise ??= import('svelte/compiler');
	return compilerPromise;
}

function toDevPath(spec: string): string {
	if (spec.startsWith('$lib/')) return `/src/${spec.slice(1)}`;
	return spec;
}

type Resolved =
	| { mode: 'bare' }
	| { mode: 'shim'; url: string }
	| { mode: 'source' | 'proxy'; url: string; proxyCode?: string };

/** kebab-case → PascalCase (for @lucide/svelte/icons/<name> default imports). */
const pascal = (s: string) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');

/** Named-shim proxy: `export { <name> as default } from '<shim>'`. */
function namedDefaultProxy(shimUrl: string, name: string): string {
	return blobUrl(`export { ${name} as default } from ${JSON.stringify(shimUrl)};`);
}

/** Files using Vite-only APIs (import.meta.glob etc.) cannot compile at
 *  runtime — they are host components → proxy. In production this must be a
 *  lint-enforced authoring rule for remote source. */
const VITE_ONLY = /DynamicIcon\.svelte$/;

function resolveSpecifier(spec: string, importerUrl: string): Resolved {
	if (spec === 'svelte' || spec.startsWith('svelte/') || spec.startsWith('@primebrick/')) {
		return { mode: 'bare' };
	}
	// unplugin-icons virtual modules → their /@id/ dev URL proxies fine
	if (spec.startsWith('~icons/')) {
		return { mode: 'proxy', url: abs(`/@id/virtual:icons/${spec.slice(7)}`) };
	}
	if (spec === 'bits-ui' || spec.startsWith('bits-ui/')) return { mode: 'shim', url: HOST_ENV_BITS() };
	// per-icon subpath imports: `import Cpu from '@lucide/svelte/icons/cpu'`
	// → derive `export { Cpu as default }` against the lucide shim
	if (spec.startsWith('@lucide/svelte/icons/')) {
		const name = pascal(spec.split('/').pop()!);
		return { mode: 'proxy', url: '', proxyCode: `export { ${name} as default } from ${JSON.stringify(HOST_ENV())};` } as Resolved;
	}
	if (spec === '@lucide/svelte' || spec.startsWith('@lucide/')) return { mode: 'shim', url: HOST_ENV() };
	// .svelte component files — compiled recursively (probe .ts variant later)
	if (spec.endsWith('.svelte')) {
		const resolved = new URL(toDevPath(spec), importerUrl).href;
		if (VITE_ONLY.test(resolved)) return { mode: 'proxy', url: resolved };
		return { mode: 'source', url: resolved };
	}
	// everything else project-local or external → host proxy module
	if (spec.startsWith('.')) return { mode: 'proxy', url: new URL(spec, importerUrl).href };
	if (spec.startsWith('$lib/') || spec.startsWith('/')) {
		return { mode: 'proxy', url: new URL(toDevPath(spec), importerUrl).href };
	}
	// $app/* and other bare project specs → host-env shim
	return { mode: 'shim', url: HOST_ENV() };
}

async function fetchSource(url: string): Promise<string> {
	// Vite dev: ?raw on a module URL returns `export default "<source>"`.
	const mod = (await import(/* @vite-ignore */ `${url}?raw`)) as { default: string };
	return mod.default;
}

/**
 * Convention: `import '.../x.svelte'` may resolve to `x.svelte.ts` (rune
 * module) and `.../index.js` to `index.ts` — Vite resolves leniently. Probe
 * the `.ts` variant: if it exists the specifier is a host module → proxy.
 */
async function probeTsVariant(url: string): Promise<string | null> {
	const candidates: string[] = [];
	if (url.endsWith('.svelte')) candidates.push(`${url}.ts`); // x.svelte → x.svelte.ts
	else if (url.endsWith('.js')) candidates.push(url.slice(0, -3) + '.ts'); // x.js → x.ts
	else candidates.push(`${url}.ts`, `${url}/index.ts`); // extensionless
	for (const c of candidates) {
		if (c === url) continue;
		try {
			// existence check MUST be a real module import — `?raw` resolves
			// too leniently in vite dev and returns 200 for nonexistent files.
			await import(/* @vite-ignore */ c);
			return c;
		} catch {
			/* try next */
		}
	}
	return null;
}

function proxyBlobUrl(moduleUrl: string): string {
	const code = `import * as _ns from ${JSON.stringify(moduleUrl)};\nexport * from ${JSON.stringify(moduleUrl)};\nexport default _ns.default;\n`;
	return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
}

function blobUrl(code: string): string {
	return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
}

/** Compile one source module and its whole source-side dependency graph. */
export async function loadSourceModule(entryUrl: string): Promise<LoaderReport> {
	const compiler = await loadCompiler();
	entryUrl = new URL(entryUrl, location.origin).href;
	const report: LoaderReport = { modules: [], failed: [], renamedImports: [], totalMs: 0 };
	const cache = new Map<string, Promise<LoadResult>>();
	const t0 = performance.now();

	async function compileOne(url: string): Promise<LoadResult> {
		const cached = cache.get(url);
		if (cached) return cached;
		const promise = (async (): Promise<LoadResult> => {
			const t1 = performance.now();

			// .svelte spec may actually be a .svelte.ts rune module → host proxy
			const tsVariant = url.endsWith('.svelte') ? await probeTsVariant(url) : null;
			if (tsVariant) {
				report.renamedImports.push({ from: url, to: 'proxy(.svelte.ts)' });
				return { url, kind: 'proxy', blobUrl: proxyBlobUrl(tsVariant), css: null, specifiers: [], compileMs: 0 };
			}

			const source = await fetchSource(url);
			const kind = url.endsWith('.svelte') ? 'component' : 'module';
			const out =
				kind === 'component'
					? compiler.compile(source, { filename: url, generate: 'client', dev: false, css: 'external' })
					: compiler.compileModule(source, { filename: url, dev: false });
			const code = out.js.code as string;
			const css = kind === 'component' ? ((out as { css?: { code?: string } }).css?.code ?? null) : null;

			const specs = [...code.matchAll(SPEC_RE)].map((m) => m[1]);
			const replacements = new Map<string, string>();
			for (const spec of specs) {
				const r = resolveSpecifier(spec, url);
				if (r.mode === 'bare') continue;
				if (r.mode === 'shim') {
					replacements.set(spec, r.url);
					report.renamedImports.push({ from: spec, to: 'shim' });
					continue;
				}
				if (r.mode === 'proxy') {
					if (r.proxyCode) {
						replacements.set(spec, blobUrl(r.proxyCode));
					} else {
						const tsUrl = r.url ? ((await probeTsVariant(r.url)) ?? r.url) : r.url;
						replacements.set(spec, proxyBlobUrl(tsUrl));
					}
					report.renamedImports.push({ from: spec, to: 'proxy' });
					continue;
				}
				// mode === 'source' → recurse, point at dep blob
				try {
					const dep = await compileOne(r.url);
					replacements.set(spec, dep.blobUrl);
				} catch (err) {
					report.failed.push({ url: r.url, stage: 'dep-of:' + url, error: String(err) });
					throw err;
				}
			}
			const rewritten = code.replace(SPEC_RE, (full, spec: string) =>
				replacements.has(spec)
					? full.replace(`'${spec}'`, `'${replacements.get(spec)}'`).replace(`"${spec}"`, `"${replacements.get(spec)}"`)
					: full,
			);
			return { url, kind, blobUrl: blobUrl(rewritten), css, specifiers: specs, compileMs: performance.now() - t1 };
		})();
		cache.set(url, promise);
		return promise;
	}

	try {
		const entry = await compileOne(entryUrl);
		report.modules.push(entry);
		for (const p of cache.values()) {
			const r = await p.catch(() => null);
			if (r && r !== entry) report.modules.push(r);
		}
	} catch (err) {
		report.failed.push({ url: entryUrl, stage: 'entry', error: String(err) });
	}
	report.totalMs = performance.now() - t0;
	return report;
}

/** Mount a loaded report's entry into `target`; injects ALL graph css. */
export async function mountReport(report: LoaderReport, target: HTMLElement, props: Record<string, unknown> = {}) {
	const entry = report.modules[0];
	if (!entry) throw new Error('no compiled entry module');
	// mount MUST come from the importmap-resolved vendor instance — importing
	// '/vendor/svelte.js' from vite-served code gets a `?import`-suffixed copy
	// = a second svelte runtime. A blob shim keeps a bare specifier → importmap.
	const shim = blobUrl('export { mount, unmount } from "svelte";');
	const vendor = (await import(/* @vite-ignore */ shim)) as {
		mount: (c: unknown, o: { target: HTMLElement; props?: unknown }) => unknown;
	};
	const mod = (await import(/* @vite-ignore */ entry.blobUrl)) as { default: unknown };
	const css = report.modules.map((m) => m.css).filter(Boolean).join('\n');
	if (css) {
		const style = document.createElement('style');
		style.dataset.rc = entry.url;
		style.textContent = css;
		document.head.appendChild(style);
	}
	return vendor.mount(mod.default, { target, props });
}
