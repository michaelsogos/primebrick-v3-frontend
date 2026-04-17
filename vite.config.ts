import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const apiOrigin = (env.API_ORIGIN || 'http://127.0.0.1:3001').replace(/\/$/, '');

	const rootDir = dirname(fileURLToPath(import.meta.url));
	const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8')) as { version?: string };
	const appVersion = pkg.version ?? '0.0.0';

	return {
		plugins: [sveltekit()],
		define: {
			__APP_VERSION__: JSON.stringify(appVersion)
		},
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
