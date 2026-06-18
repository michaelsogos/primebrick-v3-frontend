import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import Icons from 'unplugin-icons/vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const apiOrigin = (env.API_ORIGIN || 'http://localhost:3001').replace(/\/+$/, '');

	return {
		plugins: [
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
			proxy: {
				'/api': {
					target: apiOrigin,
					changeOrigin: true
				}
			}
		}
	};
});
