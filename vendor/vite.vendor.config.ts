import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import {
	VENDOR_SPECIFIERS,
	specifierTopPackage,
	resolveVendorSpecifier,
	// Contract lives in @primebrick/core — imported here by FILE PATH, not
	// package specifier: the FE↔core layering rule (FE goes through
	// @primebrick/ui) governs package dependencies, and `@primebrick/ui`'s
	// dist pulls `.svelte` files this Node-side config cannot load. The
	// vendored contract module is dependency-free pure JS.
	// @ts-ignore — sibling repo file, outside this package's graph
} from '../../primebrick-v3-core/dist/vendor-plane.js';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

/**
 * Vendor plane build — the shared, versioned library surface remote module
 * chunks resolve through the document import map.
 *
 * Design contract:
 * - CLOSED specifier list (`VENDOR_ENTRIES`) — this is the "by-design" set.
 *   A bare import outside this list inside a remote chunk is a build error
 *   there, never silently bundled.
 * - Each vendor entry inlines its OWN package and keeps every OTHER vendor
 *   specifier bare → all vendor bundles resolve shared deps through the
 *   same import map = ONE runtime instance.
 * - Leaf deps (clsx, tailwind-merge, …) with no instance semantics bundle
 *   inside their importer's vendor file — they need no map entry.
 * - Deterministic filenames under `static/vendor/`; staleness is governed by
 *   `vendor-manifest.json` + each chunk's `vendor_requires` handshake — NOT
 *   by filename hashing (the map in `app.html` is static).
 */

/**
 * specifier → emitted file. All specifiers of one npm package map to ONE
 * file (union namespace): the browser dedupes by URL → guaranteed single
 * runtime instance, and `import * as $` / named imports both resolve.
 * Keys must equal core's VENDOR_SPECIFIERS — asserted at config load.
 * `pkg` overrides the manifest version source when the vendored file is a
 * raw prebuilt copy of a different package (transformers behind the ui
 * subpath).
 */
const VENDOR_ENTRIES: Record<string, { file: string; pkg?: string }> = {
	svelte: { file: 'svelte.js' },
	'svelte/internal/client': { file: 'svelte.js' },
	'svelte/internal/disclose-version': { file: 'svelte.js' },
	'svelte/internal/flags/legacy': { file: 'svelte.js' },
	// public svelte subpaths get their own file: their export names can
	// collide with the internal signal API (store's get/derived vs
	// internal/client's signal accessors — a union file cannot hold both),
	// so each specifier maps to a dedicated bundle and shared internals
	// dedupe through rolldown's shared-[hash] chunks.
	'svelte/events': { file: 'svelte-events.js' },
	'svelte/reactivity': { file: 'svelte-reactivity.js' },
	'svelte/store': { file: 'svelte-store.js' },
	'svelte/attachments': { file: 'svelte-attachments.js' },
	'@primebrick/core': { file: 'primebrick-core.js' },
	'@primebrick/ui': { file: 'primebrick-ui.js' },
	'@primebrick/ui/transformers': { file: 'transformers.js', pkg: '@huggingface/transformers' },
	'@primebrick/ui/vendor/clsx': { file: 'vendor-clsx.js', pkg: 'clsx' },
	'@primebrick/ui/vendor/tailwind-merge': { file: 'vendor-tailwind-merge.js', pkg: 'tailwind-merge' },
	'@primebrick/ui/vendor/tailwind-variants': {
		file: 'vendor-tailwind-variants.js',
		pkg: 'tailwind-variants',
	},
	'@primebrick/ui/vendor/lucide': { file: 'vendor-lucide.js', pkg: '@lucide/svelte' },
	'@primebrick/ui/vendor/bits-ui': { file: 'vendor-bits-ui.js', pkg: 'bits-ui' },
};

const entryKeys = Object.keys(VENDOR_ENTRIES).sort();
const specKeys = [...VENDOR_SPECIFIERS].sort();
if (JSON.stringify(entryKeys) !== JSON.stringify(specKeys)) {
	throw new Error(
		`vendor:build: VENDOR_ENTRIES keys diverged from @primebrick/core VENDOR_SPECIFIERS\n` +
			`  entries:    ${entryKeys.join(', ')}\n` +
			`  specifiers: ${specKeys.join(', ')}`
	);
}

