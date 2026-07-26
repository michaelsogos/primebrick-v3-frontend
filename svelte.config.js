import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	onwarn(warning, defaultHandler) {
		// Elevate state_referenced_locally to a build-breaking error in production.
		// In dev, it remains a warning so HMR is not disrupted.
		// Skip node_modules — we cannot fix third-party code.
		// See: https://svelte.dev/e/state_referenced_locally
		// Fix: wrap the reactive read in $derived() or a closure.
		if (
			warning.code === 'state_referenced_locally' &&
			process.env.NODE_ENV === 'production' &&
			warning.filename &&
			!warning.filename.includes('node_modules')
		) {
			throw new Error(
				`\n[svelte] state_referenced_locally (treated as error in production builds)\n` +
				`  ${warning.toString()}\n` +
				`  Fix: wrap the reactive read in $derived() or a closure.\n` +
				`  See: https://svelte.dev/e/state_referenced_locally\n`
			);
		}
		defaultHandler(warning);
	},
	kit: {
		adapter: adapter()
	}
};

export default config;
