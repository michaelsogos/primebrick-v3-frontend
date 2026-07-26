import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PUBLIC_API_ORIGIN } from '$env/static/public';
import { building } from '$app/environment';

// Validate environment at runtime, skip during build
if (!building) {
	try {
		// Verify PUBLIC_API_ORIGIN is a valid URL
		new URL(PUBLIC_API_ORIGIN);
	} catch (e) {
		const errorMessage = `
========================================================================
🚨 CRITICAL CONFIGURATION ERROR
The environment variable 'PUBLIC_API_ORIGIN' is not defined or is not a valid URL.
Current value: "${PUBLIC_API_ORIGIN}"

Check your .env file and restart the server.
========================================================================`;

		console.error(errorMessage);
		// Terminate Node.js process to prevent application startup
		process.exit(1);
	}
}

function apiOrigin(): string {
	return (env.API_ORIGIN ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
}

/**
 * SvelteKit handles incoming requests before Vite's `server.proxy`, so `/api/*`
 * must be forwarded here for dev (and preview) to reach the Express API.
 *
 * SSE endpoints (paths ending in `/events`) are streamed: the upstream response
 * body is piped through without buffering, so Server-Sent Events reach the FE
 * client in real time.
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

	// SSE endpoints: stream the response without buffering.
	// Detect by path ending in /events — matches the SSE standard URL convention.
	const isSse = event.url.pathname.endsWith('/events');

	if (isSse) {
		// For SSE, fetch with streaming and pipe the body through.
		const upstream = await fetch(target, {
			method,
			headers,
			body: body && body.byteLength > 0 ? body : hasBody ? body : undefined
		});

		// Return a streaming Response — the body is a ReadableStream that
		// SvelteKit pipes to the client without buffering.
		return new Response(upstream.body, {
			status: upstream.status,
			statusText: upstream.statusText,
			headers: upstream.headers
		});
	}

	return fetch(target, {
		method,
		headers,
		body: body && body.byteLength > 0 ? body : hasBody ? body : undefined
	});
};
