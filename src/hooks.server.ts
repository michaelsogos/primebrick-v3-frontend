import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

function apiOrigin(): string {
	return (env.API_ORIGIN ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
}

/**
 * SvelteKit handles incoming requests before Vite's `server.proxy`, so `/api/*`
 * must be forwarded here for dev (and preview) to reach the Express API.
 *
 * Override with env `API_ORIGIN` (no trailing slash), e.g. http://127.0.0.1:3001
 */
export const handle: Handle = async ({ event, resolve }) => {
	if (!event.url.pathname.startsWith('/api')) {
		return resolve(event);
	}

	const target = `${apiOrigin()}${event.url.pathname}${event.url.search}`;
	const headers = new Headers(event.request.headers);
	for (const name of ['host', 'connection', 'content-length']) {
		headers.delete(name);
	}

	const method = event.request.method;
	const hasBody = method !== 'GET' && method !== 'HEAD';
	const body = hasBody ? await event.request.arrayBuffer() : undefined;

	return fetch(target, {
		method,
		headers,
		body: body && body.byteLength > 0 ? body : hasBody ? body : undefined
	});
};