/** input name → entry file (one entry per emitted bundle). */
const VENDOR_INPUTS: Record<string, string> = {
	svelte: 'entries/svelte.ts',
	'primebrick-core': 'entries/primebrick-core.ts',
	'primebrick-ui': 'entries/primebrick-ui.ts',
	'svelte-events': 'entries/svelte-events.ts',
	'svelte-reactivity': 'entries/svelte-reactivity.ts',
	'svelte-store': 'entries/svelte-store.ts',
	'svelte-attachments': 'entries/svelte-attachments.ts',
	'vendor-clsx': 'entries/vendor-clsx.ts',
	'vendor-tailwind-merge': 'entries/vendor-tailwind-merge.ts',
	'vendor-tailwind-variants': 'entries/vendor-tailwind-variants.ts',
	'vendor-lucide': 'entries/vendor-lucide.ts',
	'vendor-bits-ui': 'entries/vendor-bits-ui.ts',
};

/** entry file name → the package it bundles (importer attribution). */
const ENTRY_FILE_PKG: Record<string, string> = {
	'svelte.ts': 'svelte',
	'svelte-events.ts': 'svelte',
	'svelte-reactivity.ts': 'svelte',
	'svelte-store.ts': 'svelte',
	'svelte-attachments.ts': 'svelte',
	'primebrick-core.ts': '@primebrick/core',
	'primebrick-ui.ts': '@primebrick/ui',
	// the vendor/* entries import the sanctioned @primebrick/ui wrapper —
	// their bundle content IS the ui wrapper's re-export surface
	'vendor-clsx.ts': '@primebrick/ui',
	'vendor-tailwind-merge.ts': '@primebrick/ui',
	'vendor-tailwind-variants.ts': '@primebrick/ui',
	'vendor-lucide.ts': '@primebrick/ui',
	'vendor-bits-ui.ts': '@primebrick/ui',
};

/**
 * Packages vendored through a dedicated `@primebrick/ui/vendor/*` wrapper —
 * derived from VENDOR_ENTRIES' `pkg` field so the list stays single-source.
 * `@primebrick/ui`'s own raw imports of these inline into the emitted
 * bundle (the wrappers ARE the plane); everywhere else the blocked-package
 * `reject` verdict keeps them external — a remote chunk importing them raw
 * is still a contract violation in its own build.
 */
const UI_WRAPPED_PACKAGES = new Set(
	Object.entries(VENDOR_ENTRIES)
		.filter(([specifier]) => specifier.startsWith('@primebrick/ui/vendor/'))
		.map(([, entry]) => entry.pkg)
		.filter((pkg): pkg is string => pkg != null)
);

/** wrapped package name → its sanctioned specifier (output.paths rewrite). */
const WRAPPED_SPECIFIER_BY_PKG = new Map(
	Object.entries(VENDOR_ENTRIES)
		.filter(([specifier]) => specifier.startsWith('@primebrick/ui/vendor/'))
		.map(([specifier, entry]) => [entry.pkg, specifier] as const)
);

const require = createRequire(import.meta.url);

