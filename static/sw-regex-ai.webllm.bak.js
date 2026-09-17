/**
 * Service Worker for SmartRegexInput AI model pre-download.
 *
 * Intercepts fetches to huggingface.co (where WebLLM model files are hosted)
 * and caches them using the Cache API. This enables:
 * - Background pre-download of model files on app startup
 * - Instant loading from cache on subsequent visits
 * - Offline-capable AI regex assistant (after first download)
 *
 * The SW does NOT intercept same-origin requests — only cross-origin
 * huggingface.co fetches from WebLLM's model loader.
 */

const CACHE_NAME = 'webllm-models-v1';
const HF_ORIGIN = 'https://huggingface.co';

self.addEventListener('install', (event) => {
  // Activate immediately without waiting for existing clients to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old cache versions and claim all clients immediately
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('webllm-models-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept GET requests to huggingface.co (model files)
  if (event.request.method !== 'GET' || url.origin !== HF_ORIGIN) {
    return;
  }

  // Cache-first strategy for model files
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) {
        return cached;
      }

      try {
        const response = await fetch(event.request);
        // Only cache successful responses
        if (response.ok && response.status === 200) {
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (err) {
        // Network failed — return cached response if available (already checked above)
        // Otherwise rethrow
        throw err;
      }
    })(),
  );
});

// Handle messages from clients (e.g. preload model, check cache status)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
