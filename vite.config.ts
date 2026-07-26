import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import Icons from 'unplugin-icons/vite';
import tailwindcss from '@tailwindcss/vite';

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
		ssr: {
			noExternal: ['bits-ui', '@lucide/svelte']
		},
		optimizeDeps: {
			include: ['html2pdf.js']
		},
		server: {
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
				// Microservice proxy: BE mounts /ws/:serviceCode/* and forwards
				// to the registered microservices. Without this rule, Vite
				// tries to render /ws/... as a SvelteKit route and returns the
				// 404 HTML page instead of proxying to the BE.
				'/ws': {
					target: apiOrigin,
					changeOrigin: true
				}
			}
		}
	};
});