/** Package that physically contains an importer file. */
function pkgOfImporter(importer: string): string | undefined {
	const norm = importer.replace(/\\/g, '/');
	// our vendor entry files → the package they bundle
	if (norm.includes('/vendor/entries/')) {
		return ENTRY_FILE_PKG[norm.split('/').pop() ?? ''];
	}
	// node_modules/<pkg>/… — greedy match takes the LAST node_modules
	// segment so .pnpm layouts resolve to the real package, not '.pnpm'.
	const nm = norm.match(/.*\/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
	if (nm) return nm[1];
	// workspace repo dirs (link: deps resolve to real paths outside node_modules)
	for (const [pkg, dir] of Object.entries(WORKSPACE_PACKAGE_DIRS)) {
		if (norm.includes(`/${dir}/`)) return pkg;
	}
	return undefined;
}

function vendorExternals(): Plugin {
	return {
		name: 'primebrick-vendor-externals',
		enforce: 'pre',
		resolveId(source, importer) {
			if (resolveVendorSpecifier(source) === 'bundle') return null;
			const importerPkg = importer ? pkgOfImporter(importer) : undefined;
			// Same-package imports always bundle (entry's own package AND
			// internal subpath imports inside that package's tree). Cross-package
			// vendor specifiers stay bare → resolved via the import map.
			if (importerPkg && importerPkg === specifierTopPackage(source)) return null;
			// @primebrick/ui owns the vendor wrappers — its raw imports of the
			// wrapped packages ARE the sanctioned surface and inline into the
			// per-package bundle. Every other 'reject' specifier (blocked
			// packages for other importers, non-allowlisted vendor deep paths)
			// stays bare so misuse fails loudly instead of silently duplicating
			// a runtime instance.
			if (importerPkg === '@primebrick/ui' && UI_WRAPPED_PACKAGES.has(specifierTopPackage(source)))
				return null;
			return { id: source, external: true };
		},
	};
}

/**
 * Workspace-linked packages (`link:` deps — they resolve to sibling repos,
 * NOT into this repo's node_modules when they're transitive). Used for both
 * manifest version lookup and importer→package attribution.
 */
const WORKSPACE_PACKAGE_DIRS: Record<string, string> = {
	'@primebrick/core': 'primebrick-v3-core',
	'@primebrick/ui': 'primebrick-v3-ui',
	'@primebrick/dal-pg': 'primebrick-dal-v3',
	'@primebrick/sdk': 'primebrick-v3-sdk',
	'@primebrick/decimal': 'primebrick-decimal',
};

/**
 * Resolve a package's install dir — direct node_modules first, then through
 * the workspace-linked repo (link: deps land outside this repo's graph).
 */
function pkgDir(pkgName: string): string {
	const repoRoot = fileURLToPath(new URL('..', import.meta.url));
	const candidates = [
		join(repoRoot, 'node_modules', pkgName, 'package.json'),
		...(WORKSPACE_PACKAGE_DIRS[pkgName]
			? [join(repoRoot, '..', WORKSPACE_PACKAGE_DIRS[pkgName], 'package.json')]
			: []),
		// transitive: reached through a workspace package's own node_modules
		...Object.values(WORKSPACE_PACKAGE_DIRS).map((dir) =>
			join(repoRoot, '..', dir, 'node_modules', pkgName, 'package.json')
		),
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) return dirname(candidate);
	}
	throw new Error(`vendor-manifest: cannot resolve ${pkgName}`);
}

function pkgVersion(pkgName: string): string {
	const pkg = JSON.parse(readFileSync(join(pkgDir(pkgName), 'package.json'), 'utf8')) as {
		version?: string;
	};
	if (!pkg.version) throw new Error(`vendor-manifest: no version for ${pkgName}`);
	return pkg.version;
}

/**
 * Vendored files copied verbatim (already self-contained browser ESM) —
 * `@huggingface/transformers` ships `transformers.web.min.js`; its ort
 * wasm-simd worker is resolved relative to `import.meta.url`, so it must sit
 * at the same `/vendor/` path.
 */
const COPY_FILES: Array<{ src: string; pkg: string; dest: string }> = [
	{ src: 'dist/transformers.web.min.js', pkg: '@huggingface/transformers', dest: 'transformers.js' },
	{
		src: 'dist/ort-wasm-simd-threaded.jsep.mjs',
		pkg: '@huggingface/transformers',
		dest: 'ort-wasm-simd-threaded.jsep.mjs',
	},
];

function vendorCopies(): Plugin {
	return {
		name: 'primebrick-vendor-copies',
		closeBundle() {
			const outDir = fileURLToPath(new URL('../static/vendor', import.meta.url));
			for (const { src, pkg, dest } of COPY_FILES) {
				const source = join(pkgDir(pkg), src);
				writeFileSync(join(outDir, dest), readFileSync(source));
			}
		},
	};
}

