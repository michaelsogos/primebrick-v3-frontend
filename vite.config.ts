import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import Icons from 'unplugin-icons/vite';
import tailwindcss from '@tailwindcss/vite';

const uiSrc = (sub = '') =>
	fileURLToPath(new URL(`../primebrick-v3-ui/src/lib${sub}`, import.meta.url));
const coreSrc = (sub = '') =>
	fileURLToPath(new URL(`../primebrick-v3-core/src${sub}`, import.meta.url));

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const apiOrigin = (env.API_ORIGIN || 'http://localhost:3001').replace(/\/+$/, '');

	return {
		plugins: [
			tailwindcss(),
			sveltekit(),
			Icons({
				compiler: 'svelte',
				autoInstall: true
			})
		],
		resolve: {
			// Consume workspace libs from SOURCE — HMR on ui/core files with no
			// svelte-package/tsc rebuild step and no dep-cache staleness. The
			// `dist` artifacts remain the production surface (exports map
			// untouched); the lib build stays a release gate.
			// Every entry mirrors the package's OWN `exports` map one-to-one:
			// subpaths resolve to real src files (e.g. `./cache` → etag-store.ts,
			// NOT a directory index that doesn't exist in src). The core alias
			// is mandatory — ui sources import @primebrick/core across 11 files;
			// without it we'd get split dist+src instances of the same module.
			alias: [
				{ find: /^@primebrick\/ui$/, replacement: uiSrc('/index.ts') },
				{ find: /^@primebrick\/ui\/utils$/, replacement: uiSrc('/utils/index.ts') },
				{ find: /^@primebrick\/ui\/ai$/, replacement: uiSrc('/ai/index.ts') },
				{ find: /^@primebrick\/ui\/cache$/, replacement: uiSrc('/cache/etag-store.ts') },
				{ find: /^@primebrick\/ui\/bridges$/, replacement: uiSrc('/bridges.ts') },
				{ find: /^@primebrick\/ui\/vendor\/(.+)$/, replacement: `${uiSrc()}/vendor/$1.ts` },
				{ find: /^@primebrick\/core$/, replacement: coreSrc('/index.ts') },
				{ find: /^@primebrick\/core\/(.+)$/, replacement: `${coreSrc()}/$1.ts` }
			]
		},
		ssr: {
			// Workspace-linked packages carrying .svelte/.svelte.js sources must
			// be compiled by vite in SSR too — externalizing them hits node's
			// raw ESM loader (ERR_UNKNOWN_FILE_EXTENSION → 500 on SSR pages).
			noExternal: ['bits-ui', '@lucide/svelte', '@primebrick/ui', '@primebrick/core']
		},
		optimizeDeps: {
			include: ['html2pdf.js'],
			// Source-aliased libs are app code — never pre-bundle them.
			exclude: ['@primebrick/ui', '@primebrick/core']
		},
		server: {
			// Bind IPv4 loopback only — the default 'localhost' resolves to ::1
			// on Windows, which put the dev server on an IPv6-only socket that
			// curl/127.0.0.1 probes (and some tooling) could not reach.
			host: '127.0.0.1',
			fs: {
				allow: [
					// Allow Vite to serve files from the workspace root (pnpm hoists
					// some dependencies like @fontsource-variable/inter to the
					// workspace node_modules, which is outside the project root).
					'..'
				]
			},
			proxy: {
				'/api': {
					target: apiOrigin,
					changeOrigin: true,
					// SSE endpoints need long-lived connections without proxy timeout.
					// The http-proxy `proxyTimeout` defaults to 0 (no timeout) which is
					// correct for SSE. We set `timeout: 0` explicitly to prevent the
					// proxy from closing idle SSE connections.
					timeout: 0,
					proxyTimeout: 0
				},
				// Microservice proxy: BE mounts /svc/:serviceCode/* and forwards
				// to the registered microservices. Without this rule, Vite
				// tries to render /svc/... as a SvelteKit route and returns the
				// 404 HTML page instead of proxying to the BE.
				'/svc': {
					target: apiOrigin,
					changeOrigin: true
				}
			}
		}
	};
});
