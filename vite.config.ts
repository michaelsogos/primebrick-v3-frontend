import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const apiOrigin = (env.API_ORIGIN || 'http://127.0.0.1:3001').replace(/\/$/, '');

	return {
		plugins: [sveltekit()],
		ssr: {
			noExternal: ['bits-ui']
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
