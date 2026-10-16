/**
 * Service Worker for SmartRegexInput AI model caching — CLEANUP ONLY.
 *
 * This SW used to intercept huggingface.co fetches and cache them in
 * 'transformers-models-v1'. That duplicated every model byte: Transformers.js
 * already caches via the Cache API (env.useBrowserCache → 'transformers-cache').
 * The SW layer is retired — model files now live only in 'transformers-cache'.
 *
 * On activate: delete the redundant SW-owned stores, then unregister.
 * Browsers fetch this updated script on the next navigation, so existing
 * clients converge automatically. No fetch handler = pure pass-through.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) =>
            name.startsWith('transformers-models-') ||
            name.startsWith('webllm-models-'),
          )
          .map((name) => caches.delete(name)),
      );
      await self.registration.unregister();
    })(),
  );
});