/**
 * Post-build audit — every external import emitted inside a vendor bundle
 * must resolve through the document import map, so it must be an allowlisted
 * specifier. A `reject` verdict that slips through `vendorExternals` (e.g. a
 * non-allowlisted svelte deep path a new lib version starts importing)
 * would otherwise ship as a bare specifier with no map entry and fail
 * opaquely at remote-load time.
 */
function vendorExternalAudit(): Plugin {
	return {
		name: 'primebrick-vendor-external-audit',
		generateBundle(_options, bundle) {
			const allowed = new Set<string>(VENDOR_SPECIFIERS);
			for (const [fileName, chunk] of Object.entries(bundle)) {
				if (chunk.type !== 'chunk') continue;
				for (const imported of [...chunk.imports, ...chunk.dynamicImports]) {
					if (imported.startsWith('./') || imported.startsWith('../')) continue;
					// rolldown may emit sibling-chunk imports without the './'
					// prefix — an import that names a file in this bundle is
					// intra-bundle, not a bare specifier
					if (bundle[imported]) continue;
					if (!allowed.has(imported)) {
						this.error(
							`vendor:build: ${fileName} emits bare import '${imported}' ` +
								`which is not in VENDOR_SPECIFIERS — every emitted external ` +
								`must resolve through the document import map`
						);
					}
				}
			}
		},
	};
}

function vendorManifest(): Plugin {
	return {
		name: 'primebrick-vendor-manifest',
		closeBundle() {
			const manifest: Record<string, { url: string; version: string }> = {};
			for (const [specifier, { file, pkg }] of Object.entries(VENDOR_ENTRIES)) {
				manifest[specifier] = {
					url: `/vendor/${file}`,
					version: pkgVersion(pkg ?? specifierTopPackage(specifier)),
				};
			}
			writeFileSync(
				fileURLToPath(new URL('../static/vendor/vendor-manifest.json', import.meta.url)),
				JSON.stringify(manifest, null, 2) + '\n'
			);
		},
	};
}

export default defineConfig({
	plugins: [vendorExternals(), svelte(), vendorExternalAudit(), vendorManifest(), vendorCopies()],
	resolve: {
		// Exact-match aliases: the bare package specifier maps to the sibling
		// workspace repo ('@primebrick/core' is reached only transitively —
		// ui → core — so FE never depends on it directly; the alias is a
		// build-tool mechanism, not a package dependency). Subpath specifiers
		// like '@primebrick/ui/vendor/clsx' intentionally fall through to
		// normal package resolution → the repo's own exports map → dist/.
		alias: Object.entries(WORKSPACE_PACKAGE_DIRS).map(([pkg, dir]) => ({
			find: new RegExp(`^${pkg.replace(/[/@]/g, (c) => `\\${c}`)}$`),
			replacement: fileURLToPath(new URL(`../../${dir}`, import.meta.url)),
		})),
	},
	build: {
		outDir: 'static/vendor',
		emptyOutDir: true,
		sourcemap: true,
		minify: true,
		// lib mode — app mode drops entry export signatures (entries are
		// treated as <script> roots); vendor files are modules consumed by
		// import specifiers, so their exports must be preserved.
		lib: {
			entry: Object.fromEntries(
				Object.entries(VENDOR_INPUTS).map(([name, entry]) => [
					name,
					fileURLToPath(new URL(entry, import.meta.url)),
				])
			),
			formats: ['es'],
			fileName: (_format, name) => `${name}.js`,
		},
		rollupOptions: {
			output: {
				chunkFileNames: 'shared-[name]-[hash].js',
				// Vendor bundles that legitimately pull a wrapped package
				// (svelte's runtime imports clsx internally) re-emit it as the
				// SANCTIONED specifier — the import map then resolves it to the
				// same per-package bundle every consumer uses: one instance,
				// no extra map entries, no raw-package surface.
				paths: (id) => WRAPPED_SPECIFIER_BY_PKG.get(specifierTopPackage(id)) ?? id,
			},
		},
	},
});
